/** Display preferences, applied as attributes on <html> (index.html sets them before first paint). */
export type Theme = 'light' | 'dark';
export type TextSize = 'normal' | 'large';

const root = document.documentElement;
const save = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // private mode: the choice lasts for this page only
  }
};

export const currentTheme = (): Theme => (root.dataset.theme === 'dark' ? 'dark' : 'light');
export const currentTextSize = (): TextSize => (root.dataset.text === 'normal' ? 'normal' : 'large');

export function setTheme(theme: Theme): void {
  root.dataset.theme = theme;
  save('somec.theme', theme);
}

export function setTextSize(size: TextSize): void {
  root.dataset.text = size;
  save('somec.text', size);
}
