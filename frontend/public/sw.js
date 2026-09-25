const CACHE = 'contagest-ve-v70-assets-1';
const APP_SHELL = [
  '/', '/index.html', '/manifest.webmanifest',
  '/icons/contagest-app.svg', '/icons/contagest-app-192.svg', '/icons/contagest-app-512.svg',
  '/vendor/fontawesome/css/all.min.css',
  '/vendor/fontawesome/webfonts/fa-solid-900.woff2',
  '/vendor/fontawesome/webfonts/fa-regular-400.woff2',
  '/vendor/fontawesome/webfonts/fa-brands-400.woff2',
  '/vendor/fontawesome/webfonts/fa-v4compatibility.woff2',
  '/vendor/fonts/fonts.css',
  '/vendor/fonts/inter/Inter-Variable.ttf',
  '/vendor/fonts/jetbrains-mono/JetBrainsMono-Variable.ttf',
  '/vertical-assets/veterinary.svg',
  '/vertical-assets/dentistry.svg',
  '/vertical-assets/psychology.svg',
  '/vertical-assets/gym.svg',
  '/vertical-assets/nutrition.svg',
  '/vertical-assets/login-security.svg'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) => Promise.allSettled(
      APP_SHELL.map((url) => cache.add(new Request(url, { cache:'reload' })))
    ))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('contagest-ve-') && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function isSensitiveRequest(url) {
  return url.pathname.startsWith('/api/')
    || url.pathname.includes('/auth/')
    || url.pathname.includes('/licenses')
    || url.pathname.includes('/media')
    || url.pathname.includes('/admin');
}

function networkFirst(request) {
  return fetch(request, { cache:'no-store' })
    .then((response) => {
      if (response.ok && (response.type === 'basic' || response.type === 'cors')) {
        caches.open(CACHE).then((cache) => cache.put(request, response.clone())).catch(() => undefined);
      }
      return response;
    })
    .catch(() => caches.match(request).then((cached) => cached || new Response('Recurso no disponible sin conexión.', { status:503 })));
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || isSensitiveRequest(url)) return;

  // Build identity is release evidence. It must never be satisfied by a stale
  // service-worker cache because #182 compares the served SHA with the exact
  // candidate being promoted.
  if (url.pathname === '/build-info.json') {
    event.respondWith(fetch(request, { cache:'no-store' }).catch(() => new Response(JSON.stringify({
      schemaVersion:1,
      product:'contagest-erp',
      candidateSha:'unavailable-offline',
      bound:false,
      error:'BUILD_IDENTITY_OFFLINE'
    }), { status:503, headers:{ 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' } })));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache:'no-store' })
        .then((response) => {
          if (response.ok) {
            caches.open(CACHE).then((cache) => cache.put('/index.html', response.clone())).catch(() => undefined);
          }
          return response;
        })
        .catch(() => caches.match('/index.html').then((cached) => cached || new Response('ContaGest no está disponible sin conexión.', {
          status:503,
          headers:{ 'Content-Type':'text/plain; charset=utf-8' }
        })))
    );
    return;
  }

  // JS and CSS must prefer the network so a deployment cannot leave an open
  // browser tab mixing an old UI bundle with a newly deployed backend.
  if (request.destination === 'script' || request.destination === 'style') {
    event.respondWith(networkFirst(request));
    return;
  }

  const cacheableAsset = ['image', 'font', 'manifest'].includes(request.destination)
    || ['/manifest.webmanifest', '/icons/contagest-app.svg', '/icons/contagest-app-192.svg', '/icons/contagest-app-512.svg', '/pwa-install.js'].includes(url.pathname);
  if (!cacheableAsset) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const refresh = fetch(request).then((response) => {
        if (response.ok && (response.type === 'basic' || response.type === 'cors')) {
          caches.open(CACHE).then((cache) => cache.put(request, response.clone())).catch(() => undefined);
        }
        return response;
      }).catch(() => cached);
      return cached || refresh;
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'CLEAR_APP_CACHE') {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('contagest-ve-')).map((key) => caches.delete(key)))));
  }
});
