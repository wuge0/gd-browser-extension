/**
 * srcset 解析：从 <img srcset> 中挑选分辨率最大的候选
 */

/**
 * 解析 srcset，返回权重最大（w 或 x 描述符最大）的 URL。
 * 无候选时返回 fallback。
 * 示例："a.jpg 320w, b.jpg 640w" -> b.jpg；"a.jpg, b.jpg 2x" -> b.jpg
 */
export function pickLargestFromSrcset(srcset: string, fallback: string): string {
  if (!srcset) {
    return fallback;
  }

  const candidates = srcset
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((part) => {
      const [url, descriptor] = part.split(/\s+/);
      let weight = 1; // 无描述符默认 1x
      if (descriptor) {
        const m = descriptor.match(/^(\d+(?:\.\d+)?)([wx])$/);
        if (m) {
          weight = parseFloat(m[1]);
        }
      }
      return { url, weight };
    })
    .filter((c) => c.url);

  if (candidates.length === 0) {
    return fallback;
  }

  candidates.sort((a, b) => b.weight - a.weight);
  return candidates[0].url;
}
