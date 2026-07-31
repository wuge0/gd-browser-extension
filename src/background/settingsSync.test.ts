import { describe, it, expect } from 'vitest';
import { stripSecret, mergeWithLocalSecret } from './settingsSync';
import { DEFAULT_SETTINGS } from '@/shared/constants';
import type { ExtensionSettings } from '@/shared/types';

function withSecret(secret: string): ExtensionSettings {
  return { ...DEFAULT_SETTINGS, aria2Config: { ...DEFAULT_SETTINGS.aria2Config, secret } };
}

describe('settingsSync 安全属性', () => {
  it('stripSecret 清空 secret，其余字段不变', () => {
    const s = withSecret('super-secret-token');
    const stripped = stripSecret(s);
    expect(stripped.aria2Config.secret).toBe('');
    // 其它字段保持
    expect(stripped.aria2Config.url).toBe(s.aria2Config.url);
    expect(stripped.takeoverEnabled).toBe(s.takeoverEnabled);
    // 不改原对象
    expect(s.aria2Config.secret).toBe('super-secret-token');
  });

  it('mergeWithLocalSecret 用本地 secret 覆盖远端（远端 secret 恒为空）', () => {
    const remote = stripSecret(withSecret('')); // 远端来的一定是剥离过的
    const merged = mergeWithLocalSecret(remote, 'local-machine-secret');
    expect(merged.aria2Config.secret).toBe('local-machine-secret');
  });

  it('往返：本地 -> 剥离(上行) -> 合并回本地 secret，secret 不丢且不外泄', () => {
    const local = withSecret('machineA-secret');
    const uploaded = stripSecret(local); // 上传到 sync 的内容
    expect(uploaded.aria2Config.secret).toBe(''); // 云端无 secret
    const backToLocal = mergeWithLocalSecret(uploaded, local.aria2Config.secret);
    expect(backToLocal.aria2Config.secret).toBe('machineA-secret'); // 本地 secret 保留
  });
});
