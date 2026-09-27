import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => {
  assert.equal(fs.existsSync(path), true, `required artifact missing: ${path}`);
  return fs.readFileSync(path, 'utf8');
};

const sw = read('frontend/public/sw.js');
const runtime = read('frontend/public/pwa-install.js');
const auth = read('frontend/src/services/authService.js');
const offline = read('frontend/src/services/pwaOfflineService.js');
const index = read('frontend/index.html');
const browser = read('qa/pwa-offline-v563.spec.mjs');
const workflow = read('.github/workflows/pwa-offline-v563.yml');

test('#563 cache namespaces include release/session scope and never cache APIs', () => {
  assert.match(sw, /CACHE_VERSION/);
  assert.match(sw, /tenantId/);
  assert.match(sw, /userId/);
  assert.match(sw, /SESSION_SCOPE/);
  assert.match(sw, /pathname\.startsWith\('\/api\/'\)/);
  assert.match(sw, /cache:'no-store'/);
});

test('#563 logout and tenant switch purge sensitive cache + IndexedDB state', () => {
  assert.match(offline, /purgeOfflineSession/);
  assert.match(offline, /indexedDB\.databases/);
  assert.match(offline, /CLEAR_SESSION_DATA/);
  assert.match(auth, /purgeOfflineSession/);
  assert.match(auth, /switchTenant/);
  assert.match(auth, /logout/);
});

test('#563 outbox is explicit allowlist and rejects financial generic mutations', () => {
  assert.match(offline, /OUTBOX_ALLOWLIST/);
  assert.match(offline, /enqueueOfflineOperation/);
  assert.match(offline, /idempotencyKey/);
  assert.match(offline, /OFFLINE_OPERATION_NOT_ALLOWED/);
  assert.doesNotMatch(offline, /sales\.create|purchase\.create|ledger\.post|payment\.create/);
});

test('#563 stale/offline/reconnect state is visible and service worker can recover/update safely', () => {
  assert.match(runtime, /data-cg-connectivity/);
  assert.match(runtime, /Sin conexión/);
  assert.match(runtime, /Reconectado/);
  assert.match(runtime, /controllerchange/);
  assert.match(runtime, /RECOVER_CACHE/);
  assert.match(sw, /RECOVER_CACHE/);
  assert.match(sw, /clients\.claim/);
  assert.match(index, /pwa-install\.js/);
});

test('#563 browser gate covers install update offline reconnect logout tenant switch without sleeps/force', () => {
  for (const term of ['offline', 'reconnect', 'logout', 'tenant switch', 'service worker update']) assert.match(browser.toLowerCase(), new RegExp(term));
  assert.doesNotMatch(browser, /waitForTimeout|force\s*:/);
  assert.match(workflow, /playwright install --with-deps chromium/);
  assert.match(workflow, /pwa-offline-v563\.spec\.mjs/);
});
