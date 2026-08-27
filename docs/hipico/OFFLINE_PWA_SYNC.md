# Control Hípico — Offline / PWA Sync (#115)

## Principle

Offline mode provides continuity, **not authority**. A balance/result/workspace last seen locally is never described as newly confirmed while the server cannot be reached or the sync age is stale.

## IndexedDB v2

`store.js` remains the stable public facade. `store-v2.js` owns the schema.

Schema v2 adds:

- `syncMeta` object store;
- unique `outbox.idempotencyKey` index;
- explicit local schema version on workspaces/snapshots;
- quota-pressure diagnostics/recovery;
- cloud identity binding.

Upgrade is additive. Existing v1 workspaces/settings/outbox/snapshots are preserved. Existing outbox rows without an idempotency key remain readable; all new queued mutations require a stable key.

## Idempotent outbox

New mutations derive their idempotency key from an explicit `idempotencyKey`, audit/event `id`, source message ID or external message ID. Missing identity fails with `HIPICO_OUTBOX_IDEMPOTENCY_KEY_REQUIRED` instead of creating an unreplayable mutation.

A unique IndexedDB index makes concurrent duplicate enqueue attempts converge on one record.

## User/workspace privacy

A cloud owner ID is persisted independently of the session. On account switch:

1. pending writes are flushed;
2. the previous `primary` workspace is archived under the previous owner identifier;
3. the primary pointer is removed;
4. outbox and snapshots are cleared;
5. the new owner binding is stored;
6. the page reloads before application memory can merge the previous owner's state into the new cloud identity.

Logout clears the cloud session and pending outbox but preserves the owner binding so a later *different* account is detected rather than inheriting data silently.

## Cache policy

The Service Worker caches only an exact, versioned static app-shell allow-list.

Never cached by the SW:

- `/api/*`;
- `/auth/*`;
- `/rest/v1/*`;
- RPC paths;
- token/session/license/webhook paths;
- runtime configuration;
- build metadata;
- arbitrary same-origin GET responses;
- navigations containing operational/private state.

Navigations are network-first/no-store and use the pre-cached application shell only as an offline fallback. Activating a new SW deletes previous `hipico-control-*` cache generations so incompatible bundles do not coexist.

## Stale trust UI

`offline-status.js` runs independently of the large application orchestrator. It exposes a `role=status` banner when:

- browser is offline;
- last synchronization is older than the freshness window;
- freshness cannot be verified.

Wording explicitly says local data is **not confirmed as current**.

## Conflict policy

`sync.js` publishes `SYNC_CONFLICT_POLICY`. Entity collections merge deterministically by stable ID/latest record; nested race bets merge by ID; audit/movements remain append-style merges. Money authority remains the server ledger and stale local state never becomes live authority.

A merged workspace is marked `merge-pending-confirmation` until an authoritative save/sync establishes the next server version.

## Storage pressure / eviction

At >=90% quota diagnostics expose `quotaPressure=true`. A write that fails with quota pressure trims old snapshots to a bounded emergency floor and retries the business workspace once without creating a new snapshot. A second failure returns `HIPICO_STORAGE_QUOTA_EXCEEDED`; it is never silently dropped.

## Verification

Automated repository contract:

```bash
node --test tests/hipico_offline_sync_issue_115.test.mjs
```

Runtime/browser matrix still required on the candidate SHA:

- fresh v1 → v2 upgrade with representative data;
- offline edit → reconnect;
- duplicate retry;
- account A → logout → account B;
- quota/eviction simulation;
- Service Worker update with stale tab;
- hard refresh offline;
- PWA and Android WebView parity.

Those runtime cases are `NOT_EXECUTED/BLOCKED` until an actual browser/device gate runs; they are not represented as PASS by source inspection.

## Rollback

Do not downgrade IndexedDB by deleting the database. A previous app build that only understands schema v1 is incompatible with a database already upgraded to v2; release #118 must therefore block unsafe downgrade and use the compatibility set. Rollback should deploy a build that understands schema v2.
