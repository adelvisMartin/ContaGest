const CACHE = 'contagest-ve-v11-13-0';
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/assets/img/logo.png'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).catch(() => undefined));
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

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || isSensitiveRequest(url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .catch(() => caches.match('/index.html').then((cached) => cached || new Response('ContaGest no está disponible sin conexión.', { status: 503 })))
    );
    return;
  }

  const cacheableAsset = ['style', 'script', 'image', 'font', 'manifest'].includes(request.destination);
  if (!cacheableAsset) return;

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok && response.type === 'basic') {
        caches.open(CACHE).then((cache) => cache.put(request, response.clone())).catch(() => undefined);
      }
      return response;
    }))
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'CLEAR_APP_CACHE') {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('contagest-ve-')).map((key) => caches.delete(key)))));
  }
});
