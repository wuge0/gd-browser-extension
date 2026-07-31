import { create } from 'zustand';
import type { MediaItem } from '@/shared/types';
import { browserApi } from '@/shared/utils/browserApi';

interface MediaStore {
  items: MediaItem[];
  load: () => Promise<void>;
  download: (mediaId: string, variantIndex: number) => Promise<{ ok: boolean; error?: string }>;
}

export const useMediaStore = create<MediaStore>((set) => ({
  items: [],

  load: async () => {
    try {
      const res = await browserApi.runtime.sendMessage({ action: 'getMediaItems' });
      if (res?.success && res.data?.items) {
        set({ items: res.data.items });
      }
    } catch {
      // 忽略
    }
  },

  download: async (mediaId, variantIndex) => {
    try {
      const res = await browserApi.runtime.sendMessage({ action: 'downloadMedia', mediaId, variantIndex });
      return { ok: !!res?.success, error: res?.error };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'error' };
    }
  }
}));
