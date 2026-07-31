import { describe, it, expect } from 'vitest';
import { decideTakeover, matchSiteRule, type TakeoverInput } from './takeoverPolicy';
import { DEFAULT_SETTINGS } from '@/shared/constants';
import type { ExtensionSettings } from '@/shared/types';

function settings(overrides: Partial<ExtensionSettings> = {}): ExtensionSettings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

function input(overrides: Partial<TakeoverInput> = {}): TakeoverInput {
  return {
    url: 'https://example.com/file.zip',
    mime: 'application/zip',
    byExtensionId: undefined,
    size: -1,
    isConnected: true,
    bypassActive: false,
    ...overrides
  };
}

describe('decideTakeover 判定链', () => {
  it('默认设置 + 在线 + 普通下载 -> 接管', () => {
    expect(decideTakeover(input(), settings())).toBe(true);
  });

  it('总开关关闭 -> 放行', () => {
    expect(decideTakeover(input(), settings({ takeoverEnabled: false }))).toBe(false);
  });

  it('离线（未连接）-> 放行，决不丢下载', () => {
    expect(decideTakeover(input({ isConnected: false }), settings())).toBe(false);
  });

  it('本扩展自身发起（byExtensionId 非空）-> 放行，防死循环', () => {
    expect(decideTakeover(input({ byExtensionId: 'self-ext-id' }), settings())).toBe(false);
  });

  it('非 http/https/ftp scheme -> 放行', () => {
    expect(decideTakeover(input({ url: 'magnet:?xt=urn:btih:abc' }), settings())).toBe(false);
    expect(decideTakeover(input({ url: 'blob:https://example.com/uuid' }), settings())).toBe(false);
    expect(decideTakeover(input({ url: 'data:text/plain;base64,AAAA' }), settings())).toBe(false);
  });

  it('ftp scheme -> 接管', () => {
    expect(decideTakeover(input({ url: 'ftp://mirror.example.com/x.iso' }), settings())).toBe(true);
  });

  it('放行 MIME（text/html）-> 放行', () => {
    expect(decideTakeover(input({ mime: 'text/html' }), settings())).toBe(false);
  });

  it('体积小于阈值 -> 放行；体积未知(-1) 不以大小拦截', () => {
    const s = settings({ takeoverMinSize: 1048576 });
    expect(decideTakeover(input({ size: 1024 }), s)).toBe(false);
    expect(decideTakeover(input({ size: -1 }), s)).toBe(true);
    expect(decideTakeover(input({ size: 2097152 }), s)).toBe(true);
  });

  it('站点规则 takeover:false -> 放行', () => {
    const s = settings({ siteRules: [{ domain: 'example.com', takeover: false }] });
    expect(decideTakeover(input(), s)).toBe(false);
  });

  it('站点规则 takeover:true -> 仍接管', () => {
    const s = settings({ siteRules: [{ domain: 'example.com', takeover: true }] });
    expect(decideTakeover(input(), s)).toBe(true);
  });

  it('Alt 绕过标记生效 -> 放行', () => {
    expect(decideTakeover(input({ bypassActive: true }), settings())).toBe(false);
  });
});

describe('matchSiteRule 域名匹配', () => {
  const rules = [{ domain: 'example.com', takeover: false }];

  it('精确域名命中', () => {
    expect(matchSiteRule(rules, 'https://example.com/a')?.domain).toBe('example.com');
  });

  it('子域命中', () => {
    expect(matchSiteRule(rules, 'https://dl.example.com/a')?.domain).toBe('example.com');
  });

  it('无关域名不命中', () => {
    expect(matchSiteRule(rules, 'https://other.org/a')).toBeUndefined();
  });

  it('空规则返回 undefined', () => {
    expect(matchSiteRule([], 'https://example.com/a')).toBeUndefined();
  });
});
