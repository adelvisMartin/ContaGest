import test from 'node:test';
import assert from 'node:assert/strict';
import { AuthSession } from '../frontend/src/services/authSession.js';

function withStorage(fn) {
  const original = globalThis.localStorage;
  const map = new Map();
  globalThis.localStorage = {
    getItem:(key) => map.get(key) ?? null,
    setItem:(key, value) => map.set(key, String(value)),
    removeItem:(key) => map.delete(key)
  };
  try { fn(map); }
  finally {
    if (original === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = original;
  }
}

test('new sessions exclude top-level and nested credentials without losing UI context', () => withStorage((map) => {
  const payload = {
    tenantId:'tenant-a', sessionMode:'cookie',
    user:{ id:'user-a', fullName:'Ana', permissions:['gym.manage'], accessToken:'NESTED-ACCESS' },
    tenant:{ id:'tenant-a', name:'Gym A' },
    accessibleTenants:[{ id:'tenant-a', refreshToken:'NESTED-REFRESH' }],
    token:'TOP-TOKEN', accessToken:'ACCESS', refreshToken:'REFRESH',
    jwt:'JWT', password:'PASSWORD', csrfToken:'CSRF', apiKey:'APIKEY', devicePrivateKey:'PRIVATE'
  };
  const current = AuthSession.set(payload);
  assert.equal(current.user.fullName, 'Ana');
  assert.equal(current.user.accessToken, undefined);
  assert.equal(current.accessibleTenants[0].refreshToken, undefined);
  const stored = map.get(AuthSession.key);
  for (const secret of ['TOP-TOKEN', 'ACCESS', 'REFRESH', 'JWT', 'PASSWORD', 'CSRF', 'APIKEY', 'PRIVATE']) {
    assert.equal(stored.includes(secret), false, secret);
  }
  assert.equal(AuthSession.get().tenantId, 'tenant-a');
  assert.deepEqual(AuthSession.get().user.permissions, ['gym.manage']);
}));

test('legacy snapshots are sanitized on read, including nested credentials', () => withStorage((map) => {
  map.set(AuthSession.key, JSON.stringify({
    tenantId:'tenant-b', user:{id:'user-b', refreshToken:'EXPOSED'}, refreshToken:'EXPOSED-TOP', role:'admin'
  }));
  assert.equal(AuthSession.get().tenantId, 'tenant-b');
  assert.equal(map.get(AuthSession.key).includes('EXPOSED'), false);
  assert.equal(AuthSession.get().role, 'admin');
}));

test('expired sessions are removed rather than retained as stale credentials', () => withStorage((map) => {
  AuthSession.set({tenantId:'tenant-c', expiresAt:Date.now() - 1000, refreshToken:'SECRET'});
  assert.equal(AuthSession.get(), null);
  assert.equal(map.has(AuthSession.key), false);
}));

test('metadata fields that resemble credential names remain available', () => withStorage(() => {
  const s = AuthSession.set({
    tenantId:'tenant-d', user:{id:'user-d', authorizationStatus:'approved', secretaryName:'Marta'},
    tenant:{id:'tenant-d', name:'Hospital'}
  });
  assert.equal(s.user.authorizationStatus, 'approved');
  assert.equal(s.user.secretaryName, 'Marta');
}));

test('non-secret password state and authorization metadata are not discarded', () => withStorage(() => {
  const result = AuthSession.set({
    tenantId:'tenant-d',
    user:{id:'user-d',passwordChangeRequired:true,authorizationStatus:'approved',secretaryName:'Marta',passwordHash:'HASH'}
  });
  assert.equal(result.user.passwordChangeRequired,true);
  assert.equal(result.user.authorizationStatus,'approved');
  assert.equal(result.user.secretaryName,'Marta');
  assert.equal(result.user.passwordHash,undefined);
}));

test('unusable credential-bearing snapshots are evicted', () => withStorage((map) => {
  map.set(AuthSession.key, '{"refreshToken":"SECRET"}');
  assert.equal(AuthSession.get(),null);
  assert.equal(map.has(AuthSession.key),false);
}));
