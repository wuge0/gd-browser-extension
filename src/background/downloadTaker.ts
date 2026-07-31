import type { Link, ExtensionSettings, SendResult } from '@/shared/types';
import { browserApi } from '@/shared/utils/browserApi';
import { STORAGE_KEYS, DEFAULT_SETTINGS } from '@/shared/constants';
import { decideTakeover } from './takeoverPolicy';
import { lookupRequestContext } from './networkSniffer';

/**
 * 下载接管所需的外部依赖（由 background 入口注入，避免循环依赖）
 */
export interface DownloadTakerDeps {
  // 派发链接到 GDownload（返回每条链接的发送结果）
  dispatch: (links: Link[]) => Promise<SendResult[]>;
  // 当前 aria2 是否已连接（离线放行，决不丢下载）
  isConnected: () => boolean;
  // 移除 aria2 任务（用于"改用浏览器下载"回退）
  removeTask?: (gid: string) => Promise<void>;
}

let deps: DownloadTakerDeps | null = null;

/**
 * Alt 绕过标记：内容脚本上报后 3s 内的下载放行浏览器
 */
let bypassUntil = 0;
const BYPASS_TTL = 3000;

/**
 * 标记下一个下载绕过接管（由内容脚本 Alt+点击触发）
 */
export function markBypassNext() {
  bypassUntil = Date.now() + BYPASS_TTL;
}

/**
 * "改用浏览器下载"通知按钮的上下文：notificationId -> {url, gid}
 */
const fallbackContext = new Map<string, { url: string; gid?: string }>();

/**
 * 读取合并后的设置
 */
async function getSettings(): Promise<ExtensionSettings> {
  const result = await browserApi.storage.get([STORAGE_KEYS.SETTINGS]);
  const stored = result[STORAGE_KEYS.SETTINGS] as Partial<ExtensionSettings> | undefined;
  return { ...DEFAULT_SETTINGS, ...(stored || {}) };
}

/**
 * 判定是否接管该下载（薄封装：组装输入交给纯判定 decideTakeover）
 */
function shouldTakeover(
  item: chrome.downloads.DownloadItem,
  settings: ExtensionSettings
): boolean {
  const targetUrl = item.finalUrl || item.url;
  const size = item.fileSize > 0 ? item.fileSize : (item.totalBytes > 0 ? item.totalBytes : -1);

  // Alt 绕过标记：命中即一次性消费
  const bypassActive = Date.now() < bypassUntil;
  if (bypassActive) {
    bypassUntil = 0;
  }

  return decideTakeover(
    {
      url: targetUrl,
      mime: item.mime,
      byExtensionId: item.byExtensionId,
      size,
      isConnected: deps ? deps.isConnected() : false,
      bypassActive
    },
    settings
  );
}

/**
 * 从下载项 + 反查上下文构建 Link
 */
function buildLink(item: chrome.downloads.DownloadItem): Link {
  // 优先用原始 URL 而非 finalUrl：finalUrl 是浏览器已解析、常绑定 IP+签名 token 的
  // 一次性 CDN 地址（如腾讯/百度等国内 CDN），浏览器消费后 aria2 再请求会失效导致 0 字节；
  // 用原始 URL 让 aria2 自己重新走 302 拿到新的有效地址。
  const url = item.url || item.finalUrl;
  const ctx = lookupRequestContext(url) || lookupRequestContext(item.finalUrl);

  // 文件名：优先下载项自带（浏览器已解析 Content-Disposition），其次 URL 末段
  let filename = '';
  if (item.filename) {
    filename = item.filename.split(/[\\/]/).pop() || '';
  }
  if (!filename) {
    try {
      filename = decodeURIComponent(new URL(url).pathname.split('/').pop() || '');
    } catch {
      filename = '';
    }
  }
  if (!filename) {
    filename = 'download';
  }

  return {
    id: `takeover_${item.id}_${Date.now()}`,
    url,
    filename,
    size: item.totalBytes > 0 ? item.totalBytes : (item.fileSize > 0 ? item.fileSize : null),
    fileType: filename.match(/\.[^.]+$/)?.[0] || '',
    selected: true,
    capturedAt: Date.now(),
    source: 'page',
    // Referer 优先取下载项自带，其次反查上下文
    referer: item.referrer || ctx?.referer,
    // UA 兜底用浏览器自身 UA，避免 aria2 默认 UA 被服务器（防盗链/国内 CDN）拒绝导致 0 字节
    userAgent: ctx?.userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : undefined),
    cookies: ctx?.cookies,
    authorization: ctx?.authorization,
    contentType: item.mime || ctx?.contentType,
    acceptRanges: ctx?.acceptRanges
  };
}

/**
 * 弹出接管通知（带"改用浏览器下载"按钮）
 */
function notifyTakeover(link: Link, gid?: string) {
  const notifId = `takeover_${gid || link.id}`;
  fallbackContext.set(notifId, { url: link.url, gid });
  // 防止长会话下无界增长：超过上限时淘汰最旧条目
  while (fallbackContext.size > 50) {
    const oldest = fallbackContext.keys().next().value;
    if (oldest === undefined) {
      break;
    }
    fallbackContext.delete(oldest);
  }

  const title = chrome.i18n.getMessage('notifyTakeoverTitle') || 'Sent to GDownload';
  const buttonTitle = chrome.i18n.getMessage('notifyUseBrowserDownload') || 'Download in browser instead';

  try {
    chrome.notifications.create(notifId, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
      title,
      message: link.filename,
      buttons: [{ title: buttonTitle }]
    });
  } catch (error) {
    console.debug('[DownloadTaker] notify failed:', error);
  }
}

/**
 * 弹出接管失败回退通知
 */
function notifyFallback(filename: string, error?: string) {
  const title = chrome.i18n.getMessage('notifyTakeoverFailed') || 'Takeover failed, using browser';
  try {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
      title,
      message: error ? `${filename}: ${error}` : filename
    });
  } catch (e) {
    console.debug('[DownloadTaker] fallback notify failed:', e);
  }
}

/**
 * chrome.downloads.onCreated 处理：判定 -> 取消并擦除 -> 派发 GDownload -> 失败回退
 */
async function onDownloadCreated(item: chrome.downloads.DownloadItem) {
  if (!deps) {
    return;
  }

  let settings: ExtensionSettings;
  try {
    settings = await getSettings();
  } catch {
    return;
  }

  if (!shouldTakeover(item, settings)) {
    return;
  }

  // 取消并从浏览器下载列表擦除；失败说明已完成/已处理，放行
  try {
    await chrome.downloads.cancel(item.id);
    await chrome.downloads.erase({ id: item.id });
  } catch {
    return;
  }

  const link = buildLink(item);

  let results: SendResult[];
  try {
    results = await deps.dispatch([link]);
  } catch (error) {
    results = [{ link, success: false, error: error instanceof Error ? error.message : String(error) }];
  }

  const result = results[0];
  if (result?.success) {
    if (settings.showNotifications) {
      notifyTakeover(link, result.gid);
    }
  } else {
    // 回退浏览器下载（byExtensionId 为本扩展，不会二次接管）
    try {
      await chrome.downloads.download({ url: link.url });
    } catch (e) {
      console.error('[DownloadTaker] fallback download failed:', e);
    }
    if (settings.showNotifications) {
      notifyFallback(link.filename, result?.error);
    }
  }
}

/**
 * 通知按钮点击："改用浏览器下载"：移除 aria2 任务并回退浏览器下载
 */
async function onNotificationButtonClicked(notificationId: string, buttonIndex: number) {
  const ctx = fallbackContext.get(notificationId);
  if (!ctx || buttonIndex !== 0) {
    return;
  }
  fallbackContext.delete(notificationId);

  // 移除已派发的 aria2 任务
  if (ctx.gid && deps?.removeTask) {
    try {
      await deps.removeTask(ctx.gid);
    } catch (e) {
      console.debug('[DownloadTaker] remove aria2 task failed:', e);
    }
  }
  // 回退浏览器下载
  try {
    await chrome.downloads.download({ url: ctx.url });
  } catch (e) {
    console.error('[DownloadTaker] browser download fallback failed:', e);
  }
  chrome.notifications.clear(notificationId);
}

let initialized = false;

/**
 * 初始化下载接管（注入依赖并注册监听，幂等）
 */
export function initDownloadTaker(injected: DownloadTakerDeps) {
  deps = injected;

  // 监听器仅注册一次，避免 SW 生命周期内重复触发
  if (initialized) {
    return;
  }
  initialized = true;

  chrome.downloads.onCreated.addListener((item) => {
    void onDownloadCreated(item);
  });

  chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
    void onNotificationButtonClicked(notificationId, buttonIndex);
  });

  console.log('[DownloadTaker] Download taker initialized');
}
