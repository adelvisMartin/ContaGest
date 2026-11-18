const CACHE_VERSION = 'hipico-control-v1.13.0-rc3';
// Security cache migration (#1292): never reuse the previous shell namespace.
const SHELL_CACHE = `${CACHE_VERSION}-shell-r39-consolidator-v4-1-3`;
const APP_SHELL = [
  './', './index.html', './recovery.html', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-192-maskable.png', './icons/icon-512-maskable.png',
  './assets/css/app.css', './assets/css/platform-tokens-v1.css', './assets/css/ui-system-v3-compat.css', './assets/css/ui-system-v4.css', './assets/css/ui-system-v4-convergence.css',
  './assets/js/advanced-group-scope.js', './assets/js/agent-router-pro.js', './assets/js/agent-router.js', './assets/js/app-shell.js', './assets/js/app.js', './assets/js/pwa-update.js',
  './assets/js/theme-bootstrap.js', './assets/js/presentation-preferences.js', './assets/js/shell-ui-v4.js', './assets/js/control-accessibility.js', './assets/js/command-center.js', './assets/js/command-center-shell.js',
  './assets/js/backup-secure-ui.js', './assets/js/backup-v2.js', './assets/js/backup.js', './assets/js/compat.js', './assets/js/dialog-accessibility.js',
  './assets/js/cloud-tab-signal.js',
  './assets/js/config.js', './assets/js/engine.js', './assets/js/financial-config-guard.js', './assets/js/format.js', './assets/js/help-center.js',
  './assets/js/local-auth.js', './assets/js/notice-bridge.js', './assets/js/offline-status.js', './assets/js/operational-access-guard.js',
  './assets/js/operational-access-policy.js', './assets/js/operational-copy-center.js', './assets/js/operational-ledger.js', './assets/js/operations.js',
  './assets/js/password-recovery.js', './assets/js/presentation-access.js', './assets/js/race-context-guard.js', './assets/js/race-opening-assistant.js', './assets/js/race-finalization.js',
  './assets/js/race-state-machine.js', './assets/js/rc1-recovery.js', './assets/js/recovery.js', './assets/js/reports.js',
  './assets/js/resilience.js', './assets/js/reference-report-consolidator.js', './assets/js/reference-report-consolidator-ui.js', './assets/js/reference-report-consolidator-image.js', './assets/js/reference-report-operations.js', './assets/js/reference-report-projections.js', './assets/js/reference-report-ui.js', './assets/js/seed.js', './assets/js/store-v2.js', './assets/js/store.js',
  './assets/js/supabase.js', './assets/js/sync.js', './assets/js/ui.js', './assets/js/user-access.js',
  './assets/js/whatsapp.js', './assets/js/workspace-input-safety.js', './assets/js/workspace.js', './assets/js/whatsapp/normalization.js', './assets/js/whatsapp/parser.js',
  './assets/js/whatsapp/race-context.js', './assets/js/whatsapp/ui-transcript.js'
];

function scoped(path) { return new URL(path, self.registration.scope).toString(); }
const APP_SHELL_URLS = new Set(APP_SHELL.map(scoped));
const PRIVATE_QUERY_KEY = /^(?:t|token|access[_-]?token|refresh[_-]?token|id[_-]?token|auth|authorization|code|api[_-]?key|apikey|secret|password|session(?:[_-]?id)?|jwt|signature|sig|x-amz-(?:signature|credential)|x-goog-signature)$/i;
function hasPrivateQueryParameter(url) {
  for (const key of url.searchParams.keys()) {
    if (PRIVATE_QUERY_KEY.test(key.normalize('NFKC'))) return true;
  }
  return false;
}
function isSensitive(url) {
  if (hasPrivateQueryParameter(url)) return true;
  let pathname;
  if (/%25/i.test(url.pathname)) return true;
  try { pathname = decodeURIComponent(url.pathname); }
  catch { return true; } // Malformed escapes must not reach offline fallback.
  return /\/(?:api|auth)(?:\/|$)|session|token|license|webhook|rpc|rest\/v1/i.test(pathname);
}
function hasPrivateRequestHeaders(request) {
  const headers = request.headers;
  return Boolean(headers?.has?.('authorization')
    || headers?.has?.('x-api-key')
    || headers?.has?.('x-hipico-bridge-token'));
}
function isRuntimeMetadata(url) { return url.pathname.endsWith('/runtime-config.js') || url.pathname.endsWith('/build-info.json'); }
function isAllowedStatic(url) { return APP_SHELL_URLS.has(url.toString()); }
function cacheablePublicResponse(response) {
  if (!response.ok) return false;
  // A static allowlisted URL can still receive an explicit private response.
  const cacheControl = (response.headers.get('cache-control') || '').toLowerCase();
  if (/(?:^|,)\s*(?:no-store|private)(?:\s*(?:,|=|$))/.test(cacheControl)) return false;
  return !(response.headers.get('vary') || '').toLowerCase().split(',')
    .some((name) => ['*', 'cookie', 'authorization', 'x-api-key'].includes(name.trim()));
}
function offlineNavigationShell(url) {
  return url.pathname.endsWith('/recovery.html') ? './recovery.html' : './index.html';
}

async function primeShell() {
  const cache = await caches.open(SHELL_CACHE);
  // addAll() may persist authenticated or no-store responses; explicitly
  // fetch without credentials and reject unsafe resources before writing.
  await Promise.all([...APP_SHELL_URLS].map(async (url) => {
    const request = new Request(url, { cache: 'reload', credentials: 'omit', redirect: 'error' });
    const response = await fetch(request);
    if (!cacheablePublicResponse(response)) throw new Error('HIPICO_PRIVATE_SHELL_RESPONSE');
    await cache.put(request, response);
  }));
}
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    await primeShell();
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('hipico-control-') && key !== SHELL_CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const scope = new URL(self.registration.scope);
  // Controlled clients can fetch same-origin ERP/API paths outside this
  // registration scope. Those requests belong to the browser/other worker.
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  if (hasPrivateRequestHeaders(request) || isSensitive(url) || isRuntimeMetadata(url)) { event.respondWith(fetch(request, { cache: 'no-store' })); return; }
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try { return await fetch(request, { cache: 'no-store' }); }
      catch (_) {
        const cache = await caches.open(SHELL_CACHE);
        const preferred = offlineNavigationShell(url);
        return (await cache.match(scoped(preferred))) || (await cache.match(scoped('./recovery.html'))) || Response.error();
      }
    })());
    return;
  }
  if (!isAllowedStatic(url)) { event.respondWith(fetch(request, { cache: 'no-store' })); return; }
  event.respondWith((async () => {
    const cache = await caches.open(SHELL_CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    // Public allowlisted assets must never be fetched with session cookies.
    const response = await fetch(request, { cache: 'no-store', credentials: 'omit', redirect: 'error' });
    if (cacheablePublicResponse(response)) await cache.put(request, response.clone());
    return response;
  })());
});
self.addEventListener('message', (event) => { if (event.data?.type === 'SKIP_WAITING') self.skipWaiting(); });
