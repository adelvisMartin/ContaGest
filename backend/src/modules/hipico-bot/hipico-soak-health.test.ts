import assert from 'node:assert/strict';
import test from 'node:test';
import { classifySoakHealth, probeSoakHealth, validateSoakHealthUrl } from './hipico-soak-health.js';

const safe = { ready: true, mode: 'shadow', sourceSendPossible: false };

test('#120 release soak only accepts actual ready shadow status with SOURCE write disabled', () => {
  assert.deepEqual(classifySoakHealth(200, safe), { ok: true, status: 200, reason: 'READY_SHADOW' });
  assert.equal(classifySoakHealth(200, { ...safe, sourceSendPossible: true }).reason, 'SOURCE_WRITE_POSSIBLE');
  assert.equal(classifySoakHealth(200, { ...safe, sourceSendPossible: undefined }).reason, 'SOURCE_WRITE_POSSIBLE');
  assert.equal(classifySoakHealth(200, { ...safe, ready: false }).reason, 'HEALTH_NOT_READY');
  assert.equal(classifySoakHealth(200, { ...safe, mode: 'safe-auto' }).reason, 'HEALTH_MODE_MISMATCH');
  assert.equal(classifySoakHealth(200, '<html>login</html>').reason, 'HEALTH_BODY_INVALID');
  assert.equal(classifySoakHealth(503, safe).reason, 'HEALTH_HTTP_FAILURE');
});

test('#120 preflight denies insecure remote HTTP, userinfo, query secrets and fragments', () => {
  assert.equal(validateSoakHealthUrl('http://127.0.0.1:8080/health'), 'http://127.0.0.1:8080/health');
  assert.equal(validateSoakHealthUrl('https://bridge.example/health'), 'https://bridge.example/health');
  for (const unsafe of [
    'http://bridge.example/health', 'ftp://bridge.example/health',
    'https://name:secret@bridge.example/health', 'https://bridge.example/health?token=private',
    'https://bridge.example/health#secret', 'not-a-url', 'http://0.0.0.0:8080/health'
  ]) assert.throws(() => validateSoakHealthUrl(unsafe), /HIPICO_SOAK_HEALTH_URL_/);
});

test('#120 probe validates JSON contract with read-only GET, no cache and blocked redirects', async () => {
  let called = 0;
  const fetcher = (async (url, init) => {
    called += 1;
    assert.equal(url, 'https://bridge.example/health');
    assert.equal(init?.method, 'GET');
    assert.equal(init?.redirect, 'error');
    assert.equal(init?.cache, 'no-store');
    assert.equal((init?.headers as Record<string, string>)['x-hipico-bridge-token'], 'private-fixture-token');
    return new Response(JSON.stringify(safe), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const result = await probeSoakHealth('https://bridge.example/health', 'private-fixture-token', fetcher);
  assert.equal(result.ok, true);
  assert.equal(called, 1);
  assert.doesNotMatch(JSON.stringify(result), /token|bridge.example/);
});

test('#120 redirect or network failure is not a PASS and does not leak credentials', async () => {
  const redirected = (async () => { throw new TypeError('redirect to https://evil.example/?secret=leak'); }) as typeof fetch;
  const result = await probeSoakHealth('https://bridge.example/health', 'private-fixture-token', redirected);
  assert.deepEqual(result, { ok: false, status: 0, reason: 'HEALTH_REQUEST_FAILED' });
  assert.doesNotMatch(JSON.stringify(result), /secret|private-fixture-token|evil.example/);
});

test('#120 HTTP 200 HTML fallback or maintenance page must not pass release', async () => {
  const html = (async () => new Response('<html>Maintenance</html>', { status: 200 })) as typeof fetch;
  const result = await probeSoakHealth('https://bridge.example/health', '', html);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'HEALTH_BODY_INVALID');
});
