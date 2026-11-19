import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const source = read('frontend/public/hipico-control/assets/js/supabase.js');
const start = source.indexOf('export async function signOut() {');
const end = source.indexOf('\nexport function isTransientCloudError(', start);
assert.ok(start >= 0 && end > start, 'Hípico cloud signOut owner must exist');
const realSignOut = source.slice(start, end).replace(/^export /, '');

function runSignOut({ token = 'synthetic-session-token', offline = false,
  failRemote = false, failLocal = false } = {}) {
  const calls = [];
  const context = {
    sessionEpoch: 0,
    refreshPromise: null,
    cachedSession: token ? { access_token: token } : null,
    globalThis: { navigator: { onLine: !offline } },
    // This is the real production signOut's imported cross-tab dependency.
    // Make its ordering observable instead of omitting it from the VM sandbox.
    signalOtherTabsCloudSessionInvalidation: () => {
      calls.push('cross-tab-invalidate');
      return true;
    },
    persistSession: async (session) => {
      calls.push('local');
      assert.equal(session, null);
      if (failLocal) throw new Error('synthetic IndexedDB failure');
    },
    request: async (path, options) => {
      calls.push('remote');
      assert.equal(path, '/auth/v1/logout');
      assert.equal(options.method, 'POST');
      if (failRemote) throw new Error('synthetic remote revocation failure');
    },
    authHeaders: (accessToken) => ({ Authorization: 'Bearer ' + accessToken })
  };
  return {
    signOut: vm.runInNewContext(realSignOut + '\nsignOut', context),
    calls
  };
}

test('#1292 Hípico confirmed remote logout follows successful local purge', async () => {
  const { signOut, calls } = runSignOut();
  const result = await signOut();
  assert.deepEqual({ ...result }, { localCleared: true, remoteRevoked: true });
  assert.deepEqual(calls, ['cross-tab-invalidate', 'local', 'remote']);
});

test('#1292 Hípico offline logout clears local identity without claiming remote revoke', async () => {
  const { signOut, calls } = runSignOut({ offline: true });
  assert.deepEqual({ ...await signOut() }, { localCleared: true, remoteRevoked: false });
  assert.deepEqual(calls, ['cross-tab-invalidate', 'local']);
});

test('#1292 Hípico provider failure cannot masquerade as server revocation', async () => {
  const { signOut, calls } = runSignOut({ failRemote: true });
  assert.deepEqual({ ...await signOut() }, { localCleared: true, remoteRevoked: false });
  assert.deepEqual(calls, ['cross-tab-invalidate', 'local', 'remote']);
});

test('#1292 Hípico failed local purge cannot be counted as a completed logout', async () => {
  const { signOut, calls } = runSignOut({ failLocal: true });
  await assert.rejects(signOut(), /synthetic IndexedDB failure/);
  assert.deepEqual(calls, ['cross-tab-invalidate', 'local']);
});

test('#1292 Hípico no cloud bearer means no remote request needed', async () => {
  const { signOut, calls } = runSignOut({ token: null });
  assert.deepEqual({ ...await signOut() }, { localCleared: true, remoteRevoked: true });
  assert.deepEqual(calls, ['cross-tab-invalidate', 'local']);
});

test('#1292 Hípico logout UI warns for local and remote uncertainty', () => {
  const app = read('frontend/public/hipico-control/assets/js/app.js');
  const start = app.indexOf('if (action === "confirm-logout")');
  const end = app.indexOf('if (action === "go-home")', start);
  assert.ok(start >= 0 && end > start);
  const action = app.slice(start, end);
  assert.match(action, /if \(!logout\.localCleared\)/);
  assert.match(action, /else if \(!logout\.remoteRevoked\)/);
  assert.match(action, /revocación en la nube sigue sin confirmarse/);
  assert.match(action, /"warning"/);
  assert.doesNotMatch(action, /signOut\(\)\.catch\(\(\) => \{\s*\}\)/);
});
