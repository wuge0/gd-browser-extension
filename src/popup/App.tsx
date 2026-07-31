import React, { useEffect, useState } from 'react';
import { useLinkStore } from './stores/linkStore';
import { useTaskStore } from './stores/taskStore';
import Header from './components/Header';
import LinkList from './components/LinkList';
import Footer from './components/Footer';
import ActiveTasks from './components/ActiveTasks';
import MediaView from './components/MediaView';
import BatchPanel from './components/BatchPanel';
import { t } from '@/shared/utils/i18n';
import { applyTheme } from '@/shared/utils/theme';
import { browserApi } from '@/shared/utils/browserApi';
import { STORAGE_KEYS } from '@/shared/constants';

type Tab = 'captured' | 'media' | 'downloading';

function App() {
  const { loadLinks, checkConnection, addLink, links, searchQuery } = useLinkStore();
  const { startPolling, stopPolling } = useTaskStore();
  const [tab, setTab] = useState<Tab>('captured');
  const [batchOpen, setBatchOpen] = useState(false);

  useEffect(() => {
    loadLinks();
    checkConnection();

    // 快捷键触发时后台会写入目标 Tab，打开即切换到媒体面板
    (async () => {
      try {
        const data = await chrome.storage.session?.get('popupTab');
        if (data?.popupTab === 'media') {
          setTab('media');
          await chrome.storage.session?.set({ popupTab: '' });
        }
      } catch {
        // 忽略
      }
    })();

    // 每 5 秒检查一次连接状态
    const interval = setInterval(checkConnection, 5000);
    return () => clearInterval(interval);
  }, [loadLinks, checkConnection]);

  // 应用主题（light/dark/auto），并随设置变化实时切换
  useEffect(() => {
    const apply = async () => {
      try {
        const r = await browserApi.storage.get([STORAGE_KEYS.SETTINGS]);
        applyTheme(r[STORAGE_KEYS.SETTINGS]?.theme || 'auto');
      } catch {
        applyTheme('auto');
      }
    };
    apply();
    const listener = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (changes[STORAGE_KEYS.SETTINGS]) apply();
    };
    browserApi.storage.onChanged.addListener(listener);
    return () => browserApi.storage.onChanged.removeListener(listener);
  }, []);

  // 仅在「下载中」标签激活时轮询，切走/卸载即停止（保证 popup 关闭后无轮询）
  useEffect(() => {
    if (tab === 'downloading') {
      startPolling();
    } else {
      stopPolling();
    }
    return () => stopPolling();
  }, [tab, startPolling, stopPolling]);

  // 监听网络嗅探捕获的链接
  useEffect(() => {
    const handleMessage = (message: any) => {
      if (message.action === 'networkCapturedLink' && message.link) {
        // 检查是否已存在（避免重复）
        const exists = links.some(l => l.url === message.link.url);
        if (!exists) {
          addLink(message.link);
        }
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, [links, addLink]);

  // 过滤链接
  const filteredLinks = links.filter(link => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      link.filename.toLowerCase().includes(query) ||
      link.url.toLowerCase().includes(query)
    );
  });

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      backgroundColor: 'var(--bg-white)'
    }}>
      <Header onBatchClick={() => setBatchOpen(true)} />

      {batchOpen && <BatchPanel onClose={() => setBatchOpen(false)} />}

      {/* Tab 切换：已捕获 / 下载中 */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid var(--border-base)',
        backgroundColor: 'var(--bg-white)'
      }}>
        <TabButton active={tab === 'captured'} onClick={() => setTab('captured')}>
          {t('tabCaptured')}
        </TabButton>
        <TabButton active={tab === 'media'} onClick={() => setTab('media')}>
          {t('tabMedia')}
        </TabButton>
        <TabButton active={tab === 'downloading'} onClick={() => setTab('downloading')}>
          {t('tabDownloading')}
        </TabButton>
      </div>

      {tab === 'captured' && (
        <>
          <LinkList links={filteredLinks} />
          <Footer />
        </>
      )}
      {tab === 'media' && <MediaView />}
      {tab === 'downloading' && <ActiveTasks />}
    </div>
  );
}

function TabButton({ active, onClick, children }: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: '10px',
        fontSize: '13px',
        fontWeight: active ? 600 : 400,
        color: active ? 'var(--color-primary)' : 'var(--text-regular)',
        backgroundColor: 'transparent',
        border: 'none',
        borderBottom: active ? '2px solid var(--color-primary)' : '2px solid transparent',
        cursor: 'pointer',
        transition: 'all 0.2s'
      }}
    >
      {children}
    </button>
  );
}

export default App;
