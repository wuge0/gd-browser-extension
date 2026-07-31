import React, { useState } from 'react';
import { X } from 'lucide-react';
import { browserApi } from '@/shared/utils/browserApi';
import { expandSequence } from '@/shared/utils/urlSequence';
import type { Link } from '@/shared/types';
import { t } from '@/shared/utils/i18n';

interface CapturedImage {
  url: string;
  width: number;
  height: number;
}

type Tool = 'images' | 'sequence' | 'drag';

async function activeTabId(): Promise<number | undefined> {
  const tabs = await browserApi.tabs.query({ active: true, currentWindow: true });
  return tabs[0]?.id;
}

function toLink(url: string, index: number): Link {
  const filename = decodeURIComponent(url.split('/').pop()?.split('?')[0] || `file_${index}`);
  return {
    id: `batch_${Date.now()}_${index}`,
    url,
    filename,
    size: null,
    fileType: filename.match(/\.[^.]+$/)?.[0] || '',
    selected: true,
    capturedAt: Date.now(),
    source: 'manual'
  };
}

async function sendLinks(urls: string[]): Promise<void> {
  const links = urls.map(toLink);
  await browserApi.runtime.sendMessage({ action: 'sendToGDownload', links });
}

function BatchPanel({ onClose }: { onClose: () => void }) {
  const [tool, setTool] = useState<Tool>('images');

  // 图片画廊
  const [images, setImages] = useState<CapturedImage[]>([]);
  const [minSize, setMinSize] = useState(200);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scanned, setScanned] = useState(false);

  // 序列
  const [pattern, setPattern] = useState('');

  const [message, setMessage] = useState('');

  const scanImages = async () => {
    const tabId = await activeTabId();
    if (tabId === undefined) return;
    try {
      const res = await browserApi.tabs.sendMessage(tabId, { action: 'captureImages' });
      const imgs: CapturedImage[] = res?.images || [];
      setImages(imgs);
      setSelected(new Set(imgs.map((i) => i.url)));
      setScanned(true);
    } catch {
      setMessage(t('batchScanFailed'));
    }
  };

  const filtered = images.filter((img) => img.width >= minSize || img.height >= minSize || (img.width === 0 && img.height === 0));

  const toggle = (url: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(url) ? next.delete(url) : next.add(url);
      return next;
    });
  };

  const sendImages = async () => {
    const urls = filtered.filter((i) => selected.has(i.url)).map((i) => i.url);
    if (urls.length === 0) return;
    await sendLinks(urls);
    setMessage(t('batchSent', String(urls.length)));
    setTimeout(() => setMessage(''), 2500);
  };

  const expanded = pattern ? expandSequence(pattern) : [];
  const sendSequence = async () => {
    if (expanded.length === 0) return;
    await sendLinks(expanded);
    setMessage(t('batchSent', String(expanded.length)));
    setTimeout(() => setMessage(''), 2500);
  };

  const startDrag = async () => {
    const tabId = await activeTabId();
    if (tabId === undefined) return;
    await browserApi.tabs.sendMessage(tabId, { action: 'startDragSelect' });
    window.close(); // 关闭 popup 让用户拖框
  };

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      backgroundColor: 'var(--bg-white)',
      zIndex: 100,
      display: 'flex',
      flexDirection: 'column'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: 'var(--space-md)',
        borderBottom: '1px solid var(--border-base)'
      }}>
        <span style={{ flex: 1, fontSize: '15px', fontWeight: 600 }}>{t('batchTitle')}</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-regular)' }}>
          <X size={18} />
        </button>
      </div>

      {/* 工具切换 */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-lighter)' }}>
        <ToolTab active={tool === 'images'} onClick={() => setTool('images')}>{t('batchImages')}</ToolTab>
        <ToolTab active={tool === 'sequence'} onClick={() => setTool('sequence')}>{t('batchSequence')}</ToolTab>
        <ToolTab active={tool === 'drag'} onClick={() => setTool('drag')}>{t('batchDrag')}</ToolTab>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-md)' }}>
        {tool === 'images' && (
          <div>
            {!scanned ? (
              <button className="form-button" onClick={scanImages}>{t('batchScanImages')}</button>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{t('batchMinSize')}</span>
                  <input
                    type="number"
                    value={minSize}
                    onChange={(e) => setMinSize(Math.max(0, parseInt(e.target.value) || 0))}
                    style={{ width: '70px', padding: '3px 6px', fontSize: '12px', border: '1px solid var(--border-base)', borderRadius: '4px' }}
                  />
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {filtered.length} / {images.length}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                  {filtered.map((img) => (
                    <div
                      key={img.url}
                      onClick={() => toggle(img.url)}
                      style={{
                        position: 'relative',
                        aspectRatio: '1',
                        border: selected.has(img.url) ? '2px solid var(--color-primary)' : '2px solid var(--border-lighter)',
                        borderRadius: '4px',
                        overflow: 'hidden',
                        cursor: 'pointer'
                      }}
                    >
                      <img src={img.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                    </div>
                  ))}
                </div>
                <button className="form-button" style={{ marginTop: '10px' }} onClick={sendImages}>
                  {t('batchSendSelected')}
                </button>
              </>
            )}
          </div>
        )}

        {tool === 'sequence' && (
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
              {t('batchSequenceHint')}
            </div>
            <input
              type="text"
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder="https://example.com/file[01-20].zip"
              className="form-input"
            />
            {pattern && (
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '6px 0' }}>
                {t('batchExpandCount', String(expanded.length))}
              </div>
            )}
            <button className="form-button" onClick={sendSequence} disabled={expanded.length === 0}>
              {t('batchSendSequence')}
            </button>
          </div>
        )}

        {tool === 'drag' && (
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
              {t('batchDragHint')}
            </div>
            <button className="form-button" onClick={startDrag}>{t('batchStartDrag')}</button>
          </div>
        )}

        {message && (
          <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--color-success)' }}>{message}</div>
        )}
      </div>
    </div>
  );
}

function ToolTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: '8px',
        fontSize: '12px',
        fontWeight: active ? 600 : 400,
        color: active ? 'var(--color-primary)' : 'var(--text-regular)',
        backgroundColor: 'transparent',
        border: 'none',
        borderBottom: active ? '2px solid var(--color-primary)' : '2px solid transparent',
        cursor: 'pointer'
      }}
    >
      {children}
    </button>
  );
}

export default BatchPanel;
