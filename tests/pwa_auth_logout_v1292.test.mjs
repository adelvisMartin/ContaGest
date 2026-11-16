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
