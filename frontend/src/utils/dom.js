export const escapeHtml = (value = '') => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

export const qs = (selector, root = document) => root.querySelector(selector);
export const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));
export const uid = (prefix = 'id') => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
export const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
export const today = () => new Date().toISOString().slice(0, 10);
export const monthKey = () => new Date().toISOString().slice(0, 7);

export const formData = (form) => Object.fromEntries(new FormData(form).entries());

export function downloadText(filename, text, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function mountSubmit(formSelector, callback) {
  const form = qs(formSelector);
  if (!form) return;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    callback(formData(form), form, event);
  });
}
