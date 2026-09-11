import './operational-copy-center.js';
import { getAppMode } from './store.js';
import { canUseOperationalCenter } from './operational-access-policy.js';

const ROOT_ID = 'hipico-operational-copy-center';
let scheduled = false;
let generation = 0;

function closeSensitiveSurface(root) {
  root?.querySelector('dialog[open]')?.close?.();
}

async function syncAuthorization() {
  const currentGeneration = ++generation;
  const root = document.getElementById(ROOT_ID);
  const hasShell = Boolean(document.querySelector('#app .shell'));
  const blocked = Boolean(document.querySelector('.access-blocker'));
  const cloudRole = document.documentElement.dataset.accessRole || '';
  let mode = null;
  try { mode = await getAppMode(); } catch { mode = null; }
  if (currentGeneration !== generation) return;

  const authorized = canUseOperationalCenter({ mode, hasShell, cloudRole, blocked });
  if (!root) return;
  root.dataset.opsAuthorized = authorized ? 'true' : 'false';
  root.setAttribute('aria-hidden', authorized ? 'false' : 'true');
  if (!authorized) closeSensitiveSurface(root);
}

function scheduleSync() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    syncAuthorization().catch(() => {});
  });
}

// Prevent a previous cloud role from being reused during a new sign-in attempt.
document.addEventListener('submit', (event) => {
  const form = event.target instanceof HTMLFormElement ? event.target : null;
  if (form?.id !== 'auth-form') return;
  document.documentElement.removeAttribute('data-access-role');
  scheduleSync();
}, true);

const bodyObserver = new MutationObserver(scheduleSync);
bodyObserver.observe(document.body, { childList: true, subtree: true });

const accessObserver = new MutationObserver(scheduleSync);
accessObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-access-role'] });

window.addEventListener('online', scheduleSync);
window.addEventListener('offline', scheduleSync);
window.addEventListener('pageshow', scheduleSync);
window.addEventListener('load', scheduleSync, { once: true });
scheduleSync();

export const __test__ = Object.freeze({ closeSensitiveSurface });
