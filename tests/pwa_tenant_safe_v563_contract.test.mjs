import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function read(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('issue #563 installs tenant-safe offline/session lifecycle and allowlisted outbox', async () => {
  const [policy, auth, sw, browser, adr] = await Promise.all([
    read('frontend/src/services/pwaOfflinePolicy.js'),
    read('frontend/src/services/authService.js'),
    read('frontend/public/sw.js'),
    read('qa/pwa-tenant-safe-v563.spec.mjs'),
    read('docs/ADR_PWA_OFFLINE_V563.md')
  ]);

  for (const token of ['tenantId', 'userId', 'cacheNamespace', 'purgeSessionArtifacts', 'IndexedDB', 'outbox']) {
    assert.match(policy, new RegExp(token, 'i'), `offline policy missing ${token}`);
  }
  assert.match(policy, /ALLOWLISTED_OUTBOX_OPERATIONS/);
  assert.doesNotMatch(policy, /ledger|payment|journal|fiscal|bank/i, 'generic financial mutations must not be allowlisted');
  assert.match(policy, /idempotencyKey/);

  assert.match(auth, /purgeSessionArtifacts/);
  assert.match(auth, /switchTenant/);
  assert.match(auth, /logout/);

  for (const token of ['CG_SESSION_CONTEXT', 'CG_CLEAR_SESSION', 'CG_RECOVER_CACHE', 'tenant', 'version']) {
    assert.match(sw, new RegExp(token, 'i'), `service worker missing ${token}`);
  }
  assert.doesNotMatch(sw, /cache\.put\(request,[\s\S]*\/api\//i, 'API payloads must not be cached');

  for (const token of ['offline', 'reconnect', 'logout', 'tenant', 'service worker', 'indexeddb', 'no sleeps', 'no force']) {
    assert.match(browser, new RegExp(token, 'i'), `browser contract missing ${token}`);
  }

  assert.match(adr, /stale/i);
  assert.match(adr, /deep-link/i);
  assert.match(adr, /rollback/i);
  assert.match(adr, /PII|personally identifiable/i);
});
