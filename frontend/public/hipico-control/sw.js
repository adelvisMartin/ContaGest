const CACHE_VERSION = 'hipico-control-v1.13.0-rc3';
const SHELL_CACHE = `${CACHE_VERSION}-shell-r6-race-context`;
const APP_SHELL = [
  './', './index.html', './recovery.html', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-192-maskable.png', './icons/icon-512-maskable.png',
  './logo-control-hipico.png', './assets/css/app.css', './assets/css/operational-copy-center.css',
  './assets/js/compat.js', './assets/js/app.js', './assets/js/config.js', './assets/js/engine.js', './assets/js/format.js',
  './assets/js/seed.js', './assets/js/store.js', './assets/js/store-v2.js', './assets/js/offline-status.js', './assets/js/reports.js',
  './assets/js/sync.js', './assets/js/supabase.js', './assets/js/local-auth.js', './assets/js/ui.js', './assets/js/workspace.js',
  './assets/js/whatsapp.js', './assets/js/whatsapp/normalization.js', './assets/js/whatsapp/parser.js', './assets/js/whatsapp/ui-transcript.js',
  './assets/js/operational-ledger.js', './assets/js/operational-copy-center.js', './assets/js/race-context-guard.js',
  './assets/js/backup.js', './assets/js/backup-v2.js', './assets/js/backup-secure-ui.js', './assets/js/recovery.js',
  './assets/js/password-recovery.js', './assets/js/user-access.js', './assets/js/help-center.js', './assets/js/resilience.js', './assets/js/agent-router-pro.js',
  './assets/js/race-state-machine.js'
];

function scoped(path) { return new URL(path, self.registration.scope).toString(); }
const APP_SHELL_URLS = new Set(APP_SHELL.map(scoped));
function isSensitive(url) { return /\/(?:api|auth)(?:\/|$)|session|token|license|webhook|rpc|rest\/v1/i.test(url.pathname); }
function isRuntimeMetadata(url) { return url.pathname.endsWith('/runtime-config.js') || url.pathname.endsWith('/build-info.json'); }
function isAllowedStatic(url) { return APP_SHELL_URLS.has(url.toString()); }

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll([...APP_SHELL_URLS]);
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
  if (url.origin !== scope.origin) return;
  if (isSensitive(url) || isRuntimeMetadata(url)) { event.respondWith(fetch(request, { cache: 'no-store' })); return; }
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try { return await fetch(request, { cache: 'no-store' }); }
      catch (_) { return (await caches.match(scoped('./index.html'))) || (await caches.match(scoped('./recovery.html'))) || Response.error(); }
    })());
    return;
  }
  if (!isAllowedStatic(url)) { event.respondWith(fetch(request, { cache: 'no-store' })); return; }
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request, { cache: 'no-store' });
    if (response.ok) { const cache = await caches.open(SHELL_CACHE); await cache.put(request, response.clone()); }
    return response;
  })());
});
self.addEventListener('message', (event) => { if (event.data?.type === 'SKIP_WAITING') self.skipWaiting(); });
