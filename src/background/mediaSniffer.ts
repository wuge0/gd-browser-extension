import type { ExtensionSettings, MediaItem, MediaVariant, SiteRule } from '@/shared/types';
import { getDomain } from '@/shared/utils/urlParser';
import {
  isHlsContent,
  isMasterPlaylist,
  parseMasterPlaylist,
  parseMediaPlaylist
} from '@/shared/utils/hlsParser';

/**
 * 判断站点规则是否显式关闭了该页面的流媒体嗅探
 */
function isSniffingDisabledForSite(rules: SiteRule[] | undefined, pageUrl: string): boolean {
  if (!rules || rules.length === 0) {
    return false;
  }
  const domain = getDomain(pageUrl);
  if (!domain) {
    return false;
  }
  return rules.some((r) => {
    const d = r.domain.toLowerCase();
    return (domain === d || domain.endsWith('.' + d)) && r.sniffing === false;
  });
}

/**
 * 流媒体嗅探：捕获 HLS/DASH manifest，解析档位，分片批量下发 aria2
 */

export interface MediaSnifferDeps {
  // 批量下发下载任务
  addUris: (tasks: Array<{ url: string; options: Record<string, any> }>) => Promise<void>;
  isConnected: () => boolean;
  getSettings: () => Promise<ExtensionSettings>;
}

let deps: MediaSnifferDeps | null = null;
let initialized = false;

/**
 * 已捕获的流媒体条目（内存 Map，按 tabId+manifestUrl 去重）
 */
const mediaItems = new Map<string, MediaItem>();

function itemKey(tabId: number, manifestUrl: string): string {
  return `${tabId}::${manifestUrl}`;
}

/**
 * 将页面标题清理为可用的目录名
 */
export function sanitizeDirName(title: string): string {
  const cleaned = (title || 'video')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .trim()
    .slice(0, 80);
  return cleaned || 'video';
}

/**
 * 从 URL 提取扩展名（含点），无则返回空串
 */
function extractExt(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const seg = pathname.split('/').pop() || '';
    const m = seg.match(/\.[a-zA-Z0-9]+$/);
    return m ? m[0] : '';
  } catch {
    return '';
  }
}

/**
 * 为分片列表构建 aria2 下载任务（out 按序号补零，dir 归组）
 */
export function buildSegmentTasks(
  segments: string[],
  dir: string,
  headers: string[]
): Array<{ url: string; options: Record<string, any> }> {
  const pad = Math.max(3, String(segments.length).length);
  return segments.map((url, index) => {
    const ext = extractExt(url) || '.ts';
    const out = `${String(index).padStart(pad, '0')}${ext}`;
    const options: Record<string, any> = { dir, out };
    if (headers.length > 0) {
      options.header = headers;
    }
    return { url, options };
  });
}

/**
 * 拉取文本内容
 */
async function fetchText(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      return null;
    }
    return await resp.text();
  } catch {
    return null;
  }
}

/**
 * 处理嗅探到的 manifest 候选（来自 webRequest 或 MAIN world 注入）
 */
export async function handleManifestCandidate(
  manifestUrl: string,
  tabId: number,
  pageUrl: string,
  pageTitle: string
): Promise<void> {
  if (!deps) {
    return;
  }
  const settings = await deps.getSettings();
  if (!settings.mediaSniffingEnabled) {
    return;
  }

  // 站点规则：本站 sniffing 显式关闭则跳过
  if (pageUrl && isSniffingDisabledForSite(settings.siteRules, pageUrl)) {
    return;
  }

  const key = itemKey(tabId, manifestUrl);
  if (mediaItems.has(key)) {
    return; // 已捕获，去重
  }

  const isDash = /\.mpd(\?|$)/i.test(manifestUrl);
  let variants: MediaVariant[] = [];
  let type: 'hls' | 'dash' = isDash ? 'dash' : 'hls';

  if (!isDash) {
    const content = await fetchText(manifestUrl);
    if (!content || !isHlsContent(content)) {
      return; // 非 HLS 内容，忽略
    }
    if (isMasterPlaylist(content)) {
      variants = parseMasterPlaylist(content, manifestUrl);
    } else {
      // media playlist：作为单一"原画"档位，URL 指向 manifest 自身
      variants = [{ url: manifestUrl, bandwidth: 0, name: 'auto' }];
    }
  }

  const item: MediaItem = {
    id: key,
    tabId,
    pageUrl,
    pageTitle: pageTitle || pageUrl,
    manifestUrl,
    type,
    variants,
    timestamp: Date.now()
  };
  mediaItems.set(key, item);
  await persistItems();

  // 通知 popup（未打开则忽略）
  chrome.runtime.sendMessage({ action: 'mediaCaptured', item }).catch(() => {});
}

/**
 * 网络层分流入口：由 tabId 反查页面 URL/标题后交给候选处理
 */
export async function handleNetworkManifest(manifestUrl: string, tabId: number): Promise<void> {
  if (tabId < 0) {
    return;
  }
  let pageUrl = '';
  let pageTitle = '';
  try {
    const tab = await chrome.tabs.get(tabId);
    pageUrl = tab.url || '';
    pageTitle = tab.title || '';
  } catch {
    // 无法取标签信息时用空值
  }
  await handleManifestCandidate(manifestUrl, tabId, pageUrl, pageTitle);
}

/**
 * 返回全部已捕获的流媒体条目
 */
export function getMediaItems(): MediaItem[] {
  return Array.from(mediaItems.values());
}

/**
 * 下发指定条目的指定档位到 aria2（分片批量）
 */
export async function downloadMedia(mediaId: string, variantIndex: number): Promise<{ ok: boolean; error?: string }> {
  if (!deps) {
    return { ok: false, error: 'not ready' };
  }
  if (!deps.isConnected()) {
    return { ok: false, error: 'GDownload not connected' };
  }

  const item = mediaItems.get(mediaId);
  if (!item) {
    return { ok: false, error: 'media not found' };
  }
  if (item.type === 'dash') {
    return { ok: false, error: 'DASH not supported yet' };
  }
  const variant = item.variants[variantIndex];
  if (!variant) {
    return { ok: false, error: 'variant not found' };
  }

  // 拉取该档位的 media playlist 取分片
  const content = await fetchText(variant.url);
  if (!content) {
    return { ok: false, error: 'failed to fetch playlist' };
  }
  const media = parseMediaPlaylist(content, variant.url);
  if (media.encrypted) {
    return { ok: false, error: 'ENCRYPTED' }; // 加密流本阶段不支持，UI 侧提示
  }
  if (media.segments.length === 0) {
    return { ok: false, error: 'no segments' };
  }

  const settings = await deps.getSettings();
  const headers = buildHeaders(item.pageUrl, settings);
  const dir = sanitizeDirName(item.pageTitle);
  const tasks = buildSegmentTasks(media.segments, dir, headers);

  await deps.addUris(tasks);
  return { ok: true };
}

/**
 * 按隐私开关构建请求头
 */
function buildHeaders(pageUrl: string, settings: ExtensionSettings): string[] {
  const headers: string[] = [];
  if (settings.sendReferer && pageUrl) {
    headers.push(`Referer: ${pageUrl}`);
  }
  if (settings.sendUserAgent && typeof navigator !== 'undefined' && navigator.userAgent) {
    headers.push(`User-Agent: ${navigator.userAgent}`);
  }
  return headers;
}

/**
 * 清理指定标签页的流媒体条目
 */
export function clearTabMedia(tabId: number): void {
  for (const [key, item] of mediaItems.entries()) {
    if (item.tabId === tabId) {
      mediaItems.delete(key);
    }
  }
  void persistItems();
}

/**
 * 镜像到 session storage，供 popup 读取与 SW 重启恢复
 */
async function persistItems(): Promise<void> {
  try {
    await chrome.storage.session?.set({ mediaItems: getMediaItems() });
  } catch {
    // 忽略
  }
}

/**
 * 从 session storage 恢复（SW 重启后）
 */
async function restoreItems(): Promise<void> {
  try {
    const data = await chrome.storage.session?.get('mediaItems');
    const stored: MediaItem[] = data?.mediaItems || [];
    for (const item of stored) {
      mediaItems.set(item.id, item);
    }
  } catch {
    // 忽略
  }
}

/**
 * 初始化流媒体嗅探（注入依赖 + 注册标签页清理）
 */
export function initMediaSniffer(injected: MediaSnifferDeps): void {
  deps = injected;
  if (initialized) {
    return;
  }
  initialized = true;

  void restoreItems();

  chrome.tabs.onRemoved.addListener((tabId) => {
    clearTabMedia(tabId);
  });

  console.log('[MediaSniffer] Media sniffer initialized');
}
