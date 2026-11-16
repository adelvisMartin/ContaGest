import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Exercise the actual authService logout method; imported app modules are
// intentionally replaced by synthetic in-memory boundaries only.
const auth = readFileSync(new URL('../frontend/src/services/authService.js', import.meta.url), 'utf8');
const start = auth.indexOf('  async logout(){');
const end = auth.indexOf(',\n  authHeaders()', start);
assert.ok(start >= 0 && end > start, 'authService logout owner must exist');
const originalLogout = auth.slice(start, end);

function makeLogout({ remoteFailure = false, localFailure = false } = {}) {
  const calls = [];
  const current = { tenantId: 'tenant-a', user: { id: 'user-a' } };
  const context = {
    AuthSession: {
      get: () => current,
      clear: () => calls.push('clear')
    },
    Store: {
      purgeSessionScope: () => calls.push('purge-store'),
      reset: () => calls.push('reset-store')
    },
    purgeOfflineSession: async () => {
      calls.push('purge-offline');
      if (localFailure) {
        const error = new Error('synthetic offline purge failure');
        error.code = 'OFFLINE_SESSION_PURGE_FAILED';
        throw error;
      }
    },
    BackendApi: {
      request: async () => {
        calls.push('request-revoke');
        if (remoteFailure) throw new Error('synthetic network failure');
      }
    }
  };
  return {
    logout: vm.runInNewContext(`({${originalLogout}}).logout`, context),
    calls
  };
}

for (const scenario of [
  { name: 'successful logout', expected: null },
  { name: 'unconfirmed remote revoke is not reported as success',
    remoteFailure: true, expected: 'AUTH_REMOTE_LOGOUT_UNCONFIRMED' },
  { name: 'blocked local deletion is not reported as success',
    localFailure: true, expected: 'OFFLINE_SESSION_PURGE_FAILED' },
  { name: 'local purge failure takes priority when both fail',
    localFailure: true, remoteFailure: true, expected: 'OFFLINE_SESSION_PURGE_FAILED' }
]) {
  test('#1292 ' + scenario.name, async () => {
    const { logout, calls } = makeLogout(scenario);
    if (scenario.expected) {
      await assert.rejects(logout(), (error) => error?.code === scenario.expected);
    } else {
      await logout();
    }
    assert.deepEqual(calls, ['clear', 'purge-store', 'purge-offline', 'request-revoke'],
      'local identity must be revoked first and both cleanup paths must run');
  });
}

test('#1292 user menu warns instead of claiming cleanup success on logout rejection', () => {
  const app = readFileSync(new URL('../frontend/src/app.js', import.meta.url), 'utf8');
  assert.match(app, /logout\.then\(/);
  assert.match(app, /AUTH_REMOTE_LOGOUT_UNCONFIRMED/);
  assert.match(app, /No se pudo borrar toda la información offline/);
  assert.doesNotMatch(app, /if\(action==='logout'\)\{AuthService\.logout\(\);/);
});

test('#1292 tenant switch purges old synchronous state before hydrating the new session', async () => {
  const events = [];
  const previous = { tenantId: 'tenant-a', user: { id: 'user-a' } };
  const newPayload = { tenantId: 'tenant-b', user: { id: 'user-a' } };
  let activeSession = previous;
  let sharedState = 'session-a';
  const { switchTenant } = switchMethod({
    AuthSession: { get: () => activeSession },
    BackendApi: { request: async () => { events.push('server-switch'); return newPayload; } },
    Store: { purgeSessionScope: () => { events.push('purge-old-store'); } },
    purgeOfflineSession: () => {
      events.push('purge-old-web-storage');
      sharedState = null;
      return Promise.resolve().then(() => events.push('async-old-cache-cleanup'));
    },
    normalizeSession: (session) => {
      events.push('activate-new');
      activeSession = session;
      sharedState = 'session-b';
      return session;
    }
  });
  const next = await switchTenant('tenant-b');
  assert.equal(next.tenantId, 'tenant-b');
  assert.equal(sharedState, 'session-b', 'old purge must not wipe new global state');
  assert.deepEqual(events, [
    'server-switch', 'purge-old-web-storage', 'activate-new',
    'purge-old-store', 'async-old-cache-cleanup'
  ]);
});

test('#1292 blocked old-tenant storage cleanup still activates B but rejects switch confirmation', async () => {
  const events = [];
  const previous = { tenantId: 'tenant-a', user: { id: 'user-a' } };
  let activeTenant = previous.tenantId;
  const { switchTenant } = switchMethod({
    AuthSession: { get: () => previous },
    BackendApi: { request: async () => ({ tenantId: 'tenant-b', user: { id: 'user-a' } }) },
    Store: { purgeSessionScope: () => events.push('old-state-removed') },
    purgeOfflineSession: () => {
      events.push('old-purge-started');
      return Promise.reject(Object.assign(new Error('IDB blocked'), { code: 'OFFLINE_SESSION_PURGE_FAILED' }));
    },
    normalizeSession: (session) => { activeTenant = session.tenantId; events.push('activate-new'); return session; }
  });
  await assert.rejects(switchTenant('tenant-b'), (error) => error.code === 'OFFLINE_SESSION_PURGE_FAILED');
  assert.equal(activeTenant, 'tenant-b', 'the backend-approved tenant identity remains current');
  assert.deepEqual(events, ['old-purge-started', 'activate-new', 'old-state-removed']);
});

test('#1292 failed or malformed switch never removes current-tenant storage', async () => {
  for (const payload of [null, {}, { tenant: {} }]) {
    const events = [];
    const { switchTenant } = switchMethod({
      AuthSession: { get: () => ({ tenantId: 'tenant-a', user: { id: 'user-a' } }) },
      BackendApi: { request: async () => payload },
      Store: { purgeSessionScope: () => events.push('purge') },
      purgeOfflineSession: async () => { events.push('offline'); },
      normalizeSession: () => { events.push('normalize'); }
    });
    await assert.rejects(switchTenant('tenant-b'), /backend no devolvió una sesión con empresa activa/);
    assert.deepEqual(events, []);
  }
});

test('#1292 same tenant with changed authenticated user purges previous user scope', async () => {
  const events = [];
  const { switchTenant } = switchMethod({
    AuthSession: { get: () => ({ tenantId: 'tenant-a', user: { id: 'user-a' } }) },
    BackendApi: { request: async () => ({ tenantId: 'tenant-a', user: { id: 'user-b' } }) },
    Store: { purgeSessionScope: (old) => events.push('store:' + old.user.id) },
    purgeOfflineSession: (old) => {
      events.push('offline:' + old.user.id);
      return Promise.resolve();
    },
    normalizeSession: (next) => {
      events.push('new:' + next.user.id);
      return next;
    }
  });
  const next = await switchTenant('tenant-a');
  assert.equal(next.user.id, 'user-b');
  assert.deepEqual(events, ['offline:user-a', 'new:user-b', 'store:user-a']);
});

test('#1292 same-tenant refresh does not destroy its own offline state', async () => {
  let purges = 0;
  const nextPayload = { tenantId: 'tenant-a', user: { id: 'user-a' } };
  const { switchTenant } = switchMethod({
    AuthSession: { get: () => nextPayload },
    BackendApi: { request: async () => nextPayload },
    Store: { purgeSessionScope: () => { purges++; } },
    purgeOfflineSession: async () => { purges++; },
    normalizeSession: (session) => session
  });
  assert.equal((await switchTenant('tenant-a')).tenantId, 'tenant-a');
  assert.equal(purges, 0);
});

const switchStart = auth.indexOf('  async switchTenant(tenantId){');
const switchEnd = auth.indexOf(',\n  async logout(){', switchStart);
assert.ok(switchStart >= 0 && switchEnd > switchStart, 'authService tenant switch owner must exist');
const originalSwitch = auth.slice(switchStart, switchEnd);

function switchMethod(context) {
  return {
    switchTenant: vm.runInNewContext(`({${originalSwitch}}).switchTenant`, context)
  };
}
