const CACHE_VERSION = 'v563-1';
const ASSET_CACHE = `contagest-ve-${CACHE_VERSION}-assets`;
const SESSION_CACHE_PREFIX = `contagest-ve-${CACHE_VERSION}-session-`;
let SESSION_SCOPE = null;

const APP_SHELL = [
  '/', '/index.html', '/manifest.webmanifest', '/pwa-install.js',
  '/icons/contagest-app.svg', '/icons/contagest-app-192.svg', '/icons/contagest-app-512.svg',
  '/vendor/fontawesome/css/all.min.css',
  '/vendor/fontawesome/webfonts/fa-solid-900.woff2',
  '/vendor/fontawesome/webfonts/fa-regular-400.woff2',
  '/vendor/fontawesome/webfonts/fa-brands-400.woff2',
  '/vendor/fontawesome/webfonts/fa-v4compatibility.woff2',
  '/vendor/fonts/fonts.css',
  '/vendor/fonts/inter/Inter-Variable.ttf',
  '/vendor/fonts/jetbrains-mono/JetBrainsMono-Variable.ttf',
  '/vertical-assets/veterinary.svg', '/vertical-assets/dentistry.svg', '/vertical-assets/psychology.svg',
  '/vertical-assets/gym.svg', '/vertical-assets/nutrition.svg', '/vertical-assets/login-security.svg'
];

async function primeShell() {
  const cache = await caches.open(ASSET_CACHE);
  await Promise.allSettled(APP_SHELL.map((url) => cache.add(new Request(url, { cache: 'reload' }))));
}

self.addEventListener('install', (event) => {
  // Do not skipWaiting here: the current page keeps one coherent shell until the
  // runtime explicitly promotes the fully-installed replacement worker.
  event.waitUntil(primeShell());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith('contagest-ve-') && key !== ASSET_CACHE && !key.startsWith(SESSION_CACHE_PREFIX))
      .map((key) => caches.delete(key)));
    // Session caches are deliberately discarded across SW versions/upgrades.
    await Promise.all(keys.filter((key) => key.includes('-session-') && !key.startsWith(SESSION_CACHE_PREFIX)).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

function isSensitiveRequest(url) {
  return url.pathname.startsWith('/api/')
    || url.pathname.startsWith('/auth/')
    || url.pathname.includes('/licenses')
    || url.pathname.includes('/media')
    || url.pathname.includes('/admin');
}

function isPublicStaticAsset(url) {
  return APP_SHELL.includes(url.pathname)
    || url.pathname.startsWith('/assets/')
    || url.pathname.startsWith('/icons/')
    || url.pathname.startsWith('/vendor/')
    || url.pathname.startsWith('/vertical-assets/');
}

async function assetCacheMatch(request) {
  const cache = await caches.open(ASSET_CACHE);
  return cache.match(request);
}

async function networkFirst(request) {
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response.ok && (response.type === 'basic' || response.type === 'cors')) {
      const cache = await caches.open(ASSET_CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (await assetCacheMatch(request))
      || new Response('Recurso no disponible sin conexión.', { status: 503, headers: { 'X-CG-Offline': 'true' } });
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || isSensitiveRequest(url)) return;

  if (url.pathname === '/build-info.json') {
    event.respondWith(fetch(request, { cache: 'no-store' }).catch(() => new Response(JSON.stringify({
      schemaVersion: 1,
      product: 'contagest-erp',
      candidateSha: 'unavailable-offline',
      bound: false,
      error: 'BUILD_IDENTITY_OFFLINE'
    }), { status: 503, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-CG-Offline': 'true' } })));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request, { cache: 'no-store' });
        if (response.ok) {
          const cache = await caches.open(ASSET_CACHE);
          await cache.put('/index.html', response.clone());
        }
        return response;
      } catch {
        const cached = await assetCacheMatch('/index.html');
        if (!cached) return new Response('ContaGest no está disponible sin conexión.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-CG-Offline': 'true' } });
        const headers = new Headers(cached.headers);
        headers.set('X-CG-Offline', 'true');
        headers.set('X-CG-Stale', 'true');
        return new Response(await cached.blob(), { status: cached.status, statusText: cached.statusText, headers });
      }
    })());
    return;
  }

  if (request.destination === 'script' || request.destination === 'style') {
    event.respondWith(networkFirst(request));
    return;
  }

  if (!isPublicStaticAsset(url)) return;

  event.respondWith((async () => {
    const cached = await assetCacheMatch(request);
    const refresh = fetch(request, { cache: 'no-store' }).then(async (response) => {
      if (response.ok && (response.type === 'basic' || response.type === 'cors')) {
        const cache = await caches.open(ASSET_CACHE);
        await cache.put(request, response.clone());
      }
      return response;
    }).catch(() => cached);
    return cached || refresh || new Response('', { status: 503, headers: { 'X-CG-Offline': 'true' } });
  })());
});

async function clearSessionData(scopeToken) {
  const token = String(scopeToken || '').trim();
  const keys = await caches.keys();
  await Promise.all(keys
    .filter((key) => key.startsWith(SESSION_CACHE_PREFIX) && (!token || key === `${SESSION_CACHE_PREFIX}${token}`))
    .map((key) => caches.delete(key)));
  if (!token || SESSION_SCOPE?.scopeToken === token) SESSION_SCOPE = null;
}

async function recoverCache() {
  const keys = await caches.keys();
  await Promise.all(keys.filter((key) => key.startsWith('contagest-ve-')).map((key) => caches.delete(key)));
  SESSION_SCOPE = null;
  await primeShell();
  return { recovered: true, cacheVersion: CACHE_VERSION };
}

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'ACTIVATE_UPDATE') {
    self.skipWaiting();
    return;
  }
  if (data.type === 'SET_SESSION_SCOPE') {
    // Values are already non-reversible hashes; raw tenantId/userId are never logged or cached.
    SESSION_SCOPE = {
      scopeToken: String(data.scopeToken || ''),
      tenantId: String(data.tenantIdHash || ''),
      userId: String(data.userIdHash || '')
    };
    return;
  }
  if (data.type === 'CLEAR_SESSION_DATA' || data.type === 'CLEAR_APP_CACHE') {
    event.waitUntil(clearSessionData(data.scopeToken));
    return;
  }
  if (data.type === 'RECOVER_CACHE') {
    event.waitUntil(recoverCache().then((result) => event.ports?.[0]?.postMessage(result)).catch((error) => event.ports?.[0]?.postMessage({ recovered: false, error: String(error?.message || error) })));
  }
});
