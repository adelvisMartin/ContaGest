import { APP_VERSION } from './config.js';

const BANNER_ID = 'hipico-version-mismatch';

export function compareRuntimeVersion(buildInfo, expectedVersion = APP_VERSION) {
  const observed = String(buildInfo?.version || '').trim();
  const expected = String(expectedVersion || '').trim();
  return { ok: Boolean(observed && expected && observed === expected), expected, observed: observed || 'unknown' };
}
function removeBanner() {
  document.getElementById(BANNER_ID)?.remove();
  delete document.documentElement.dataset.hipicoVersionMismatch;
}
function showMismatch(result) {
  document.documentElement.dataset.hipicoVersionMismatch = 'true';
  let banner = document.getElementById(BANNER_ID);
  if (!banner) {
    banner = document.createElement('div');
    banner.id = BANNER_ID;
    banner.className = 'offline-banner version-mismatch-banner';
    banner.setAttribute('role', 'alert');
    banner.setAttribute('aria-live', 'assertive');
    const mount = () => {
      const content = document.querySelector('.content') || document.querySelector('#app');
      if (content && !banner.isConnected) content.prepend(banner);
    };
    mount();
    new MutationObserver(mount).observe(document.documentElement, { childList: true, subtree: true });
  }
  banner.hidden = false;
  banner.textContent = `Actualización requerida · interfaz ${result.expected} · metadatos ${result.observed}. Recarga la aplicación antes de continuar con operaciones críticas.`;
}
export async function checkRuntimeVersion(fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') return { ok: false, expected: APP_VERSION, observed: 'unavailable', unavailable: true };
  try {
    const response = await fetchImpl(new URL('../../build-info.json', import.meta.url), { cache: 'no-store', headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    const result = compareRuntimeVersion(await response.json());
    if (result.ok) removeBanner(); else showMismatch(result);
    return result;
  } catch (error) {
    return { ok: null, expected: APP_VERSION, observed: 'unavailable', unavailable: true, reason: String(error?.message || error) };
  }
}
function start() {
  checkRuntimeVersion();
  addEventListener('online', () => checkRuntimeVersion());
}
document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', start, { once: true }) : start();
