import { signal } from '@lit-labs/preact-signals';

const KEY = 'zz_theme';
const THEME_DEFAULT = 'dark';

function storedTheme() {
  let t = null;
  try { t = localStorage.getItem(KEY); } catch {  }
  return t === 'light' || t === 'dark' ? t : THEME_DEFAULT;
}

export const theme = signal(storedTheme());

function applyTheme(t) {
  document.documentElement.style.colorScheme = t;
}

function setTheme(name) {
  const t = name === 'light' ? 'light' : 'dark';
  try { localStorage.setItem(KEY, t); } catch {  }
  applyTheme(t);
  theme.value = t;
  return t;
}

export const toggleTheme = () => setTheme(theme.value === 'dark' ? 'light' : 'dark');

export function initTheme() {
  applyTheme(theme.value);
}
