import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Exercise the actual production function, not a copy of its business logic.
const source = readFileSync(new URL('../frontend/public/hipico-control/assets/js/password-recovery.js', import.meta.url), 'utf8');
const start = source.indexOf('export async function requestPasswordRecovery(');
const end = source.indexOf('async function markCredentialChanged(', start);
assert.ok(start > 0 && end > start, 'recovery-request boundaries must stay identifiable');
const functionBody = source.slice(start, end).replace(/^export /m, '');

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function harness(fetchImpl, timeoutMs = 15000) {
  const calls = [];
  const timers = new Map();
  let timerId = 0;
  const CLOUD_CONFIG = { supabaseUrl: 'https://auth.example.test', publishableKey: 'sb_publishable_test', requestTimeoutMs: timeoutMs };
  const api = vm.runInNewContext(`(() => {
    let recoveryRequestInFlight = false;
    ${functionBody}
    return { send: requestPasswordRecovery, busy: () => recoveryRequestInFlight };
  })()`, {
    CLOUD_CONFIG,
    AbortController,
    setTimeout(callback, ms) { const id = ++timerId; timers.set(id, { callback, ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    fetch(url, options) { calls.push({ url: String(url), options }); return fetchImpl(url, options); },
    authHeaders: () => ({ apikey: CLOUD_CONFIG.publishableKey, Authorization: `Bearer ${CLOUD_CONFIG.publishableKey}` }),
    recoveryRedirectUrl: () => 'https://app.example.test/hipico-control/',
    parseError: async response => response.status === 429 ? 'RECOVERY_RATE_LIMITED' : 'RECOVERY_PROVIDER_UNAVAILABLE',
    encodeURIComponent, JSON, String, Number, Math, Error
  });
  return { ...api, calls, timers, fireTimeouts: () => { for (const timer of [...timers.values()]) timer.callback(); } };
}

test('#267 sends one email request per pending recovery operation', async () => {
  const pause = deferred();
  const h = harness(() => pause.promise);
  const first = h.send(' Test@Example.org ');
  assert.equal(h.busy(), true);
  await assert.rejects(h.send('Test@Example.org'), /RECOVERY_ALREADY_IN_PROGRESS/);
  assert.equal(h.calls.length, 1);
  assert.match(h.calls[0].url, /\/auth\/v1\/recover\?redirect_to=/);
  assert.equal(h.calls[0].options.method, 'POST');
  assert.equal(h.calls[0].options.headers.apikey, 'sb_publishable_test');
  assert.deepEqual(JSON.parse(h.calls[0].options.body), { email: 'test@example.org' });
  pause.resolve({ ok: true, status: 200 });
  assert.equal(await first, true);
  assert.equal(h.busy(), false);
  assert.equal(h.timers.size, 0);
  assert.equal(await h.send('test@example.org'), true);
  assert.equal(h.calls.length, 2);
});

test('#267 bounds a hung recovery request and permits retry', async () => {
  let tries = 0;
  const h = harness((_url, options) => {
    tries++;
    if (tries > 1) return Promise.resolve({ ok: true, status: 204 });
    return new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(Object.assign(new Error('user@example.org token=private'), { name: 'AbortError' })), { once: true });
    });
  }, 1200);
  const pending = h.send('test@example.org');
  assert.equal(h.timers.size, 1);
  assert.equal([...h.timers.values()][0].ms, 1200);
  h.fireTimeouts();
  await assert.rejects(pending, error => error.message === 'RECOVERY_PROVIDER_UNAVAILABLE' && !error.message.includes('@'));
  assert.equal(h.busy(), false);
  assert.equal(h.timers.size, 0);
  assert.equal(await h.send('test@example.org'), true);
  assert.equal(tries, 2);
});

test('#267 masks provider body on 429 and releases the request lock', async () => {
  let reads = 0;
  const h = harness(async () => ({ ok: false, status: 429, json: async () => { reads++; return { error: 'email=test@example.org token=PRIVATE' }; } }));
  await assert.rejects(h.send('test@example.org'), error => error.message === 'RECOVERY_RATE_LIMITED' && error.status === 429);
  assert.equal(reads, 0);
  assert.equal(h.busy(), false);
  assert.equal(h.timers.size, 0);
});

test('#267 rejects invalid email before making any network request', async () => {
  const h = harness(async () => ({ ok: true, status: 200 }));
  await assert.rejects(h.send('not-an-email'), /correo válido/);
  assert.equal(h.calls.length, 0);
  assert.equal(h.busy(), false);
});

test('#267 preserves privacy and does not introduce privileged Auth access', () => {
  assert.match(source, /if \(recoveryRequestInFlight\) return;/);
  assert.match(source, /if \(recoveryRequestInFlight\) throw new Error\('RECOVERY_ALREADY_IN_PROGRESS'\)/);
  assert.match(source, /signal: controller.signal/);
  assert.doesNotMatch(source, /service[_-]?role|sb_secret_|encrypted_password/i);
});
