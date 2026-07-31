import { create } from 'zustand';
import type { ActiveTask } from '@/shared/types';
import { browserApi } from '@/shared/utils/browserApi';

interface TaskStore {
  tasks: ActiveTask[];
  loading: boolean;
  pollTimer: ReturnType<typeof setInterval> | null;

  // Actions
  startPolling: () => void;
  stopPolling: () => void;
  refresh: () => Promise<void>;
  pause: (gid: string) => Promise<void>;
  resume: (gid: string) => Promise<void>;
  cancel: (gid: string) => Promise<void>;
}

export const useTaskStore = create<TaskStore>((set, get) => ({
  tasks: [],
  loading: false,
  pollTimer: null,

  startPolling: () => {
    if (get().pollTimer !== null) {
      return; // 已在轮询
    }
    // 立即拉一次，随后每秒刷新
    void get().refresh();
    const timer = setInterval(() => {
      void get().refresh();
    }, 1000);
    set({ pollTimer: timer });
  },

  stopPolling: () => {
    const { pollTimer } = get();
    if (pollTimer !== null) {
      clearInterval(pollTimer);
      set({ pollTimer: null });
    }
  },

  refresh: async () => {
    try {
      const response = await browserApi.runtime.sendMessage({ action: 'getActiveTasks' });
      if (response?.success && response.data?.tasks) {
        set({ tasks: response.data.tasks, loading: false });
      } else {
        set({ tasks: [], loading: false });
      }
    } catch {
      set({ tasks: [], loading: false });
    }
  },

  pause: async (gid) => {
    await browserApi.runtime.sendMessage({ action: 'pauseTask', gid });
    await get().refresh();
  },

  resume: async (gid) => {
    await browserApi.runtime.sendMessage({ action: 'resumeTask', gid });
    await get().refresh();
  },

  cancel: async (gid) => {
    await browserApi.runtime.sendMessage({ action: 'cancelTask', gid });
    await get().refresh();
  }
}));
