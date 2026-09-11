import { getAppMode } from './store.js';
import { canUseOperationalCenter } from './operational-access-policy.js';

const ROOT_ID = 'hipico-operational-copy-center';
let scheduled = false;
let generation = 0;
let centerModulePromise = null;
let centerModule = null;

function closeSensitiveSurface(root) {
  root?.querySelector('dialog[open]')?.close?.();
}

async function ensureCenterLoaded() {
  if (!centerModulePromise) {
    centerModulePromise = import('./operational-copy-center.js').catch((error) => {
      centerModulePromise = null;
      centerModule = null;
      throw error;
    });
  }
  const module = await centerModulePromise;
  centerModule = module;
  return module.mountOperationalCopyCenter?.() || document.getElementById(ROOT_ID);
}

function applyAuthorization(root, authorized) {
  if (!root) return;
  if (!authorized) closeSensitiveSurface(root);
  root.dataset.opsAuthorized = authorized ? 'true' : 'false';
  root.toggleAttribute('inert', !authorized);
  root.setAttribute('aria-hidden', authorized ? 'false' : 'true');
}

function revokeCenter(root = document.getElementById(ROOT_ID)) {
  applyAuthorization(root, false);
  centerModule?.resetOperationalCopyCenter?.();
}

async function syncAuthorization() {
  const currentGeneration = ++generation;
  const hasShell = Boolean(document.querySelector('#app .shell'));
  const blocked = Boolean(document.querySelector('.access-blocker'));
  const cloudRole = document.documentElement.dataset.accessRole || '';
  let mode = null;
  try { mode = await getAppMode(); } catch { mode = null; }
  if (currentGeneration !== generation) return;

  const authorized = canUseOperationalCenter({ mode, hasShell, cloudRole, blocked });
  let root = document.getElementById(ROOT_ID);
  if (!authorized) {
    revokeCenter(root);
    return;
  }

  // Sensitive UI code is fetched/evaluated only after the current identity has
  // satisfied the shell/mode/role gate. The module itself has no auto-boot.
  try { root = await ensureCenterLoaded(); }
  catch {
    if (currentGeneration === generation) window.dispatchEvent(new CustomEvent('hipico:notice', { detail: { message: 'No se pudo cargar el centro operativo.' } }));
    return;
  }
  if (currentGeneration !== generation) {
    revokeCenter(root);
    return;
  }
  applyAuthorization(root, true);
}

function scheduleSync() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    syncAuthorization().catch(() => {});
  });
}

// A new sign-in must never inherit an authorization role or sensitive DOM/state
// from the previous cloud identity.
document.addEventListener('submit', (event) => {
  const form = event.target instanceof HTMLFormElement ? event.target : null;
  if (form?.id !== 'auth-form') return;
  document.documentElement.removeAttribute('data-access-role');
  revokeCenter();
  scheduleSync();
}, true);

const appRoot = document.getElementById('app');
if (appRoot) new MutationObserver(scheduleSync).observe(appRoot, { childList: true });
new MutationObserver(scheduleSync).observe(document.body, { childList: true });
new MutationObserver(scheduleSync).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['data-access-role']
});

window.addEventListener('pageshow', scheduleSync);
window.addEventListener('load', scheduleSync, { once: true });
scheduleSync();

export const __test__ = Object.freeze({ closeSensitiveSurface, applyAuthorization, revokeCenter });
