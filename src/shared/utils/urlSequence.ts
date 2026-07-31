/**
 * 序列 URL 展开器
 * 将含 [start-end] 占位的模式展开为多个 URL，如 file[01-03].zip -> file01.zip / file02.zip / file03.zip
 */

const MAX_EXPAND = 1000; // 安全上限，避免误输入巨量任务

/**
 * 展开序列模式。无有效占位或超限时原样返回单元素数组。
 * 保留零填充宽度；start > end 时自动升序。
 */
export function expandSequence(pattern: string): string[] {
  const match = pattern.match(/\[(\d+)-(\d+)\]/);
  if (!match) {
    return [pattern];
  }

  const startStr = match[1];
  const endStr = match[2];
  const start = parseInt(startStr, 10);
  const end = parseInt(endStr, 10);
  if (isNaN(start) || isNaN(end)) {
    return [pattern];
  }

  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  if (hi - lo + 1 > MAX_EXPAND) {
    return [pattern];
  }

  // 任一端点带前导零则按最大宽度补零
  const width = startStr.startsWith('0') || endStr.startsWith('0')
    ? Math.max(startStr.length, endStr.length)
    : 0;

  const results: string[] = [];
  for (let i = lo; i <= hi; i++) {
    const num = width > 0 ? String(i).padStart(width, '0') : String(i);
    results.push(pattern.replace(match[0], num));
  }
  return results;
}

/**
 * 是否含可展开的序列占位
 */
export function hasSequence(pattern: string): boolean {
  return /\[\d+-\d+\]/.test(pattern);
}
