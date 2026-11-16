// Security cache migration (#1292): activation must evict the older shell namespace.
const CACHE_VERSION = 'v563-3';
const ASSET_CACHE = `contagest-ve-${CACHE_VERSION}-assets`;
const SESSION_CACHE_PREFIX = `contagest-ve-${CACHE_VERSION}-session-`;
let SESSION_SCOPE = null;

const APP_SHELL = [
  './', './index.html', './manifest.webmanifest', './pwa-install.js',
  './icons/contagest-app.svg', './icons/contagest-app-192.svg', './icons/contagest-app-512.svg',
  './vendor/fontawesome/css/all.min.css',
  './vendor/fontawesome/webfonts/fa-solid-900.woff2',
  './vendor/fontawesome/webfonts/fa-regular-400.woff2',
  './vendor/fontawesome/webfonts/fa-brands-400.woff2',
  './vendor/fontawesome/webfonts/fa-v4compatibility.woff2',
  './vendor/fonts/fonts.css',
  './vendor/fonts/inter/Inter-Variable.ttf',
  './vendor/fonts/jetbrains-mono/JetBrainsMono-Variable.ttf',
  './vertical-assets/veterinary.svg', './vertical-assets/dentistry.svg', './vertical-assets/psychology.svg',
  './vertical-assets/gym.svg', './vertical-assets/nutrition.svg', './vertical-assets/login-security.svg'
];

function scoped(path) {
  return new URL(path, self.registration.scope).toString();
}

const APP_SHELL_URLS = new Set(APP_SHELL.map(scoped));
const STATIC_PREFIXES = ['./assets/', './icons/', './vendor/', './vertical-assets/']
  .map((prefix) => new URL(prefix, self.registration.scope).pathname);

function scopedPath(url) {
  const scopePath = new URL(self.registration.scope).pathname;
  if (!url.pathname.startsWith(scopePath)) return url.pathname;
  return `/${url.pathname.slice(scopePath.length)}`;
}

async function primeShell() {
  const cache = await caches.open(ASSET_CACHE);
  await Promise.allSettled([...APP_SHELL_URLS].map(async (url) => {
    // Cache.add() ignores HTTP no-store/private and can use session cookies.
    // The offline shell must be fetched without credentials and checked first.
    const request = new Request(url, { cache: 'reload', credentials: 'omit', redirect: 'error' });
    const response = await fetch(request);
    if (mayCachePublicResponse(response)) await cache.put(request, response);
  }));
}

self.addEventListener('install', (event) => {
  // Keep the current page on one coherent shell until the runtime explicitly
  // promotes a fully-installed replacement worker.
  event.waitUntil(primeShell());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith('contagest-ve-') && key !== ASSET_CACHE && !key.startsWith(SESSION_CACHE_PREFIX))
      .map((key) => caches.delete(key)));
    await Promise.all(keys
      .filter((key) => key.includes('-session-') && !key.startsWith(SESSION_CACHE_PREFIX))
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

const PRIVATE_QUERY_KEY = /^(?:t|token|access[_-]?token|refresh[_-]?token|id[_-]?token|auth|authorization|code|api[_-]?key|apikey|secret|password|session(?:[_-]?id)?|jwt|signature|sig|x-amz-(?:signature|credential)|x-goog-signature)$/i;
function hasPrivateQueryParameter(url) {
  // URLSearchParams decodes parameter names; avoid per-request array allocation.
  for (const key of url.searchParams.keys()) {
    if (PRIVATE_QUERY_KEY.test(key)) return true;
  }
  return false;
}

function isSensitiveRequest(url) {
  let pathname;
  try { pathname = decodeURIComponent(scopedPath(url)); }
  catch { return true; } // Malformed escapes must not use offline cache.
  return hasPrivateQueryParameter(url)
    || pathname === '/api'
    || pathname.startsWith('/api/')
    || pathname === '/auth'
    || pathname.startsWith('/auth/')
    // Same-origin Hípico pages must never receive the ERP offline shell.
    || /^\/(?:hipico-control|control-hipico)(?:\/|$)/.test(pathname)
    || pathname.includes('/licenses')
    || pathname.includes('/media')
    || pathname.includes('/admin');
}

function hasPrivateRequestHeaders(request) {
  // Header-bound requests cannot share the app-shell cache, even at a public URL.
  const headers = request.headers;
  return Boolean(headers?.has?.('authorization')
    || headers?.has?.('x-api-key')
    || headers?.has?.('x-hipico-bridge-token'));
}

function isPublicStaticAsset(url) {
  return APP_SHELL_URLS.has(url.toString())
    || STATIC_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
}

function mayCachePublicResponse(response) {
  if (!response.ok || (response.type !== 'basic' && response.type !== 'cors')) return false;
  // CacheStorage does not honor HTTP Cache-Control on its own.
  const directives = (response.headers.get('cache-control') || '')
    .split(',').map((part) => part.trim().split('=')[0].toLowerCase());
  if (directives.includes('private') || directives.includes('no-store')) return false;
  return !(response.headers.get('vary') || '')
    .split(',').some((header) => header.trim() === '*');
}

async function assetCacheMatch(request) {
  const cache = await caches.open(ASSET_CACHE);
  return cache.match(request);
}

function fetchPublicAsset(request) {
  // Offline assets are public and must not inherit a logged-in user's cookies.
  return fetch(request, { cache: 'no-store', credentials: 'omit', redirect: 'error' });
}

async function networkFirst(request) {
  try {
    const response = await fetchPublicAsset(request);
    if (mayCachePublicResponse(response)) {
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
  if (url.origin !== self.location.origin || isSensitiveRequest(url) || hasPrivateRequestHeaders(request)) return;

  if (url.toString() === scoped('./build-info.json')) {
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
      const shellUrl = scoped('./index.html');
      try {
        // Navigations can carry login cookies. Only install's credential-free
        // public fetch may populate the shared offline HTML shell.
        return await fetch(request, { cache: 'no-store' });
      } catch {
        const cached = await assetCacheMatch(shellUrl);
        if (!cached) return new Response('ContaGest no está disponible sin conexión.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-CG-Offline': 'true' } });
        const headers = new Headers(cached.headers);
        headers.set('X-CG-Offline', 'true');
        headers.set('X-CG-Stale', 'true');
        return new Response(await cached.blob(), { status: cached.status, statusText: cached.statusText, headers });
      }
    })());
    return;
  }

  // Scripts and styles must also be in the public allowlist.
  if (!isPublicStaticAsset(url)) return;

  if (request.destination === 'script' || request.destination === 'style') {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith((async () => {
    const cached = await assetCacheMatch(request);
    const refresh = fetchPublicAsset(request).then(async (response) => {
      if (mayCachePublicResponse(response)) {
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
