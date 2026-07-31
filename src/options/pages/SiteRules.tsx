import React, { useEffect, useState } from 'react';
import { browserApi } from '@/shared/utils/browserApi';
import { DEFAULT_SETTINGS, STORAGE_KEYS } from '@/shared/constants';
import type { ExtensionSettings, SiteRule } from '@/shared/types';
import { t } from '@/shared/utils/i18n';

type Dimension = 'takeover' | 'floatButton' | 'sniffing';

// 三态值 <-> 下拉字符串
function toTriValue(v: boolean | undefined): string {
  if (v === true) return 'on';
  if (v === false) return 'off';
  return 'default';
}
function fromTriValue(s: string): boolean | undefined {
  if (s === 'on') return true;
  if (s === 'off') return false;
  return undefined;
}

function SiteRules() {
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [newDomain, setNewDomain] = useState('');

  useEffect(() => {
    (async () => {
      const result = await browserApi.storage.get([STORAGE_KEYS.SETTINGS]);
      if (result[STORAGE_KEYS.SETTINGS]) {
        setSettings({ ...DEFAULT_SETTINGS, ...result[STORAGE_KEYS.SETTINGS] });
      }
    })();
  }, []);

  const save = async () => {
    await browserApi.storage.set({ [STORAGE_KEYS.SETTINGS]: settings });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const rules = settings.siteRules || [];

  const addRule = () => {
    const domain = newDomain.trim().toLowerCase();
    if (!domain || rules.some((r) => r.domain.toLowerCase() === domain)) {
      return;
    }
    setSettings({ ...settings, siteRules: [...rules, { domain }] });
    setNewDomain('');
  };

  const removeRule = (domain: string) => {
    setSettings({ ...settings, siteRules: rules.filter((r) => r.domain !== domain) });
  };

  const updateDimension = (domain: string, dim: Dimension, value: boolean | undefined) => {
    setSettings({
      ...settings,
      siteRules: rules.map((r) => {
        if (r.domain !== domain) return r;
        const next: SiteRule = { ...r };
        if (value === undefined) {
          delete next[dim];
        } else {
          next[dim] = value;
        }
        return next;
      })
    });
  };

  const dimensions: { key: Dimension; label: string }[] = [
    { key: 'takeover', label: t('ruleTakeover') },
    { key: 'floatButton', label: t('ruleFloatButton') },
    { key: 'sniffing', label: t('ruleSniffing') }
  ];

  return (
    <div>
      <h1 style={{ fontSize: '24px', fontWeight: 600, marginBottom: 'var(--space-xl)' }}>
        {t('siteRulesTitle')}
      </h1>

      <div className="options-section">
        <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: 'var(--space-md)' }}>
          {t('siteRulesDesc')}
        </div>

        {/* 添加域名 */}
        <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-lg)' }}>
          <input
            type="text"
            className="form-input"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addRule()}
            placeholder="example.com"
          />
          <button className="form-button" onClick={addRule}>{t('add')}</button>
        </div>

        {rules.length === 0 ? (
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{t('siteRulesEmpty')}</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-secondary)' }}>
                <th style={{ padding: '6px 4px' }}>{t('ruleDomain')}</th>
                {dimensions.map((d) => (
                  <th key={d.key} style={{ padding: '6px 4px' }}>{d.label}</th>
                ))}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.domain} style={{ borderTop: '1px solid var(--border-lighter)' }}>
                  <td style={{ padding: '6px 4px', fontFamily: 'monospace' }}>{rule.domain}</td>
                  {dimensions.map((d) => (
                    <td key={d.key} style={{ padding: '6px 4px' }}>
                      <select
                        value={toTriValue(rule[d.key])}
                        onChange={(e) => updateDimension(rule.domain, d.key, fromTriValue(e.target.value))}
                        style={{
                          fontSize: '12px',
                          padding: '3px 6px',
                          borderRadius: 'var(--radius-base)',
                          border: '1px solid var(--border-base)',
                          background: 'var(--bg-white)',
                          color: 'var(--text-regular)'
                        }}
                      >
                        <option value="default">{t('ruleDefault')}</option>
                        <option value="on">{t('ruleOn')}</option>
                        <option value="off">{t('ruleOff')}</option>
                      </select>
                    </td>
                  ))}
                  <td style={{ padding: '6px 4px', textAlign: 'right' }}>
                    <button
                      onClick={() => removeRule(rule.domain)}
                      style={{
                        background: 'var(--color-danger)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 'var(--radius-small)',
                        padding: '3px 8px',
                        cursor: 'pointer',
                        fontSize: '12px'
                      }}
                    >
                      {t('remove')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
        <button className="form-button" onClick={save}>{t('save')}</button>
        {saved && (
          <div style={{ padding: '8px 16px', color: 'var(--color-success)', fontSize: '14px', display: 'flex', alignItems: 'center' }}>
            ✓ {t('saved')}
          </div>
        )}
      </div>
    </div>
  );
}

export default SiteRules;
