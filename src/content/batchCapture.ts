import { pickLargestFromSrcset } from '@/shared/utils/srcset';
import { browserApi } from '@/shared/utils/browserApi';

/**
 * 批量抓取：图片画廊采集 + 拖框选链
 */

export interface CapturedImage {
  url: string;
  width: number;
  height: number;
}

/**
 * 扫描页面所有图片，srcset 取最大档，按 URL 去重
 */
export function captureImages(): CapturedImage[] {
  const map = new Map<string, CapturedImage>();
  for (const img of Array.from(document.images)) {
    const url = img.currentSrc || pickLargestFromSrcset(img.srcset, img.src) || img.src;
    if (!url || !/^https?:/i.test(url)) {
      continue;
    }
    if (!map.has(url)) {
      map.set(url, {
        url,
        width: img.naturalWidth || img.width || 0,
        height: img.naturalHeight || img.height || 0
      });
    }
  }
  return Array.from(map.values());
}

// ===== 拖框选链 =====

let dragOverlay: HTMLElement | null = null;
let selectionBox: HTMLDivElement | null = null;
let startX = 0;
let startY = 0;
let dragging = false;

/**
 * 启动拖框选择模式
 */
export function startDragSelect(): void {
  if (dragOverlay) {
    return;
  }
  dragOverlay = document.createElement('div');
  dragOverlay.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:2147483647',
    'cursor:crosshair',
    'background:rgba(64,158,255,0.06)'
  ].join(';');

  selectionBox = document.createElement('div');
  selectionBox.style.cssText = [
    'position:fixed',
    'border:2px solid #409EFF',
    'background:rgba(64,158,255,0.15)',
    'display:none',
    'pointer-events:none',
    'z-index:2147483647'
  ].join(';');

  document.documentElement.appendChild(dragOverlay);
  document.documentElement.appendChild(selectionBox);

  dragOverlay.addEventListener('mousedown', onDown);
  dragOverlay.addEventListener('mousemove', onMove);
  dragOverlay.addEventListener('mouseup', onUp);
  document.addEventListener('keydown', onEsc, true);
}

function onEsc(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    teardownDrag();
  }
}

function onDown(e: MouseEvent) {
  dragging = true;
  startX = e.clientX;
  startY = e.clientY;
  if (selectionBox) {
    selectionBox.style.display = 'block';
    updateBox(e.clientX, e.clientY);
  }
}

function onMove(e: MouseEvent) {
  if (dragging) {
    updateBox(e.clientX, e.clientY);
  }
}

function updateBox(x: number, y: number) {
  if (!selectionBox) {
    return;
  }
  const left = Math.min(startX, x);
  const top = Math.min(startY, y);
  const width = Math.abs(x - startX);
  const height = Math.abs(y - startY);
  selectionBox.style.left = `${left}px`;
  selectionBox.style.top = `${top}px`;
  selectionBox.style.width = `${width}px`;
  selectionBox.style.height = `${height}px`;
}

function onUp(e: MouseEvent) {
  if (!dragging) {
    return;
  }
  dragging = false;
  const rect = {
    left: Math.min(startX, e.clientX),
    top: Math.min(startY, e.clientY),
    right: Math.max(startX, e.clientX),
    bottom: Math.max(startY, e.clientY)
  };
  const links = collectLinksInRect(rect);
  teardownDrag();
  if (links.length > 0) {
    browserApi.runtime.sendMessage({ action: 'batchLinksCaptured', links }).catch(() => {});
  }
}

/**
 * 收集选框内的链接与图片
 */
function collectLinksInRect(rect: { left: number; top: number; right: number; bottom: number }): Array<{ url: string; filename: string }> {
  const out = new Map<string, { url: string; filename: string }>();

  const inRect = (el: Element): boolean => {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    return cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom;
  };

  const add = (url: string) => {
    if (!url || !/^https?:/i.test(url) || out.has(url)) {
      return;
    }
    const filename = decodeURIComponent(url.split('/').pop()?.split('?')[0] || 'file');
    out.set(url, { url, filename });
  };

  document.querySelectorAll('a[href]').forEach((a) => {
    if (inRect(a)) {
      add((a as HTMLAnchorElement).href);
    }
  });
  document.querySelectorAll('img').forEach((img) => {
    if (inRect(img)) {
      const el = img as HTMLImageElement;
      add(el.currentSrc || pickLargestFromSrcset(el.srcset, el.src) || el.src);
    }
  });

  return Array.from(out.values());
}

function teardownDrag() {
  document.removeEventListener('keydown', onEsc, true);
  dragOverlay?.remove();
  selectionBox?.remove();
  dragOverlay = null;
  selectionBox = null;
  dragging = false;
}
