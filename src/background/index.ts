import { Aria2RpcClient } from './aria2RpcClient';
import { initNetworkSniffer } from './networkSniffer';
import { initDownloadTaker, markBypassNext } from './downloadTaker';
import { initMediaSniffer, getMediaItems, downloadMedia, handleNetworkManifest } from './mediaSniffer';
import { initSettingsSync } from './settingsSync';
import { browserApi } from '@/shared/utils/browserApi';
import { DEFAULT_ARIA2_CONFIG, STORAGE_KEYS, DEFAULT_SETTINGS } from '@/shared/constants';
import { sanitizeFilename } from '@/shared/utils/urlParser';
import type { ExtensionSettings, Message, MessageResponse, Link, SendResult, ActiveTask } from '@/shared/types';

/**
 * 全局 aria2 客户端实例
 */
let aria2Client: Aria2RpcClient | null = null;

function mergeSettings(settings: Partial<ExtensionSettings> | undefined): ExtensionSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    aria2Config: {
      ...DEFAULT_ARIA2_CONFIG,
      ...(settings?.aria2Config || {})
    }
  };
}

async function recreateAria2Client(config = DEFAULT_ARIA2_CONFIG) {
  if (aria2Client) {
    aria2Client.disconnect();
  }

  aria2Client = new Aria2RpcClient(config);
  wireClientEvents(aria2Client);

  if (config.autoConnect) {
    await aria2Client.connect();
    console.log('aria2 client connected');
  }
}

/**
 * 读取合并后的扩展设置
 */
async function loadSettings(): Promise<ExtensionSettings> {
  const result = await browserApi.storage.get([STORAGE_KEYS.SETTINGS]);
  return mergeSettings(result[STORAGE_KEYS.SETTINGS]);
}

/**
 * 为 aria2 客户端挂载通知订阅与连接状态广播
 * 每次重建客户端都需重新挂载
 */
function wireClientEvents(client: Aria2RpcClient) {
  // 任务开始：活动计数 +1
  client.onNotification('aria2.onDownloadStart', () => {
    void bumpActiveCount(1);
  });
  // 任务完成：计数 -1 并弹通知
  client.onNotification('aria2.onDownloadComplete', (params) => {
    void handleTaskFinished(client, params, 'complete');
  });
  client.onNotification('aria2.onBtDownloadComplete', (params) => {
    void handleTaskFinished(client, params, 'complete');
  });
  // 任务出错：计数 -1 并弹错误通知
  client.onNotification('aria2.onDownloadError', (params) => {
    void handleTaskFinished(client, params, 'error');
  });
  // 任务被移除：仅计数 -1
  client.onNotification('aria2.onDownloadStop', () => {
    void bumpActiveCount(-1);
  });

  // 连接状态变化：广播给 UI，连上后用 tellActive 校准角标
  client.onConnectionStateChange((connected) => {
    chrome.runtime.sendMessage({ action: 'connectionStateChanged', connected }).catch(() => {
      // popup 未打开时无接收方，忽略
    });
    if (connected) {
      void calibrateActiveCount(client);
    }
  });
}

/**
 * 读取活动任务计数（存于 session storage，SW 重启后仍在）
 */
async function getActiveCount(): Promise<number> {
  try {
    const r = await chrome.storage.session.get('activeTaskCount');
    return typeof r.activeTaskCount === 'number' ? r.activeTaskCount : 0;
  } catch {
    return 0;
  }
}

/**
 * 设置活动任务计数并刷新角标
 */
async function setActiveCount(count: number): Promise<void> {
  const value = Math.max(0, count);
  try {
    await chrome.storage.session.set({ activeTaskCount: value });
  } catch {
    // session storage 不可用时忽略持久化
  }
  try {
    await chrome.action.setBadgeText({ text: value > 0 ? String(value) : '' });
    await chrome.action.setBadgeBackgroundColor({ color: '#409EFF' });
  } catch {
    // action API 不可用时忽略
  }
}

/**
 * 活动任务计数增量更新
 */
async function bumpActiveCount(delta: number): Promise<void> {
  await setActiveCount((await getActiveCount()) + delta);
}

/**
 * 用 aria2.tellActive 校准角标计数，避免事件丢失导致漂移
 */
async function calibrateActiveCount(client: Aria2RpcClient): Promise<void> {
  try {
    const active = await client.call('aria2.tellActive', ['gid']);
    await setActiveCount(Array.isArray(active) ? active.length : 0);
  } catch {
    // 校准失败不影响功能
  }
}

/**
 * 处理任务完成/出错：计数 -1 并弹浏览器通知（标题取文件名）
 */
async function handleTaskFinished(
  client: Aria2RpcClient,
  params: any,
  kind: 'complete' | 'error'
): Promise<void> {
  await bumpActiveCount(-1);

  const settings = await loadSettings();
  if (!settings.showNotifications) {
    return;
  }

  const gid: string | undefined = params?.[0]?.gid;
  let filename = 'Download';
  try {
    if (gid) {
      const status = await client.call('aria2.tellStatus', gid, ['files']);
      const filePath: string | undefined = status?.files?.[0]?.path;
      if (filePath) {
        filename = filePath.split(/[\\/]/).pop() || filename;
      }
    }
  } catch {
    // 取文件名失败时用占位标题
  }

  const title = kind === 'complete'
    ? (chrome.i18n.getMessage('notifyDownloadComplete') || 'Download complete')
    : (chrome.i18n.getMessage('notifyDownloadError') || 'Download failed');

  try {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
      title,
      message: filename
    });
  } catch (error) {
    console.debug('[Notification] create failed:', error);
  }
}

/**
 * 初始化 aria2 客户端
 */
async function initAria2Client() {
  try {
    const settings = await browserApi.storage.get([STORAGE_KEYS.SETTINGS]);
    const config = mergeSettings(settings[STORAGE_KEYS.SETTINGS]).aria2Config;

    await recreateAria2Client(config);
  } catch (error) {
    console.error('Failed to initialize aria2 client:', error);
  }
}

/**
 * 初始化连接层：手动模式，按用户在设置里保存的 aria2 RPC 配置直接连接
 * （原 native messaging 自动配对已随桌面端 host 一并移除）
 */
function initConnection() {
  void initAria2Client();
}

/**
 * 创建右键菜单
 */
function createContextMenus() {
  chrome.contextMenus.create({
    id: 'download-with-gdownload',
    title: chrome.i18n.getMessage('contextMenuDownload'),
    contexts: ['link', 'image', 'video', 'audio']
  });

  chrome.contextMenus.create({
    id: 'download-all-links',
    title: chrome.i18n.getMessage('contextMenuDownloadAll'),
    contexts: ['page']
  });
}

/**
 * 处理右键菜单点击
 */
async function handleContextMenuClick(
  info: chrome.contextMenus.OnClickData,
  tab?: chrome.tabs.Tab
) {
  if (info.menuItemId === 'download-with-gdownload') {
    const url = info.linkUrl || info.srcUrl;
    if (url && tab?.id) {
      await sendToGDownload([{
        id: Date.now().toString(),
        url,
        filename: url.split('/').pop() || 'download',
        size: null,
        fileType: '',
        selected: true,
        capturedAt: Date.now(),
        source: 'contextMenu'
      }]);
    }
  } else if (info.menuItemId === 'download-all-links' && tab?.id) {
    // 发送消息到 Content Script 捕获所有链接
    chrome.tabs.sendMessage(
      tab.id,
      { action: 'captureAllLinks' },
      () => {
        if (chrome.runtime.lastError) {
          console.debug('[ContextMenu] captureAllLinks message failed:', chrome.runtime.lastError.message);
        }
      }
    );
  }
}

/**
 * 发送链接到 GDownload
 * 返回每个链接的发送结果，一个失败不影响其他链接
 */
async function sendToGDownload(links: Link[]): Promise<SendResult[]> {
  if (!aria2Client) {
    throw new Error('aria2 client not initialized');
  }

  // 获取用户设置
  const result = await browserApi.storage.get([STORAGE_KEYS.SETTINGS]);
  const settings = mergeSettings(result[STORAGE_KEYS.SETTINGS]);

  const results: SendResult[] = [];
  const seenFilenames = new Set<string>();

  for (const link of links) {
    if (!link.selected) {
      continue;
    }

    try {
      // 1. 清理并去重文件名
      let filename = sanitizeFilename(link.filename);

      // 处理文件名重复
      let counter = 1;
      const originalFilename = filename;
      const lastDotIndex = filename.lastIndexOf('.');
      const baseName = lastDotIndex > 0 ? filename.substring(0, lastDotIndex) : filename;
      const ext = lastDotIndex > 0 ? filename.substring(lastDotIndex) : '';

      while (seenFilenames.has(filename)) {
        filename = `${baseName}_${counter}${ext}`;
        counter++;
      }
      seenFilenames.add(filename);

      // 2. 构建 aria2 选项
      const options: Record<string, any> = {
        out: filename
      };

      // 3. 构建请求头数组（根据用户设置决定是否发送）
      const headers: string[] = [];

      // User-Agent (通常安全，默认发送)；兜底用浏览器自身 UA，避免 aria2 默认 UA 被服务器拒
      const effectiveUserAgent = link.userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : '');
      if (effectiveUserAgent && settings.sendUserAgent) {
        headers.push(`User-Agent: ${effectiveUserAgent}`);
      }

      // Referer (对于受保护资源很重要，默认发送)
      if (link.referer && settings.sendReferer) {
        headers.push(`Referer: ${link.referer}`);
      }

      // Cookie (敏感信息，需要用户明确授权，默认关闭)
      if (link.cookies && settings.sendCookies) {
        headers.push(`Cookie: ${link.cookies}`);
      }

      // Authorization (敏感信息，需要用户明确授权，默认关闭)
      if (link.authorization && settings.sendAuthorization) {
        headers.push(`Authorization: ${link.authorization}`);
      }

      // 如果有请求头，添加到选项中
      if (headers.length > 0) {
        options.header = headers;
      }

      // 4. 调用 aria2 添加下载
      // 注意：aria2.addUri 的第一个参数是 URL 数组 [url]，不是嵌套数组
      const gid = await aria2Client.call('aria2.addUri', [link.url], options);

      console.log(`[SendToGDownload] ✓ Added: ${filename} (GID: ${gid})`);
      results.push({ link, success: true, gid });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[SendToGDownload] ✗ Failed: ${link.filename}`, errorMessage);
      results.push({
        link,
        success: false,
        error: errorMessage
      });
    }
  }

  // 输出汇总统计
  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;
  console.log(`[SendToGDownload] Summary: ${successCount} succeeded, ${failCount} failed`);

  return results;
}

/**
 * 将 aria2 状态对象转换为 popup 用的 ActiveTask（派生文件名）
 */
function toActiveTask(status: any): ActiveTask {
  const filePath: string | undefined = status?.files?.[0]?.path;
  let filename = '';
  if (filePath) {
    filename = filePath.split(/[\\/]/).pop() || '';
  }
  if (!filename) {
    // 无文件名时回退到 URI 末段或 gid
    const uri: string | undefined = status?.files?.[0]?.uris?.[0]?.uri;
    if (uri) {
      try {
        filename = decodeURIComponent(new URL(uri).pathname.split('/').pop() || '');
      } catch {
        filename = '';
      }
    }
  }
  return {
    gid: status.gid,
    status: status.status,
    totalLength: status.totalLength || '0',
    completedLength: status.completedLength || '0',
    downloadSpeed: status.downloadSpeed || '0',
    filename: filename || status.gid
  };
}

/**
 * 处理来自其他组件的消息
 */
async function handleMessage(
  message: Message,
  sender: chrome.runtime.MessageSender
): Promise<MessageResponse> {
  try {
    switch (message.action) {
      case 'sendToGDownload': {
        const results = await sendToGDownload(message.links);
        const successCount = results.filter(r => r.success).length;
        const failCount = results.filter(r => !r.success).length;
        const errors = results.filter(r => !r.success).map(r => ({
          filename: r.link.filename,
          error: r.error
        }));

        // 只有全部成功时才返回 success: true
        // 部分失败或全部失败都返回 success: false
        return {
          success: failCount === 0,
          error: failCount > 0 ? `${failCount} link(s) failed to send` : undefined,
          data: {
            total: results.length,
            succeeded: successCount,
            failed: failCount,
            errors: errors.length > 0 ? errors : undefined,
            results // 完整的结果列表，供 UI 展示详细信息
          }
        };
      }

      case 'testConnection': {
        // 优先测试表单传入的配置（无需先保存）；否则测当前已保存配置
        if (message.config) {
          const tempClient = new Aria2RpcClient(message.config);
          try {
            await tempClient.connect();
            const stats = await tempClient.call('aria2.getGlobalStat');
            return { success: true, data: stats };
          } finally {
            tempClient.disconnect();
          }
        }
        await initAria2Client();
        const stats = await aria2Client!.call('aria2.getGlobalStat');
        return { success: true, data: stats };
      }

      case 'getConnectionStatus':
        return {
          success: true,
          data: {
            connected: aria2Client?.isConnected() || false,
            readyState: aria2Client?.getReadyState() || WebSocket.CLOSED
          }
        };

      case 'bypassNext':
        // 内容脚本 Alt+点击 -> 下一个下载放行浏览器
        markBypassNext();
        return { success: true };

      case 'getConnectionInfo':
        return {
          success: true,
          data: {
            connected: aria2Client?.isConnected() || false
          }
        };

      case 'getMediaItems':
        return { success: true, data: { items: getMediaItems() } };

      case 'downloadMedia': {
        const result = await downloadMedia(message.mediaId, message.variantIndex);
        return result.ok
          ? { success: true }
          : { success: false, error: result.error };
      }

      case 'manifestCandidate': {
        // 来自 MAIN world 注入经内容脚本中转的 manifest 上报
        const tabId = sender.tab?.id ?? -1;
        if (tabId >= 0) {
          void handleNetworkManifest(message.url, tabId);
        }
        return { success: true };
      }

      case 'batchLinksCaptured': {
        // 拖框选链结果存入 session networkLinks，popup 打开时合并显示
        try {
          const now = Date.now();
          const newLinks: Link[] = message.links.map((l, i) => ({
            id: `drag_${now}_${i}`,
            url: l.url,
            filename: sanitizeFilename(l.filename),
            size: null,
            fileType: l.filename.match(/\.[^.]+$/)?.[0] || '',
            selected: true,
            capturedAt: now,
            source: 'page'
          }));
          const { networkLinks = [] } = await chrome.storage.session.get('networkLinks');
          const merged = [...networkLinks, ...newLinks].slice(-100);
          await chrome.storage.session.set({ networkLinks: merged });
        } catch (error) {
          console.debug('[BatchCapture] store failed:', error);
        }
        return { success: true };
      }

      case 'floatButtonDownload': {
        // 优先关联该标签页最近捕获的流媒体，否则直发视频 src
        const tabId = sender.tab?.id ?? -1;
        const tabMedia = getMediaItems()
          .filter((m) => m.tabId === tabId && m.type === 'hls' && m.variants.length > 0)
          .sort((a, b) => b.timestamp - a.timestamp);
        if (tabMedia.length > 0) {
          const result = await downloadMedia(tabMedia[0].id, 0); // index 0 = 最高码率
          return result.ok ? { success: true } : { success: false, error: result.error };
        }
        const src = message.videoSrc;
        if (src && /^https?:/i.test(src)) {
          const results = await sendToGDownload([{
            id: Date.now().toString(),
            url: src,
            filename: sanitizeFilename(src.split('/').pop()?.split('?')[0] || 'video'),
            size: null,
            fileType: '',
            selected: true,
            capturedAt: Date.now(),
            source: 'page'
          }]);
          return results[0]?.success
            ? { success: true }
            : { success: false, error: results[0]?.error || 'send failed' };
        }
        return { success: false, error: 'no downloadable media' };
      }

      case 'getActiveTasks': {
        if (!aria2Client || !aria2Client.isConnected()) {
          return { success: true, data: { tasks: [] } };
        }
        // 并行取活动任务 + 等待队列（前 20 条），避免 multicall 的 token 包裹复杂度
        const keys = ['gid', 'status', 'totalLength', 'completedLength', 'downloadSpeed', 'files'];
        const [active, waiting] = await Promise.all([
          aria2Client.call('aria2.tellActive', keys),
          aria2Client.call('aria2.tellWaiting', 0, 20, keys)
        ]);
        const tasks: ActiveTask[] = [
          ...(Array.isArray(active) ? active : []),
          ...(Array.isArray(waiting) ? waiting : [])
        ].map(toActiveTask);
        return { success: true, data: { tasks } };
      }

      case 'pauseTask':
        if (!aria2Client) return { success: false, error: 'Not connected' };
        await aria2Client.call('aria2.pause', message.gid);
        return { success: true };

      case 'resumeTask':
        if (!aria2Client) return { success: false, error: 'Not connected' };
        await aria2Client.call('aria2.unpause', message.gid);
        return { success: true };

      case 'cancelTask':
        if (!aria2Client) return { success: false, error: 'Not connected' };
        await aria2Client.call('aria2.remove', message.gid);
        return { success: true };

      default:
        return { success: false, error: 'Unknown action' };
    }
  } catch (error) {
    console.error('Message handler error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * 扩展安装/更新时的处理
 */
chrome.runtime.onInstalled.addListener(() => {
  console.log('GDownload Extension installed');
  createContextMenus();
  initNetworkSniffer(); // 初始化网络嗅探
});

/**
 * 扩展启动时的处理
 */
chrome.runtime.onStartup.addListener(() => {
  console.log('GDownload Extension started');
  initNetworkSniffer(); // 初始化网络嗅探
});

/**
 * 保活 alarm：定期心跳，兼任 SW 被回收后唤醒的重连触发器
 * 注：Chrome/Firefox 对 alarm 周期有最小值（约 0.5 分钟），低于此值会被上调
 */
const KEEPALIVE_ALARM = 'aria2-keepalive';
chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 0.5 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== KEEPALIVE_ALARM) {
    return;
  }
  if (!aria2Client) {
    // 连接层尚未就绪（native 发现/配对进行中）-> 触发初始化
    initConnection();
    return;
  }
  if (aria2Client.isConnected()) {
    // 已连接：发心跳保持 SW 存活
    aria2Client.call('aria2.getGlobalStat').catch(() => {
      // 心跳失败会触发 onclose -> 自动重连
    });
  } else {
    // 断线：立即发起重连
    aria2Client.reconnectNow();
  }
});

/**
 * 初始化连接层：native 优先，host 不可用降级手动（顶层执行，覆盖每次 SW 加载）
 */
initConnection();

/**
 * 初始化设置跨设备同步（local <-> sync 镜像，secret 永不同步）
 */
initSettingsSync();

/**
 * 初始化流媒体嗅探（分片下发依赖惰性读取 aria2Client）
 */
initMediaSniffer({
  addUris: async (tasks) => {
    if (!aria2Client) {
      throw new Error('aria2 client not initialized');
    }
    await Promise.all(
      tasks.map((task) => aria2Client!.call('aria2.addUri', [task.url], task.options))
    );
  },
  isConnected: () => aria2Client?.isConnected() ?? false,
  getSettings: loadSettings
});

/**
 * 初始化下载接管（顶层注册一次，依赖惰性读取 aria2Client）
 */
initDownloadTaker({
  dispatch: (links) => sendToGDownload(links),
  isConnected: () => aria2Client?.isConnected() ?? false,
  removeTask: async (gid) => {
    await aria2Client?.call('aria2.remove', gid);
  }
});

/**
 * 键盘快捷键：Ctrl+Shift+M 打开媒体面板
 * 记录目标 Tab 到 session，popup 打开时读取并切换；并尝试直接打开 popup
 */
chrome.commands.onCommand.addListener((command) => {
  if (command !== 'open_media_panel') {
    return;
  }
  chrome.storage.session?.set({ popupTab: 'media' }).catch(() => {});
  // chrome.action.openPopup 需 Chrome 127+，可能不可用，best-effort
  (chrome.action as any).openPopup?.().catch?.(() => {});
});

/**
 * 右键菜单点击监听
 */
chrome.contextMenus.onClicked.addListener(handleContextMenuClick);

browserApi.storage.onChanged.addListener((changes: Record<string, chrome.storage.StorageChange>, areaName?: chrome.storage.AreaName) => {
  if (areaName !== 'sync' && areaName !== 'local') {
    return;
  }

  const settingsChange = changes[STORAGE_KEYS.SETTINGS];
  if (!settingsChange) {
    return;
  }

  const oldConfig = mergeSettings(settingsChange.oldValue).aria2Config;
  const newConfig = mergeSettings(settingsChange.newValue).aria2Config;
  if (JSON.stringify(oldConfig) !== JSON.stringify(newConfig)) {
    recreateAria2Client(newConfig).catch(error => {
      console.error('Failed to recreate aria2 client after settings change:', error);
    });
  }
});

/**
 * 消息监听
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch(error => {
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    });
  
  // 返回 true 表示异步响应
  return true;
});
