const CACHE_VERSION = 'hipico-control-v1.13.0-rc2';
const APP_SHELL = [
  './', './index.html', './recovery.html', './manifest.webmanifest', './runtime-config.js', './build-info.json',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-192-maskable.png', './icons/icon-512-maskable.png',
  './logo-control-hipico.png', './assets/css/styles.css', './assets/css/tokens.css', './assets/css/themes.css',
  './assets/css/operations-pro.css', './assets/css/recovery.css', './assets/js/compat.js', './assets/js/app.js',
  './assets/js/config.js', './assets/js/engine.js', './assets/js/format.js', './assets/js/seed.js', './assets/js/store.js',
  './assets/js/reports.js', './assets/js/sync.js', './assets/js/supabase.js', './assets/js/local-auth.js', './assets/js/ui.js',
  './assets/js/workspace.js', './assets/js/whatsapp.js', './assets/js/backup.js', './assets/js/recovery.js',
  './assets/js/resilience.js', './assets/js/agent-router-pro.js', './assets/js/race-state-machine.js'
];

function scoped(path) { return new URL(path, self.registration.scope).toString(); }
function isSensitive(url) {
  return /\/(?:api|auth)(?:\/|$)|session|token|license|webhook/i.test(url.pathname);
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    await cache.addAll(APP_SHELL.map(scoped));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('hipico-control-') && key !== CACHE_VERSION).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin) return;

  if (isSensitive(url)) {
    event.respondWith(fetch(request, { cache: 'no-store' }));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        const cache = await caches.open(CACHE_VERSION);
        cache.put(request, fresh.clone()).catch(() => {});
        return fresh;
      } catch (_) {
        return (await caches.match(request)) || (await caches.match(scoped('./index.html'))) || (await caches.match(scoped('./recovery.html')));
      }
    })());
    return;
  }

  if (url.pathname.endsWith('/runtime-config.js') || url.pathname.endsWith('/build-info.json')) {
    event.respondWith(fetch(request, { cache: 'no-store' }).catch(() => caches.match(request)));
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(CACHE_VERSION);
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    } catch (_) {
      return cached || Response.error();
    }
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
