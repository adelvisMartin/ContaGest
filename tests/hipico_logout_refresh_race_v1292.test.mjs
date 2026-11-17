import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../frontend/public/hipico-control/assets/js/supabase.js', import.meta.url), 'utf8');
function segment(start, end) {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `Missing Hípico session owner: ${start}`);
  return source.slice(a, b).replace(/^export /, '');
}
const program = [
  'let cachedSession = initialSession; let refreshPromise = null;',
  'let sessionEpoch = 0; let sessionWriteQueue = Promise.resolve();',
  segment('async function persistSession(session', 'export async function refreshCloudSession'),
  segment('export async function refreshCloudSession', 'export async function initializeCloudSession'),
  segment('export async function initializeCloudSession', 'export function currentSession'),
  segment('export function currentSession', 'export function sessionRole'),
  segment('export async function signIn(', 'export async function signUp('),
  segment('export async function signOut()', 'export function isTransientCloudError('),
  '({ currentSession, signOut, signIn, refreshCloudSession, initializeCloudSession, epoch: () => sessionEpoch })'
].join('\n');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}
const oldSession = { access_token: 'synthetic-old-access', refresh_token: 'synthetic-old-refresh' };
const newSession = { access_token: 'synthetic-new-access', refresh_token: 'synthetic-new-refresh' };

function harness({ refreshResponse, oldDiskLoad = null, holdSave = null } = {}) {
  let stored = oldSession;
  const writes = [];
  const context = {
    initialSession: oldSession,
    globalThis: { navigator: { onLine: true } },
    authHeaders: (token) => ({ Authorization: token ? `Bearer ${token}` : 'anon' }),
    validateCredentials: (email, password) => ({ email, password }),
    sessionExpiresSoon: () => false,
    loadCloudSession: () => oldDiskLoad ? oldDiskLoad.promise : Promise.resolve(stored),
    saveCloudSession: async (value) => {
      if (value && holdSave) await holdSave.promise;
      stored = value;
      writes.push(value?.access_token ?? null);
    },
    request: async (url) => {
      if (url.includes('grant_type=refresh_token')) return refreshResponse.promise;
      if (url.includes('grant_type=password')) return newSession;
      if (url === '/auth/v1/logout') return {};
      throw new Error('Unexpected synthetic request: ' + url);
    }
  };
  const api = vm.runInNewContext(program, context);
  return { ...api, stored: () => stored, writes };
}

test('#1292 logout prevents a late refresh response from resurrecting private tokens', async () => {
  const refreshResponse = deferred();
  const h = harness({ refreshResponse });
  const refresh = h.refreshCloudSession();
  const logout = await h.signOut();
  assert.equal(logout.localCleared, true);
  assert.equal(logout.remoteRevoked, true);
  refreshResponse.resolve({ access_token: 'late-access', refresh_token: 'late-refresh' });
  await refresh;
  assert.equal(h.currentSession(), null);
  assert.equal(h.stored(), null);
  assert.deepEqual(h.writes, [null]);
});

test('#1292 if refresh storage began before logout, the serialized purge finishes last', async () => {
  const refreshResponse = deferred();
  const holdSave = deferred();
  const h = harness({ refreshResponse, holdSave });
  const refresh = h.refreshCloudSession();
  refreshResponse.resolve({ access_token: 'late-access', refresh_token: 'late-refresh' });
  // Let the refresh start its asynchronous private storage write.
  await Promise.resolve();
  await Promise.resolve();
  const logoutPromise = h.signOut();
  holdSave.resolve();
  await refresh;
  const logout = await logoutPromise;
  assert.equal(logout.localCleared, true);
  assert.equal(h.currentSession(), null);
  assert.equal(h.stored(), null);
  assert.equal(h.writes.at(-1), null);
});

test('#1292 late refresh cannot overwrite a different user after logout and login', async () => {
  const refreshResponse = deferred();
  const h = harness({ refreshResponse });
  const pending = h.refreshCloudSession();
  await h.signOut();
  await h.signIn('new@example.invalid', 'synthetic');
  refreshResponse.resolve({ access_token: 'stale-access', refresh_token: 'stale-refresh' });
  await pending;
  assert.equal(h.currentSession()?.access_token, newSession.access_token);
  assert.equal(h.stored()?.access_token, newSession.access_token);
  assert.equal(h.writes.includes('stale-access'), false);
});

test('#1292 old IndexedDB load cannot restore a session after logout', async () => {
  const oldDiskLoad = deferred();
  const refreshResponse = deferred();
  const h = harness({ refreshResponse, oldDiskLoad });
  const initialize = h.initializeCloudSession();
  await h.signOut();
  oldDiskLoad.resolve(oldSession);
  await initialize;
  assert.equal(h.currentSession(), null);
  assert.equal(h.stored(), null);
});
