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

function makeWorker(spec, { offline = false } = {}) {
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
      return new Response('network shell', { status: 200 });
    },
  };
  const source = readFileSync(new URL('../' + spec.path, import.meta.url), 'utf8');
  vm.runInNewContext(source, context, { filename: spec.path });
  const guard = vm.runInNewContext(spec.guard, context);
  const fireFetch = (url, mode = 'navigate') => {
    let reply;
    listeners.get('fetch')({
      request: { method: 'GET', url, mode, destination: mode === 'navigate' ? 'document' : 'script' },
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
