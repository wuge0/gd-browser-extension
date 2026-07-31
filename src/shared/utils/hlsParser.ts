/**
 * HLS (m3u8) 播放列表解析器（纯函数，无副作用）
 * 支持 master playlist 档位解析与 media playlist 分片解析
 */

/**
 * master playlist 中的一个码率档位
 */
export interface HlsVariant {
  url: string;          // 已解析为绝对 URL
  bandwidth: number;    // 带宽（bps）
  resolution?: string;  // 如 "1920x1080"
  codecs?: string;
  frameRate?: number;
  name: string;         // 展示名，如 "1080p" / "2.5 Mbps"
}

/**
 * media playlist 解析结果
 */
export interface HlsMediaPlaylist {
  segments: string[];   // 分片绝对 URL 列表
  encrypted: boolean;   // 是否含 #EXT-X-KEY 加密
  keyMethod?: string;   // 加密方法（如 AES-128）
  totalDuration: number; // 总时长（秒）
}

/**
 * 是否为 master playlist（含 #EXT-X-STREAM-INF）
 */
export function isMasterPlaylist(content: string): boolean {
  return /#EXT-X-STREAM-INF/i.test(content);
}

/**
 * 是否为 HLS 内容（含 #EXTM3U 头）
 */
export function isHlsContent(content: string): boolean {
  return /^\s*#EXTM3U/.test(content);
}

/**
 * 解析 master playlist 的档位列表（按带宽降序）
 */
export function parseMasterPlaylist(content: string, baseUrl: string): HlsVariant[] {
  const lines = content.split(/\r?\n/);
  const variants: HlsVariant[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.toUpperCase().startsWith('#EXT-X-STREAM-INF:')) {
      continue;
    }
    const attrs = parseAttributes(line.substring(line.indexOf(':') + 1));

    // 紧随其后的首个非注释、非空行是该档位的 URI
    let uri = '';
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j].trim();
      if (l && !l.startsWith('#')) {
        uri = l;
        i = j;
        break;
      }
    }
    if (!uri) {
      continue;
    }

    const bandwidth = parseInt(attrs['BANDWIDTH'] || attrs['AVERAGE-BANDWIDTH'] || '0', 10);
    const resolution = attrs['RESOLUTION'];
    variants.push({
      url: resolveUrl(uri, baseUrl),
      bandwidth: isNaN(bandwidth) ? 0 : bandwidth,
      resolution,
      codecs: attrs['CODECS'],
      frameRate: attrs['FRAME-RATE'] ? parseFloat(attrs['FRAME-RATE']) : undefined,
      name: variantName(resolution, bandwidth)
    });
  }

  variants.sort((a, b) => b.bandwidth - a.bandwidth);
  return variants;
}

/**
 * 解析 media playlist 的分片列表与加密状态
 */
export function parseMediaPlaylist(content: string, baseUrl: string): HlsMediaPlaylist {
  const lines = content.split(/\r?\n/);
  const segments: string[] = [];
  let encrypted = false;
  let keyMethod: string | undefined;
  let totalDuration = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      continue;
    }

    const upper = line.toUpperCase();
    if (upper.startsWith('#EXT-X-KEY:')) {
      const attrs = parseAttributes(line.substring(line.indexOf(':') + 1));
      const method = attrs['METHOD'];
      if (method && method.toUpperCase() !== 'NONE') {
        encrypted = true;
        keyMethod = method;
      }
    } else if (upper.startsWith('#EXTINF:')) {
      const dur = parseFloat(line.substring(line.indexOf(':') + 1).split(',')[0]);
      if (!isNaN(dur)) {
        totalDuration += dur;
      }
      // 紧随其后的首个非注释、非空行是分片 URI
      for (let j = i + 1; j < lines.length; j++) {
        const l = lines[j].trim();
        if (l && !l.startsWith('#')) {
          segments.push(resolveUrl(l, baseUrl));
          i = j;
          break;
        }
      }
    }
  }

  return { segments, encrypted, keyMethod, totalDuration };
}

/**
 * 解析 HLS 标签的属性串（KEY=VALUE，值可为带引号含逗号的字符串）
 */
function parseAttributes(s: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([A-Z0-9-]+)=("[^"]*"|[^,]*)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(s)) !== null) {
    let value = match[2];
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    attrs[match[1].toUpperCase()] = value;
  }
  return attrs;
}

/**
 * 将相对 URI 解析为绝对 URL（失败则原样返回）
 */
function resolveUrl(uri: string, baseUrl: string): string {
  try {
    return new URL(uri, baseUrl).href;
  } catch {
    return uri;
  }
}

/**
 * 生成档位展示名
 */
function variantName(resolution: string | undefined, bandwidth: number): string {
  if (resolution) {
    const height = resolution.split('x')[1];
    if (height) {
      return `${height}p`;
    }
    return resolution;
  }
  if (bandwidth > 0) {
    return `${(bandwidth / 1_000_000).toFixed(1)} Mbps`;
  }
  return 'unknown';
}
