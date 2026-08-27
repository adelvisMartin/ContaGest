import { getWorkspaceSyncStatus } from './store.js';

const BANNER_ID = 'hipico-sync-trust-banner';
let timer = null;

function ensureBanner() {
  let banner = document.getElementById(BANNER_ID);
  if (banner) return banner;
  banner = document.createElement('div');
  banner.id = BANNER_ID;
  banner.className = 'offline-banner';
  banner.setAttribute('role', 'status');
  banner.setAttribute('aria-live', 'polite');
  banner.hidden = true;
  const mount = () => {
    const content = document.querySelector('.content') || document.querySelector('#app');
    if (!content || banner.isConnected) return;
    content.prepend(banner);
  };
  mount();
  new MutationObserver(mount).observe(document.documentElement, { childList: true, subtree: true });
  return banner;
}

async function refreshTrustState() {
  const banner = ensureBanner();
  try {
    const status = await getWorkspaceSyncStatus();
    const offline = navigator.onLine === false;
    const show = offline || status.stale;
    banner.hidden = !show;
    banner.dataset.offline = String(offline);
    banner.dataset.stale = String(status.stale);
    if (!show) return;
    if (offline) {
      banner.textContent = status.lastSyncedAt
        ? `Sin conexión · datos locales no confirmados como vigentes · última sincronización ${new Date(status.lastSyncedAt).toLocaleString('es-VE')}`
        : 'Sin conexión · datos locales no confirmados como vigentes · todavía no existe una sincronización verificada';
      return;
    }
    banner.textContent = status.lastSyncedAt
      ? `Datos pendientes de confirmar · última sincronización ${new Date(status.lastSyncedAt).toLocaleString('es-VE')}`
      : 'Datos locales pendientes de confirmar con el servidor';
  } catch {
    banner.hidden = false;
    banner.dataset.stale = 'true';
    banner.textContent = 'No se pudo verificar la vigencia de los datos locales.';
  }
}

function start() {
  refreshTrustState();
  addEventListener('online', refreshTrustState);
  addEventListener('offline', refreshTrustState);
  timer = setInterval(refreshTrustState, 30000);
  timer.unref?.();
}

document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', start, { once: true }) : start();
