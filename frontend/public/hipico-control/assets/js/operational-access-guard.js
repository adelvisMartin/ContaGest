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
  if (currentGeneration !== generation || !root) return;

  const authorized = canUseOperationalCenter({ mode, hasShell, cloudRole, blocked });
  if (!authorized) closeSensitiveSurface(root);
  root.dataset.opsAuthorized = authorized ? 'true' : 'false';
  root.toggleAttribute('inert', !authorized);
  root.setAttribute('aria-hidden', authorized ? 'false' : 'true');
}

function scheduleSync() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    syncAuthorization().catch(() => {});
  });
}

// A new sign-in must never inherit an authorization role from the previous cloud identity.
document.addEventListener('submit', (event) => {
  const form = event.target instanceof HTMLFormElement ? event.target : null;
  if (form?.id !== 'auth-form') return;
  document.documentElement.removeAttribute('data-access-role');
  scheduleSync();
}, true);

const appRoot = document.getElementById('app');
if (appRoot) new MutationObserver(scheduleSync).observe(appRoot, { childList: true });
// access-blocker and operational root are direct body children; observing only this level avoids
// waking the guard for every table row/card mutation on low-spec operator PCs.
new MutationObserver(scheduleSync).observe(document.body, { childList: true });
new MutationObserver(scheduleSync).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['data-access-role']
});

window.addEventListener('pageshow', scheduleSync);
window.addEventListener('load', scheduleSync, { once: true });
scheduleSync();

export const __test__ = Object.freeze({ closeSensitiveSurface });
