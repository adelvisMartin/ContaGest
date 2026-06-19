const CACHE = 'contagest-ve-v11-1';
const STATIC_ASSETS = ['./', './index.html', './manifest.webmanifest', './assets/img/logo.png', './assets/img/contagest-logo.svg'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(STATIC_ASSETS)).catch(() => undefined));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const isLocalDev = ['localhost', '127.0.0.1'].includes(url.hostname);
  const isViteAsset = url.pathname.includes('/src/') || url.pathname.includes('/@vite') || url.pathname.includes('/node_modules/') || url.pathname.endsWith('.js') || url.pathname.endsWith('.css');
  if (isLocalDev || isViteAsset) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }).catch(() => new Response('', { status: 204 })));
    return;
  }
  event.respondWith(fetch(event.request).then((response) => {
    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => undefined);
    return response;
  }).catch(() => caches.match(event.request).then((res) => res || caches.match('./index.html') || new Response('', { status: 503 }))));
});
