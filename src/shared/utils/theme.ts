/**
 * 主题应用：在 <html> 上设置 data-theme，配合 CSS 暗色 token 生效
 * auto = 跟随系统（移除属性，交给 prefers-color-scheme）
 */
export type ThemeMode = 'light' | 'dark' | 'auto';

export function applyTheme(theme: ThemeMode): void {
  const root = document.documentElement;
  if (theme === 'auto') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', theme);
  }
}
