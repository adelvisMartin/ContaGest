import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Exercise the actual client module with isolated browser primitives; the
// separate Chromium E2E verifies native IndexedDB and CacheStorage behavior.
const source = readFileSync(new URL('../frontend/src/services/pwaOfflineService.js', import.meta.url), 'utf8')
  .replace(/^export\s+/gm, '');

function serviceContext(overrides = {}) {
  const context = vm.createContext({
    ...overrides,
    localStorage: overrides.localStorage || {
      getItem: () => null, removeItem: () => {}, get length() { return 0; }, key: () => null
    }
  });
  vm.runInContext(source, context, { filename: 'frontend/src/services/pwaOfflineService.js' });
  return {
    service: {
      sessionScope: vm.runInContext('sessionScope', context),
      setServiceWorkerSession: vm.runInContext('setServiceWorkerSession', context),
      purgeOfflineSession: vm.runInContext('purgeOfflineSession', context)
    },
    context
  };
}

const a = { tenantId: 'tenant-a', user: { id: 'user-a' } };
const b = { tenantId: 'tenant-b', user: { id: 'user-b' } };

test('#1292 delayed worker registration must not restore a logged-out or switched tenant', async () => {
  const messages = [];
  const worker = { postMessage: (message) => messages.push(message) };
  let resolveReady;
  const ready = new Promise((resolve) => { resolveReady = resolve; });
  let currentSession = a;
  const browser = { serviceWorker: { controller: null, ready } };
  const { service } = serviceContext({
    navigator: browser,
    localStorage: { getItem: () => currentSession ? JSON.stringify(currentSession) : null }
  });

  service.setServiceWorkerSession(a);
  currentSession = b;
  resolveReady({ active: worker });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(messages.length, 0, 'a stale login must not overwrite tenant B');

  service.setServiceWorkerSession(b);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(messages.length, 1);
  assert.equal(messages[0].scopeToken, service.sessionScope(b));

  browser.serviceWorker.controller = worker;
  service.setServiceWorkerSession(b);
  assert.equal(messages.length, 2, 'active controllers receive exactly one message');
  browser.serviceWorker.controller = null;

  currentSession = a;
  service.setServiceWorkerSession(a);
  currentSession = null;
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(messages.length, 2, 'a deferred login must not restore a logged-out scope');
});

test('#1292 session purge removes exact legacy/current keys, not adjacent tenant keys', async () => {
  const deletedCaches = [];
  const deletedDatabases = [];
  const names = new Map();
  const authKey = 'contagest_auth_session';
  names.set(authKey, JSON.stringify(a));
  const storage = {
    getItem: (key) => names.get(key) ?? null,
    removeItem: (key) => names.delete(key),
    get length() { return names.size; },
    key: (i) => [...names.keys()][i] ?? null
  };
  const worker = { postMessage: () => {} };
  const cacheNames = [];
  const browser = {
    navigator: { serviceWorker: { controller: worker, ready: Promise.resolve({ active: worker }) } },
    localStorage: storage,
    caches: {
      keys: async () => [...cacheNames],
      delete: async (name) => { deletedCaches.push(name); return true; }
    },
    indexedDB: {
      databases: async () => [
        { name: databaseA }, { name: databaseNeighbor }, { name: databaseB }
      ],
      deleteDatabase: (name) => {
        const request = {};
        Promise.resolve().then(() => { deletedDatabases.push(name); request.onsuccess?.(); });
        return request;
      }
    }
  };
  const { service } = serviceContext(browser);
  const scopeA = service.sessionScope(a);
  const scopeB = service.sessionScope(b);
  const cacheA = `contagest-ve-v563-session-${scopeA}`;
  const currentA = `contagest-ve-v563-3-session-${scopeA}`;
  const cacheNeighbor = `${cacheA}neighbor`;
  const cacheB = `contagest-ve-v563-3-session-${scopeB}`;
  const databaseA = `contagest-offline-v563-${scopeA}`;
  const databaseNeighbor = `${databaseA}neighbor`;
  const databaseB = `contagest-offline-v563-${scopeB}`;
  cacheNames.push(cacheA, currentA, cacheNeighbor, cacheB);
  await service.purgeOfflineSession(a);
  assert.deepEqual(deletedCaches.sort(), [cacheA, currentA].sort());
  assert.deepEqual(deletedDatabases, [databaseA]);
  assert.equal(names.has(authKey), false, 'the selected session is no longer in web storage');
});
