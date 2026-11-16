import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// #1292: exercise both real workers, not a reimplemented URL classifier.
// The harness models only fetch/caching; no sessions, accounts, or third-party data.
const WORKERS = [
  { path: 'frontend/public/sw.js', scope: 'https://qa.example.test/', guard: 'isSensitiveRequest', intercepts: false },
  { path: 'frontend/public/hipico-control/sw.js', scope: 'https://qa.example.test/hipico-control/', guard: 'isSensitive', intercepts: true },
];

function makeWorker(spec, { offline = false, responseHeaders = {}, asPublicResponse = false } = {}) {
  const listeners = new Map();
  const fetchCalls = [];
  const cacheWrites = [];
  const cacheReads = [];
  const cache = {
    match: async (request) => {
      cacheReads.push(String(request?.url || request));
      return new Response('cached public shell', { status: 200 });
    },
    put: async (request) => {
      cacheWrites.push(String(request?.url || request));
    },
  };
  const context = {
    URL, Request, Response, Headers,
    self: {
      location: { origin: new URL(spec.scope).origin },
      registration: { scope: spec.scope },
      addEventListener: (name, callback) => listeners.set(name, callback),
    },
    caches: {
      open: async () => cache,
      keys: async () => [],
      delete: async () => true,
    },
    fetch: async (request, options) => {
      fetchCalls.push({ url: request.url, cache: options?.cache });
      if (offline) throw new Error('NETWORK_OFFLINE');
      const response = new Response('network shell', { status: 200, headers: responseHeaders });
      // Node Response.type is "default"; browsers return "basic" for same-origin.
      if (asPublicResponse) Object.defineProperty(response, 'type', { value: 'basic' });
      return response;
    },
  };
  const source = readFileSync(new URL('../' + spec.path, import.meta.url), 'utf8');
  vm.runInNewContext(source, context, { filename: spec.path });
  const guard = vm.runInNewContext(spec.guard, context);
  const fireFetch = (url, mode = 'navigate', headers = {}) => {
    let reply;
    listeners.get('fetch')({
      request: { method: 'GET', url, mode, destination: mode === 'navigate' ? 'document' : 'script', headers: new Headers(headers) },
      respondWith: (result) => { reply = Promise.resolve(result); },
    });
    return reply;
  };
  return { guard, fireFetch, fetchCalls, cacheWrites, cacheReads };
}

for (const spec of WORKERS) {
  test('#1292 ' + spec.path + ': deny sensitive URL parameters, allow public queries', () => {
    const worker = makeWorker(spec);
    const protectedParams = [
      't=private', 'ToKeN=private', '%61ccess_token=private',
      'refresh_token=private', 'id_token=private', 'code=private',
      'api_key=private', 'signature=private', 'x-amz-signature=private',
    ];
    for (const query of protectedParams) {
      const url = new URL('?'+query, spec.scope);
      assert.equal(worker.guard(url), true, query);
    }
    for (const query of ['page=2', 'theme=dark', 'tally=4']) {
      const url = new URL('?'+query, spec.scope);
      assert.equal(worker.guard(url), false, query);
    }
    for (const encoded of ['%61pi/v1/private', 'auth%2Fsession', '%E0%A4%A']) {
      assert.equal(worker.guard(new URL(encoded, spec.scope)), true, encoded);
    }
    assert.equal(worker.guard(new URL('api/v1/private', spec.scope)), true);
    assert.equal(worker.guard(new URL('index.html', spec.scope)), false);
  });

  test('#1292 ' + spec.path + ': secret-bearing navigation never reaches offline shell/cache', async () => {
    const worker = makeWorker(spec);
    const privateUrl = new URL('index.html?t=secret-value', spec.scope).href;
    const response = worker.fireFetch(privateUrl);
    assert.equal(Boolean(response), spec.intercepts);
    if (response) {
      assert.equal((await response).status, 200);
      assert.equal(worker.fetchCalls.length, 1);
      assert.equal(worker.fetchCalls[0].cache, 'no-store');
    } else {
      assert.equal(worker.fetchCalls.length, 0);
    }
    assert.equal(worker.cacheWrites.length, 0);
    assert.equal(worker.cacheReads.length, 0);
  });

  test('#1292 ' + spec.path + ': non-public scripts cannot be persisted by the SW', async () => {
    const worker = makeWorker(spec);
    const response = worker.fireFetch(new URL('private-output.js', spec.scope).href, 'script');
    assert.equal(Boolean(response), spec.intercepts);
    if (response) {
      assert.equal((await response).status, 200);
      assert.equal(worker.fetchCalls[0].cache, 'no-store');
    }
    assert.equal(worker.cacheWrites.length, 0);
    assert.equal(worker.cacheReads.length, 0);
  });

  test('#1292 ' + spec.path + ': normal offline navigation still uses public shell', async () => {
    const worker = makeWorker(spec, { offline: true });
    const response = worker.fireFetch(new URL('index.html', spec.scope).href);
    assert.ok(response, 'public offline shell should be handled by the service worker');
    const result = await response;
    assert.equal(result.status, 200);
    assert.equal(await result.text(), 'cached public shell');
    assert.equal(worker.cacheWrites.length, 0);
    assert.equal(worker.cacheReads.length, 1);
  });
}

test('#1292 ERP SW never stores HTTP private/no-store/Vary:* asset responses', async () => {
  const spec = WORKERS[0];
  for (const headers of [
    { 'Cache-Control': 'private, max-age=3600' },
    { 'Cache-Control': 'public, no-store' },
    { 'Vary': '*' }
  ]) {
    const worker = makeWorker(spec, { responseHeaders: headers, asPublicResponse: true });
    const response = worker.fireFetch(new URL('assets/public.js', spec.scope).href, 'script');
    assert.equal((await response).status, 200);
    assert.equal(worker.cacheWrites.length, 0, JSON.stringify(headers));
  }
  const publicWorker = makeWorker(spec, { asPublicResponse: true });
  assert.equal((await publicWorker.fireFetch(new URL('assets/public.js', spec.scope).href, 'script')).status, 200);
  assert.equal(publicWorker.cacheWrites.length, 1, 'ordinary public assets remain cacheable');
});

test('#1292 ERP SW never poisons its public shell with arbitrary route HTML', async () => {
  const spec = WORKERS[0];
  const dynamicWorker = makeWorker(spec, { asPublicResponse: true });
  assert.equal((await dynamicWorker.fireFetch(new URL('?module=private-output', spec.scope).href)).status, 200);
  assert.equal(dynamicWorker.cacheWrites.length, 0, 'dynamic navigation must not overwrite the public shell');
  const privateShell = makeWorker(spec, {
    responseHeaders: { 'Cache-Control': 'no-store' }, asPublicResponse: true
  });
  assert.equal((await privateShell.fireFetch(spec.scope)).status, 200);
  assert.equal(privateShell.cacheWrites.length, 0, 'no-store HTML must not be copied to CacheStorage');
  const publicShell = makeWorker(spec, { asPublicResponse: true });
  assert.equal((await publicShell.fireFetch(spec.scope)).status, 200);
  assert.equal(publicShell.cacheWrites.length, 1, 'cacheable public entrypoint can still refresh the shell');
});

test('#1292 ERP SW does not supply Hipico offline shell or cache a different product', async () => {
  const spec = WORKERS[0];
  const worker = makeWorker(spec, { offline: true });
  for (const path of ['hipico-control/', 'hipico-control/index.html', 'control-hipico/']) {
    const url = new URL(path, spec.scope);
    assert.equal(worker.guard(url), true, path);
    assert.equal(worker.fireFetch(url.href), undefined, path);
  }
  assert.equal(worker.cacheReads.length, 0);
  assert.equal(worker.cacheWrites.length, 0);
});

test('#1292 Hipico SW never intercepts same-origin ERP or external-scope navigations', () => {
  const worker = makeWorker(WORKERS[1], { offline: true });
  for (const url of ['https://qa.example.test/', 'https://qa.example.test/index.html',
    'https://qa.example.test/api/v1/hipico-bot', 'https://qa.example.test/assets/app.js']) {
    assert.equal(worker.fireFetch(url), undefined, url);
  }
  assert.equal(worker.cacheReads.length, 0);
  assert.equal(worker.cacheWrites.length, 0);
  assert.equal(worker.fetchCalls.length, 0);
});

test('#1292 requests bound to an authorization header are excluded from both offline caches', async () => {
  for (const spec of WORKERS) {
    for (const name of ['Authorization', 'X-Api-Key', 'X-Hipico-Bridge-Token']) {
      const worker = makeWorker(spec, { offline: false, asPublicResponse: true });
      const request = worker.fireFetch(new URL('index.html', spec.scope).href, 'navigate', { [name]: 'synthetic-credential' });
      assert.equal(Boolean(request), spec.intercepts, spec.path + ':' + name);
      if (request) {
        assert.equal((await request).status, 200);
        assert.equal(worker.fetchCalls[0]?.cache, 'no-store');
      }
      assert.equal(worker.cacheReads.length, 0, spec.path + ':' + name);
      assert.equal(worker.cacheWrites.length, 0, spec.path + ':' + name);
    }
  }
});
