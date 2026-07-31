import { STORAGE_KEYS } from '@/shared/constants';
import type { ExtensionSettings } from '@/shared/types';

/**
 * 设置跨设备同步（storage.sync）
 *
 * 设计：local 始终是所有读取方的数据源（background/content/options/popup 都读 local），
 * 本模块仅在 background 做 local <-> sync 双向镜像：
 *   - 本地变更 -> 剥离 secret 后推送到 sync（secret 永不出 local）
 *   - sync 变更（他设备）-> 合并进 local，保留本地 secret
 * 靠"内容相等才跳过写入"收敛，避免无限镜像循环。
 * 不改动任何读取方，零回归风险。
 */

let mirroring = false;

/**
 * 剥离连接密钥（secret 绝不同步到云端）
 */
export function stripSecret(settings: ExtensionSettings): ExtensionSettings {
  return {
    ...settings,
    aria2Config: { ...settings.aria2Config, secret: '' }
  };
}

/**
 * 用远端设置 + 本地 secret 合并
 */
export function mergeWithLocalSecret(remote: ExtensionSettings, localSecret: string): ExtensionSettings {
  return {
    ...remote,
    aria2Config: { ...remote.aria2Config, secret: localSecret }
  };
}

function localSecretOf(settings: any): string {
  return settings?.aria2Config?.secret || '';
}

async function pushLocalToSync(local: ExtensionSettings): Promise<void> {
  const stripped = stripSecret(local);
  const current = await chrome.storage.sync.get(STORAGE_KEYS.SETTINGS);
  if (JSON.stringify(current[STORAGE_KEYS.SETTINGS]) === JSON.stringify(stripped)) {
    return; // 已一致，跳过（收敛）
  }
  mirroring = true;
  try {
    await chrome.storage.sync.set({ [STORAGE_KEYS.SETTINGS]: stripped });
  } finally {
    mirroring = false;
  }
}

async function pullSyncToLocal(remote: ExtensionSettings): Promise<void> {
  const localData = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  const localSettings = localData[STORAGE_KEYS.SETTINGS];
  const merged = mergeWithLocalSecret(remote, localSecretOf(localSettings));
  if (JSON.stringify(localSettings) === JSON.stringify(merged)) {
    return; // 已一致，跳过（收敛）
  }
  mirroring = true;
  try {
    await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: merged });
  } finally {
    mirroring = false;
  }
}

/**
 * 启动补水：sync 有设置时合并进 local（保留本地 secret）
 */
async function hydrateFromSync(): Promise<void> {
  try {
    const syncData = await chrome.storage.sync.get(STORAGE_KEYS.SETTINGS);
    const remote = syncData[STORAGE_KEYS.SETTINGS] as ExtensionSettings | undefined;
    if (remote) {
      await pullSyncToLocal(remote);
    }
  } catch {
    // sync 不可用时忽略
  }
}

/**
 * 初始化设置同步（background 顶层调用一次）
 */
export function initSettingsSync(): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (mirroring) {
      return; // 本模块自身写入引发的事件，忽略
    }
    const change = changes[STORAGE_KEYS.SETTINGS];
    if (!change) {
      return;
    }
    if (area === 'local' && change.newValue) {
      void pushLocalToSync(change.newValue as ExtensionSettings);
    } else if (area === 'sync' && change.newValue) {
      void pullSyncToLocal(change.newValue as ExtensionSettings);
    }
  });

  void hydrateFromSync();
}
