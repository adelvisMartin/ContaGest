(function bootstrapHipicoTheme(globalScope) {
  'use strict';
  const KEY = 'hipico-control-theme';
  const ALLOWED = new Set(['system', 'light', 'dark']);
  const normalize = (value) => ALLOWED.has(String(value || '')) ? String(value) : 'system';
  let initial = 'system';
  try { initial = normalize(globalScope.localStorage?.getItem(KEY)); } catch {}
  document.documentElement.dataset.theme = initial;

  const persist = () => {
    const theme = normalize(document.documentElement.dataset.theme);
    if (document.documentElement.dataset.theme !== theme) document.documentElement.dataset.theme = theme;
    try { globalScope.localStorage?.setItem(KEY, theme); } catch {}
  };
  new MutationObserver(persist).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme']
  });
  globalScope.__HIPICO_THEME_STORAGE_KEY__ = KEY;
})(typeof globalThis !== 'undefined' ? globalThis : window);
