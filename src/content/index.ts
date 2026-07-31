import { LinkCaptureService } from './linkCapture';
import { initFloatButton } from './floatButton';
import { captureImages, startDragSelect } from './batchCapture';
import { browserApi } from '@/shared/utils/browserApi';
import { STORAGE_KEYS } from '@/shared/constants';
import type { Link, Message } from '@/shared/types';

/**
 * 链接捕获服务实例
 */
const linkCapture = new LinkCaptureService();

/**
 * 存储捕获的链接
 */
let capturedLinks: Link[] = [];

/**
 * 保存链接到存储
 * 自动去重：相同 URL 的链接只保留最新的一个
 */
async function saveLinks(links: Link[]) {
  // 使用 Map 进行去重，key 为 URL，value 为 Link 对象
  const urlMap = new Map<string, Link>();

  // 先添加现有链接
  capturedLinks.forEach(link => {
    urlMap.set(link.url, link);
  });

  // 添加新链接（如果 URL 相同，新链接会覆盖旧链接，保留最新信息）
  links.forEach(link => {
    urlMap.set(link.url, link);
  });

  // 转换回数组并更新
  capturedLinks = Array.from(urlMap.values());

  await browserApi.storage.set({
    [STORAGE_KEYS.LINKS]: capturedLinks
  });

  console.log(`Captured ${links.length} new links, total: ${capturedLinks.length} (deduplicated)`);
}

/**
 * 处理来自 Background 的消息
 */
chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  if (message.action === 'captureAllLinks') {
    // 停止现有监听
    linkCapture.stopCapture();
    linkCapture.clear();
    capturedLinks = [];

    // 重新捕获
    linkCapture.startCapture((links) => {
      saveLinks(links);
    });

    sendResponse({ success: true });
  } else if (message.action === 'captureImages') {
    // 采集页面图片，直接回传给 popup
    sendResponse({ success: true, images: captureImages() });
  } else if (message.action === 'startDragSelect') {
    startDragSelect();
    sendResponse({ success: true });
  }

  return true;
});

/**
 * 页面加载完成后自动开始捕获
 */
async function init() {
  const settings = await browserApi.storage.get([STORAGE_KEYS.SETTINGS]);
  const autoCapture = settings[STORAGE_KEYS.SETTINGS]?.autoCapture ?? true;
  
  if (autoCapture) {
    linkCapture.startCapture((links) => {
      saveLinks(links);
    });
  }
}

/**
 * 接收 MAIN world 注入脚本上报的 manifest（m3u8/mpd），校验后转发 background
 */
let pinnedNonce: string | null = null;
window.addEventListener('message', (event) => {
  // 仅接受本窗口消息，防跨窗口伪造
  if (event.source !== window) {
    return;
  }
  const data = event.data;
  if (!data || data.__gdownloadInject !== true || typeof data.url !== 'string') {
    return;
  }
  // nonce 首次锁定，后续不一致的一律拒绝（防页面脚本伪造）
  if (pinnedNonce === null) {
    pinnedNonce = data.nonce;
  } else if (data.nonce !== pinnedNonce) {
    return;
  }
  browserApi.runtime.sendMessage({
    action: 'manifestCandidate',
    url: data.url,
    pageUrl: typeof data.pageUrl === 'string' ? data.pageUrl : undefined
  }).catch(() => {
    // background 未就绪时忽略
  });
});

/**
 * Alt+点击链接 -> 通知 background 放行下一个下载（不接管）
 * capture 阶段监听，早于浏览器默认下载动作
 */
document.addEventListener(
  'click',
  (event) => {
    if (!event.altKey) {
      return;
    }
    const target = event.target as Element | null;
    const anchor = target?.closest?.('a[href]');
    if (!anchor) {
      return;
    }
    browserApi.runtime.sendMessage({ action: 'bypassNext' }).catch(() => {
      // background 未就绪时忽略
    });
  },
  true
);

// 页面加载完成时初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// 初始化视频悬浮下载按钮
initFloatButton();
