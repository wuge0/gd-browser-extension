import { browserApi } from '@/shared/utils/browserApi';
import { STORAGE_KEYS, DEFAULT_SETTINGS } from '@/shared/constants';
import type { ExtensionSettings } from '@/shared/types';

/**
 * 视频悬浮下载按钮
 * hover <video> 300ms 后在其右上角显示；点击关联媒体或直发 src；
 * 「×」写 siteRules 使本站不再显示。Shadow DOM 隔离样式，pointer-events 精确控制不干扰页面。
 */

const HOVER_DELAY = 300;
const HIDE_DELAY = 400;

let enabled = true;
let siteDisabled = false;

let hostEl: HTMLElement | null = null;
let shadowRoot: ShadowRoot | null = null;
let btnEl: HTMLElement | null = null;
let closeEl: HTMLElement | null = null;

let currentVideo: HTMLVideoElement | null = null;
let showTimer: ReturnType<typeof setTimeout> | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;
let overlayHovered = false;

function getDomain(): string {
  return location.hostname.toLowerCase();
}

/**
 * 读取悬浮按钮相关配置
 */
async function loadConfig(): Promise<void> {
  try {
    const res = await browserApi.storage.get([STORAGE_KEYS.SETTINGS]);
    const settings: ExtensionSettings = { ...DEFAULT_SETTINGS, ...(res[STORAGE_KEYS.SETTINGS] || {}) };
    enabled = settings.floatButtonEnabled;
    const domain = getDomain();
    siteDisabled = (settings.siteRules || []).some((r) => {
      const d = r.domain.toLowerCase();
      return (domain === d || domain.endsWith('.' + d)) && r.floatButton === false;
    });
    if (!enabled || siteDisabled) {
      removeOverlay();
    }
  } catch {
    // 忽略
  }
}

/**
 * 创建悬浮层（Shadow DOM）
 */
function ensureOverlay(): void {
  if (hostEl) {
    return;
  }
  hostEl = document.createElement('div');
  // 容器不拦截页面事件；仅按钮本身可点击
  hostEl.style.cssText = [
    'position:fixed',
    'z-index:2147483647',
    'top:0',
    'left:0',
    'pointer-events:none',
    'display:none'
  ].join(';');

  shadowRoot = hostEl.attachShadow({ mode: 'open' });
  shadowRoot.innerHTML = `
    <style>
      .wrap { display:flex; align-items:center; gap:4px; pointer-events:none; }
      .btn, .close {
        pointer-events:auto;
        font-family:-apple-system,Segoe UI,Roboto,sans-serif;
        cursor:pointer;
        border-radius:6px;
        box-shadow:0 2px 8px rgba(0,0,0,.3);
        user-select:none;
      }
      .btn {
        display:flex; align-items:center; gap:5px;
        padding:6px 12px;
        background:#409EFF; color:#fff;
        font-size:13px; font-weight:600;
      }
      .btn:hover { background:#66b1ff; }
      .close {
        width:22px; height:22px;
        display:flex; align-items:center; justify-content:center;
        background:rgba(0,0,0,.6); color:#fff; font-size:14px; line-height:1;
      }
      .close:hover { background:rgba(0,0,0,.85); }
    </style>
    <div class="wrap">
      <div class="btn" part="btn">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        <span class="label">GDownload</span>
      </div>
      <div class="close" title="Don't show on this site">&times;</div>
    </div>
  `;

  btnEl = shadowRoot.querySelector('.btn');
  closeEl = shadowRoot.querySelector('.close');

  btnEl?.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    void onDownloadClick();
  });
  closeEl?.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    void disableForSite();
  });

  const wrap = shadowRoot.querySelector('.wrap');
  wrap?.addEventListener('mouseenter', () => {
    overlayHovered = true;
    cancelHide();
  });
  wrap?.addEventListener('mouseleave', () => {
    overlayHovered = false;
    scheduleHide();
  });

  (document.documentElement || document.body).appendChild(hostEl);
}

/**
 * 将悬浮层定位到视频右上角并显示
 */
function positionOverlay(video: HTMLVideoElement): void {
  if (!hostEl) {
    return;
  }
  const rect = video.getBoundingClientRect();
  // 视频过小则不显示（缩略图等）
  if (rect.width < 160 || rect.height < 90) {
    hideNow();
    return;
  }
  hostEl.style.display = 'block';
  // 右上角，内缩 8px
  hostEl.style.top = `${Math.max(0, rect.top + 8)}px`;
  hostEl.style.left = `${Math.max(0, rect.right - 150)}px`;
}

function scheduleShow(): void {
  cancelShow();
  showTimer = setTimeout(() => {
    if (currentVideo && enabled && !siteDisabled) {
      ensureOverlay();
      positionOverlay(currentVideo);
    }
  }, HOVER_DELAY);
}

function cancelShow(): void {
  if (showTimer) {
    clearTimeout(showTimer);
    showTimer = null;
  }
}

function scheduleHide(): void {
  cancelHide();
  hideTimer = setTimeout(() => {
    if (!overlayHovered) {
      hideNow();
    }
  }, HIDE_DELAY);
}

function cancelHide(): void {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
}

function hideNow(): void {
  if (hostEl) {
    hostEl.style.display = 'none';
  }
  currentVideo = null;
}

function removeOverlay(): void {
  cancelShow();
  cancelHide();
  if (hostEl) {
    hostEl.remove();
    hostEl = null;
    shadowRoot = null;
    btnEl = null;
    closeEl = null;
  }
  currentVideo = null;
}

/**
 * 点击下载：关联媒体或直发视频 src
 */
async function onDownloadClick(): Promise<void> {
  const src = currentVideo?.currentSrc || currentVideo?.src || '';
  hideNow();
  try {
    await browserApi.runtime.sendMessage({ action: 'floatButtonDownload', videoSrc: src });
  } catch {
    // 忽略
  }
}

/**
 * 「×」本站不再显示：写 siteRules
 */
async function disableForSite(): Promise<void> {
  siteDisabled = true;
  removeOverlay();
  try {
    const res = await browserApi.storage.get([STORAGE_KEYS.SETTINGS]);
    const settings: ExtensionSettings = { ...DEFAULT_SETTINGS, ...(res[STORAGE_KEYS.SETTINGS] || {}) };
    const domain = getDomain();
    const rules = [...(settings.siteRules || [])];
    const existing = rules.find((r) => r.domain.toLowerCase() === domain);
    if (existing) {
      existing.floatButton = false;
    } else {
      rules.push({ domain, floatButton: false });
    }
    await browserApi.storage.set({ [STORAGE_KEYS.SETTINGS]: { ...settings, siteRules: rules } });
  } catch {
    // 忽略
  }
}

/**
 * 初始化悬浮按钮
 */
export function initFloatButton(): void {
  void loadConfig();

  // 配置变化时重载
  browserApi.storage.onChanged.addListener((changes: Record<string, chrome.storage.StorageChange>, areaName?: chrome.storage.AreaName) => {
    if ((areaName === 'local' || areaName === 'sync') && changes[STORAGE_KEYS.SETTINGS]) {
      void loadConfig();
    }
  });

  document.addEventListener('mouseover', (e) => {
    if (!enabled || siteDisabled) {
      return;
    }
    const target = e.target as Element;
    if (target instanceof HTMLVideoElement) {
      currentVideo = target;
      cancelHide();
      scheduleShow();
    }
  }, true);

  document.addEventListener('mouseout', (e) => {
    const target = e.target as Element;
    if (target instanceof HTMLVideoElement) {
      cancelShow();
      scheduleHide();
    }
  }, true);

  // 滚动/尺寸变化时重新定位（仅在显示时）
  const reposition = () => {
    if (hostEl && hostEl.style.display === 'block' && currentVideo) {
      positionOverlay(currentVideo);
    }
  };
  window.addEventListener('scroll', reposition, true);
  window.addEventListener('resize', reposition);
}
