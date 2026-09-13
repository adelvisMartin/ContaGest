(() => {
  const STORAGE_KEY = 'hipico-theme';
  const ALLOWED_THEMES = ['light', 'dark', 'system'];
  const root = document.documentElement;

  let storedTheme = 'system';
  try {
    const candidate = localStorage.getItem('hipico-theme');
    if (ALLOWED_THEMES.includes(candidate)) storedTheme = candidate;
  } catch {
    // Storage can be unavailable in hardened/private contexts. System theme remains safe.
  }

  root.dataset.theme = storedTheme;

  const persistTheme = () => {
    const theme = String(root.dataset.theme || 'system');
    if (!ALLOWED_THEMES.includes(theme)) return;
    try { localStorage.setItem('hipico-theme', theme); } catch { /* best effort only */ }
  };

  if (typeof MutationObserver === 'function') {
    const observer = new MutationObserver(persistTheme);
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  }
})();
