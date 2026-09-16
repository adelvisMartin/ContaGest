const ICON_ACTION_LABELS = Object.freeze({
  'focus-fast': 'Captura rápida',
  'calendar-prev': 'Mes anterior',
  'calendar-next': 'Mes siguiente'
});

function applyActionLabels(root = document) {
  for (const [action, label] of Object.entries(ICON_ACTION_LABELS)) {
    root.querySelectorAll?.(`[data-action="${action}"]`).forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      if (node.hasAttribute('aria-label')) return;
      if (String(node.textContent || '').trim()) return;
      node.setAttribute('aria-label', label);
    });
  }
}

function start() {
  applyActionLabels();
  const app = document.getElementById('app');
  if (!app) return;
  new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches?.('[data-action]')) applyActionLabels(node.parentElement || document);
        else applyActionLabels(node);
      }
    }
  }).observe(app, { childList: true, subtree: true });
}

document.readyState === 'loading'
  ? document.addEventListener('DOMContentLoaded', start, { once: true })
  : start();

export const __test__ = { applyActionLabels, ICON_ACTION_LABELS };
