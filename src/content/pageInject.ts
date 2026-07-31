/**
 * MAIN world 注入脚本（运行在页面上下文）
 * 猴补 fetch / XMLHttpRequest，捕获 blob 播放器动态请求的 m3u8/mpd，
 * 经 window.postMessage（带随机 nonce）中转给 ISOLATED 内容脚本。
 * 本文件必须自包含，不得 import（页面上下文无模块系统）。
 */
(() => {
  // 随机 nonce：内容脚本首次收到后锁定，拒绝不一致来源（防页面脚本伪造）
  const NONCE = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const MANIFEST_RE = /\.m3u8(\?|$)|\.mpd(\?|$)|mpegurl|dash\+xml/i;

  function report(rawUrl: unknown) {
    try {
      const url = String(rawUrl || '');
      if (!url || !MANIFEST_RE.test(url)) {
        return;
      }
      // 解析为绝对 URL
      let abs = url;
      try {
        abs = new URL(url, location.href).href;
      } catch {
        // 保持原值
      }
      window.postMessage(
        { __gdownloadInject: true, nonce: NONCE, url: abs, pageUrl: location.href },
        '*'
      );
    } catch {
      // 静默
    }
  }

  // 包装 fetch
  const origFetch = window.fetch;
  if (typeof origFetch === 'function') {
    window.fetch = function (this: unknown, input: any, init?: any) {
      try {
        report(typeof input === 'string' ? input : input?.url);
      } catch {
        // 忽略
      }
      return origFetch.apply(this, [input, init] as any);
    };
  }

  // 包装 XMLHttpRequest.open
  const origOpen = XMLHttpRequest.prototype.open;
  if (typeof origOpen === 'function') {
    XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: string, ...rest: any[]) {
      try {
        report(url);
      } catch {
        // 忽略
      }
      return (origOpen as any).apply(this, [method, url, ...rest]);
    };
  }
})();
