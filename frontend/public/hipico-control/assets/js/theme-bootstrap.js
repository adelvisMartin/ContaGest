(function bootstrapHipicoTheme(globalScope) {
  'use strict';
  const KEY = 'hipico-control-theme';
  const ALLOWED = new Set(['system', 'light', 'dark']);
  const normalize = (value) => ALLOWED.has(String(value || '').toLowerCase()) ? String(value).toLowerCase() : 'system';
  const storage = () => {
    try { return globalScope.localStorage || null; } catch { return null; }
  };
  const raw = (() => {
    try { return storage()?.getItem(KEY) || ''; } catch { return ''; }
  })();
  const hasStored = ALLOWED.has(String(raw).toLowerCase());
  const initial = hasStored ? normalize(raw) : 'system';
  document.documentElement.dataset.theme = initial;

  const contract = {
    key: KEY,
    allowed: Object.freeze(['system', 'light', 'dark']),
    normalize,
    hasStoredTheme() {
      try { return ALLOWED.has(String(storage()?.getItem(KEY) || '').toLowerCase()); } catch { return false; }
    },
    get() {
      try { return normalize(storage()?.getItem(KEY)); } catch { return 'system'; }
    },
    set(value) {
      const theme = normalize(value);
      try { storage()?.setItem(KEY, theme); } catch {}
      if (document.documentElement.dataset.theme !== theme) document.documentElement.dataset.theme = theme;
      return theme;
    }
  };

  new MutationObserver(() => {
    if (!contract.hasStoredTheme()) return;
    const preferred = contract.get();
    if (document.documentElement.dataset.theme !== preferred) {
      queueMicrotask(() => {
        if (document.documentElement.dataset.theme !== preferred) document.documentElement.dataset.theme = preferred;
      });
    }
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  globalScope.__HIPICO_PRESENTATION_THEME__ = contract;
  globalScope.__HIPICO_THEME_STORAGE_KEY__ = KEY;
})(typeof globalThis !== 'undefined' ? globalThis : window);
