const THEME_KEY = 'hipico-control-theme';
const SIDEBAR_KEY = 'hipico-control-sidebar-collapsed';
const ALLOWED_THEMES = new Set(['system', 'light', 'dark']);

function resolveStorage(storage) {
  if (storage) return storage;
  try { return globalThis.localStorage || null; } catch { return null; }
}

function read(storage, key) {
  try { return resolveStorage(storage)?.getItem(key) ?? null; } catch { return null; }
}

function write(storage, key, value) {
  try { resolveStorage(storage)?.setItem(key, value); return true; } catch { return false; }
}

export function normalizeTheme(value) {
  const candidate = String(value || '').toLowerCase();
  return ALLOWED_THEMES.has(candidate) ? candidate : 'system';
}

export function hasStoredTheme(storage) {
  return ALLOWED_THEMES.has(String(read(storage, THEME_KEY) || '').toLowerCase());
}

export function getThemePreference(storage) {
  return normalizeTheme(read(storage, THEME_KEY));
}

export function setThemePreference(theme, storage) {
  const normalized = normalizeTheme(theme);
  write(storage, THEME_KEY, normalized);
  return normalized;
}

export function migrateLegacyTheme(workspaceTheme, storage) {
  if (hasStoredTheme(storage)) return getThemePreference(storage);
  const normalized = normalizeTheme(workspaceTheme);
  write(storage, THEME_KEY, normalized);
  return normalized;
}

export function getSidebarCollapsed(storage) {
  return read(storage, SIDEBAR_KEY) === '1';
}

export function setSidebarCollapsed(collapsed, storage) {
  const value = Boolean(collapsed);
  write(storage, SIDEBAR_KEY, value ? '1' : '0');
  return value;
}

export function cycleTheme(theme) {
  const current = normalizeTheme(theme);
  if (current === 'system') return 'light';
  if (current === 'light') return 'dark';
  return 'system';
}

export function applyThemePreference(theme = getThemePreference()) {
  const normalized = normalizeTheme(theme);
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = normalized;
    const dark = normalized === 'dark' || (normalized === 'system' && globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0B0E0C' : '#235C45');
  }
  return normalized;
}

export const PRESENTATION_KEYS = Object.freeze({ theme: THEME_KEY, sidebar: SIDEBAR_KEY });
export const PRESENTATION_THEMES = Object.freeze(['system', 'light', 'dark']);
