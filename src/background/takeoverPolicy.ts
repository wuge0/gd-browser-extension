import type { ExtensionSettings, SiteRule } from '@/shared/types';
import { getDomain } from '@/shared/utils/urlParser';

/**
 * 下载接管的纯判定逻辑（无 chrome / 网络依赖，便于单测）
 */

/**
 * 已知放行的 MIME（浏览器内联查看类，通常不应接管）
 */
const PASSTHROUGH_MIME = new Set([
  'text/html',
  'application/xhtml+xml'
]);

/**
 * 接管判定输入
 */
export interface TakeoverInput {
  // 目标 URL（优先 finalUrl）
  url: string;
  // 下载项 MIME（可空）
  mime?: string;
  // 发起下载的扩展 ID（本扩展回退下载会带自身 ID）
  byExtensionId?: string;
  // 文件体积（字节），未知为 -1
  size: number;
  // aria2 当前是否已连接
  isConnected: boolean;
  // Alt 绕过标记是否生效
  bypassActive: boolean;
}

/**
 * 匹配站点规则（域名含子域）
 */
export function matchSiteRule(rules: SiteRule[], url: string): SiteRule | undefined {
  if (!rules || rules.length === 0) {
    return undefined;
  }
  const domain = getDomain(url);
  if (!domain) {
    return undefined;
  }
  return rules.find((rule) => {
    const d = rule.domain.toLowerCase();
    return domain === d || domain.endsWith('.' + d);
  });
}

/**
 * 判定是否接管该下载（顺序敏感的判定链）
 * true = 接管（取消浏览器下载转交 GDownload）；false = 放行浏览器
 */
export function decideTakeover(input: TakeoverInput, settings: ExtensionSettings): boolean {
  // 1. 总开关 + 在线（离线放行，决不丢下载）
  if (!settings.takeoverEnabled) {
    return false;
  }
  if (!input.isConnected) {
    return false;
  }

  // 2. 排除本扩展自身发起的下载（防回退下载被二次接管造成死循环）
  if (input.byExtensionId) {
    return false;
  }

  // 3. scheme 限定 http/https/ftp
  let scheme = '';
  try {
    scheme = new URL(input.url).protocol.replace(':', '').toLowerCase();
  } catch {
    return false;
  }
  if (scheme !== 'http' && scheme !== 'https' && scheme !== 'ftp') {
    return false;
  }

  // 4. 已知放行 MIME（mime 非空时才判断）
  if (input.mime && PASSTHROUGH_MIME.has(input.mime.toLowerCase())) {
    return false;
  }

  // 5. 体积过小放行（size 未知为 -1 时不以大小拦截）
  if (input.size > 0 && input.size < settings.takeoverMinSize) {
    return false;
  }

  // 6. 站点规则命中 takeover:false 放行
  const rule = matchSiteRule(settings.siteRules, input.url);
  if (rule && rule.takeover === false) {
    return false;
  }

  // 7. Alt 绕过标记命中放行
  if (input.bypassActive) {
    return false;
  }

  return true;
}
