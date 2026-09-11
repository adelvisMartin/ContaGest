import { toast } from './ui.js';

function normalizeNotice(detail) {
  if (typeof detail === 'string') return { message: detail, type: 'warning' };
  const message = String(detail?.message || '').trim();
  const requested = String(detail?.type || 'warning').toLowerCase();
  const type = ['success', 'error', 'warning', 'info'].includes(requested) ? requested : 'warning';
  return { message, type };
}

function onNotice(event) {
  const notice = normalizeNotice(event?.detail);
  if (!notice.message) return;
  toast(notice.message, notice.type, { duration: notice.type === 'error' ? 6500 : 4800 });
}

if (typeof window !== 'undefined' && !window.__HIPICO_NOTICE_BRIDGE__) {
  window.__HIPICO_NOTICE_BRIDGE__ = true;
  window.addEventListener('hipico:notice', onNotice);
}

export const __test__ = { normalizeNotice };
