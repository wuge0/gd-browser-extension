import React, { useEffect, useState } from 'react';
import { Download, Film } from 'lucide-react';
import { useMediaStore } from '../stores/mediaStore';
import type { MediaItem } from '@/shared/types';
import { t } from '@/shared/utils/i18n';

function MediaRow({ item }: { item: MediaItem }) {
  const { download } = useMediaStore();
  const [variantIndex, setVariantIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const isDash = item.type === 'dash';
  const hasVariants = item.variants.length > 0;

  const handleDownload = async () => {
    setBusy(true);
    setMessage('');
    const result = await download(item.id, variantIndex);
    setBusy(false);
    if (result.ok) {
      setMessage(t('mediaSent'));
    } else if (result.error === 'ENCRYPTED') {
      setMessage(t('mediaEncrypted'));
    } else {
      setMessage(result.error || t('mediaFailed'));
    }
    setTimeout(() => setMessage(''), 4000);
  };

  return (
    <div style={{
      padding: 'var(--space-md)',
      borderBottom: '1px solid var(--border-lighter)',
      display: 'flex',
      flexDirection: 'column',
      gap: '6px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
        <Film size={14} color="var(--text-secondary)" style={{ flexShrink: 0 }} />
        <span style={{
          flex: 1,
          fontSize: '13px',
          color: 'var(--text-primary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }} title={item.pageTitle}>
          {item.pageTitle}
        </span>
        <span style={{
          fontSize: '10px',
          padding: '1px 6px',
          borderRadius: '4px',
          backgroundColor: 'var(--fill-base)',
          color: 'var(--text-secondary)',
          textTransform: 'uppercase'
        }}>
          {item.type}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
        {isDash ? (
          <span style={{ flex: 1, fontSize: '11px', color: 'var(--color-warning)' }}>
            {t('mediaDashUnsupported')}
          </span>
        ) : (
          <select
            value={variantIndex}
            onChange={(e) => setVariantIndex(Number(e.target.value))}
            disabled={!hasVariants}
            style={{
              flex: 1,
              fontSize: '12px',
              padding: '4px 6px',
              borderRadius: 'var(--radius-base)',
              border: '1px solid var(--border-base)',
              backgroundColor: 'var(--bg-white)',
              color: 'var(--text-regular)'
            }}
          >
            {item.variants.map((v, i) => (
              <option key={i} value={i}>
                {v.name}{v.bandwidth > 0 ? ` · ${(v.bandwidth / 1_000_000).toFixed(1)} Mbps` : ''}
              </option>
            ))}
          </select>
        )}

        <button
          onClick={handleDownload}
          disabled={busy || isDash || !hasVariants}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '6px 12px',
            fontSize: '12px',
            fontWeight: 500,
            color: '#fff',
            backgroundColor: (busy || isDash || !hasVariants) ? 'var(--fill-base)' : 'var(--color-primary)',
            border: 'none',
            borderRadius: 'var(--radius-base)',
            cursor: (busy || isDash || !hasVariants) ? 'not-allowed' : 'pointer'
          }}
        >
          <Download size={13} />
          {busy ? t('mediaSending') : t('mediaDownload')}
        </button>
      </div>

      {message && (
        <div style={{
          fontSize: '11px',
          color: message === t('mediaSent') ? 'var(--color-success)' : 'var(--color-danger)'
        }}>
          {message}
        </div>
      )}
    </div>
  );
}

function MediaView() {
  const { items, load } = useMediaStore();

  useEffect(() => {
    load();
    // 监听后台推送的新捕获项，刷新列表
    const handler = (message: any) => {
      if (message?.action === 'mediaCaptured') {
        load();
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, [load]);

  if (items.length === 0) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-secondary)',
        fontSize: '13px'
      }}>
        {t('mediaNoItems')}
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      {items.map((item) => (
        <MediaRow key={item.id} item={item} />
      ))}
    </div>
  );
}

export default MediaView;
