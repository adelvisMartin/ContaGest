import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { syncFreshness, markWorkspaceStale, markWorkspaceSynced, SYNC_CONFLICT_POLICY } from '../frontend/public/hipico-control/assets/js/sync.js';

const read = (path) => fs.readFile(path, 'utf8');

test('IndexedDB schema is versioned and outbox has a unique idempotency index', async () => {
  const source = await read('frontend/public/hipico-control/assets/js/store-v2.js');
  assert.match(source, /DB_VERSION = 2/);
  assert.match(source, /LOCAL_SCHEMA_VERSION = 2/);
  assert.match(source, /createIndex\("idempotencyKey", "idempotencyKey", \{ unique: true \}\)/);
  assert.match(source, /HIPICO_OUTBOX_IDEMPOTENCY_KEY_REQUIRED/);
  assert.match(source, /ConstraintError/);
});

test('identity switch archives old primary state and clears private pending mutation stores', async () => {
  const source = await read('frontend/public/hipico-control/assets/js/store-v2.js');
  assert.match(source, /archived:\$\{previous\}/);
  assert.match(source, /clearStore\("outbox"\)/);
  assert.match(source, /clearStore\("snapshots"\)/);
  const facade = await read('frontend/public/hipico-control/assets/js/store.js');
  assert.match(facade, /binding\.changed/);
  assert.match(facade, /location\?\.reload/);
  assert.match(facade, /clearPrivateSessionState/);
});

test('service worker caches only explicit static allow-list and never caches API/runtime metadata', async () => {
  const sw = await read('frontend/public/hipico-control/sw.js');
  assert.match(sw, /APP_SHELL_URLS/);
  assert.match(sw, /isAllowedStatic/);
  assert.match(sw, /isSensitive\(url\) \|\| isRuntimeMetadata\(url\)/);
  assert.match(sw, /fetch\(request, \{ cache: 'no-store' \}\)/);
  assert.doesNotMatch(sw, /cache\.put\(request, fresh\.clone/);
});

test('offline/stale state is visually explicit and never worded as live confirmation', async () => {
  const source = await read('frontend/public/hipico-control/assets/js/offline-status.js');
  assert.match(source, /datos locales no confirmados como vigentes/i);
  assert.match(source, /pendientes de confirmar/i);
  assert.match(source, /role', 'status'/);
});

test('sync freshness and conflict policy are deterministic', () => {
  const now = Date.parse('2026-08-27T21:00:00.000Z');
  assert.equal(syncFreshness({ lastSyncedAt: '2026-08-27T20:59:00.000Z' }, { now, staleAfterMs: 120000 }).stale, false);
  assert.equal(syncFreshness({ lastSyncedAt: '2026-08-27T20:00:00.000Z' }, { now, staleAfterMs: 120000 }).stale, true);
  assert.equal(markWorkspaceStale({ syncMeta: {} }, 'offline').syncMeta.syncState, 'stale');
  assert.equal(markWorkspaceSynced({ syncMeta: {} }, { version: 9, at: '2026-08-27T21:00:00.000Z' }).syncMeta.lastSyncedVersion, 9);
  assert.equal(SYNC_CONFLICT_POLICY.moneyAuthority, 'server-ledger-only');
  assert.equal(SYNC_CONFLICT_POLICY.staleAuthority, 'never-live');
});

test('quota pressure has bounded cleanup and typed failure', async () => {
  const source = await read('frontend/public/hipico-control/assets/js/store-v2.js');
  assert.match(source, /QUOTA_PRESSURE_RATIO = 0\.9/);
  assert.match(source, /trimSnapshots\(5\)/);
  assert.match(source, /HIPICO_STORAGE_QUOTA_EXCEEDED/);
});
