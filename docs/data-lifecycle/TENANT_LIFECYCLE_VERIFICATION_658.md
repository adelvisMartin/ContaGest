# #658 · Tenant lifecycle verification and archive/clinical boundaries

**Authority:** #562; `docs/data-lifecycle/entity-retention-matrix.v1.json`, `DataRetentionPolicyVersion`, `DataLegalHold`, `DataLifecycleJob`, `DataLifecycleEvidence`, `DataStorageObject`. This is a verification/hardening increment, **not a new purge engine** and **not legal retention advice**.

## Canonical classification

| Category / table | Semantics | Allowed destructive path | Evidence / boundary |
| --- | --- | --- | --- |
| `AuditLog` | immutable/audit | No generic purge or CRUD delete | DB guard and protected runtime registry |
| `LedgerEntry` | immutable/accounting | No generic purge or CRUD delete | Preserve posted ledger and reconciliation |
| `FiscalDocument` | immutable/fiscal | No generic purge or CRUD delete | Historical document and rule snapshots must survive |
| `FiscalCloseEvidence` | immutable/closing | No generic purge or CRUD delete | Keep immutable fiscal close evidence |
| `ClinicalMediaObject` | immutable/clinical | **Never** generic storage deletion/reclassification | Signed clinical object path, immutable registry classification |
| `CarePatient` | soft_delete/clinical | Only dedicated clinical lifecycle #567 | Generic purge has no adapter |
| `AnalyticsEvent` | purge | Versioned explicit retention, tenant scope and no legal hold | Batch SQL in one transaction with hashed evidence |
| `ImportBatch` | purge | Same restrictive purge contract | Reconciliation and import payload dependencies require review |
| `NotificationLog` | **archive** | **Blocked** until a verified payload archive/export adapter exists | A count-only tenant export manifest is not a payload export |
| `AddressGeocode` | purge | Versioned policy and tenant-scoped batch | No other tenant's geocodes |
| `MediaObject` | purge (storage-specific) | Explicit storage guard, not SQL generic purge | Object key must belong to tenant; status/age and legal holds checked |

All baseline legal retention periods are intentionally `null` except the generic media placeholder. They are **not** a claim that immediate deletion is legally appropriate. Tenant-specific retentions must be reviewed and recorded before destructive use.

## Hardening added in #658

1. `requestPurgeJob` and `executePurgeBatch` require **`deleteSemantics='purge'`**, not merely `purgeable=true` and an age. Notification history classified `archive` cannot reach SQL DELETE without an implemented and verified export/archive flow. A tenant policy cannot downgrade `NotificationLog` to `purge`; errors use bounded `ARCHIVE_EXPORT_REQUIRED`, not payload or provider text.
2. `registerStorageObject` prevents changing an existing clinical record into generic media, reassigning its patient, or resurrecting a deleted clinical object. An identical active clinical registration with matching checksum and subject is idempotent; classification and evidence stay intact.
3. `assertStorageDeletionAllowed` requires tenant-prefixed object keys; forbids the clinical bucket (including unregistered legacy objects) and also rejects registered clinical objects in any bucket **before** evaluating the default zero-day media policy.
4. The existing purge engine retains tenant advisory locks, `FOR UPDATE`, bounded batches, cleanup under legal holds, atomic SQL delete + hashed evidence + cursor and fail-closed retry status. Storage and fiscal/legal authorities remain separate.

## Verification matrix

| Required control | Regression | Execution contract |
| --- | --- | --- |
| Matrix vs allowlists and blocked archive | `tests/data_lifecycle_v562_contract.test.mjs` | Node 22 on exact candidate SHA |
| PG17 tenant A→B, idempotency, concurrency, holds, retry, synthetic failure rollback | `qa/data-lifecycle-v562.integration.test.ts` | Disposable `*_e2e` DB only |
| Protected clinical status, tenant path, future-age and missing-age rejects | Same PG17 integration test (new #658 cases) | No clinical/production media bucket touched |
| Protected ledger/audit/fiscal history | DB migration guards + protected-row negative test | Exact-schema PostgreSQL run |
| Storage registry orphan detection | Filesystem sandbox and tenant-scoped registry | No network storage deletion |
| Export-before-delete | Archive-only notification attempts must reject | **No full payload export implemented here** |
| Typecheck/build | `npm run typecheck`, `npm run build:backend` | Node 22/npm workspaces |
| Restore/reconciliation | #646/#647 cross-ticket drill and #643 reconciliation | Record separate evidence; don't infer PASS |

**How to run:** Follow `.github/workflows/data-lifecycle-v562.yml` using Node 22 and PostgreSQL 17 disposable `contagest_lifecycle_v562_e2e`. Perform `npm ci`, schema deploy/generate, seed, `node --test tests/data_lifecycle_v562_contract.test.mjs`, `npm --workspace backend exec -- tsx --test ../qa/data-lifecycle-v562.integration.test.ts`, typecheck and backend build. Record exact HEAD, runner, exit code and no sensitive environment values. Destroy the database after QA.

**Known limitation:** The `/data-lifecycle/tenant-export` operation currently returns **counts only**; it is not a restorable export of payloads. The `tenant-delete` API creates/prechecks a job and does not execute deletion; do not add a destructive worker until complete export/restore and authorization gates are in place. No media object is actually removed by this regression test.

**Exit/rollback:** Revert the patch if necessary; no migration or retention period changes. Do not undo past immutable audit/fiscal history. **#658 only becomes DONE after** PG17 tests, repeat/restart behavior and archival/storage validation are evidenced for the merged exact SHA. If CI is queued, mark it `NOT_EXECUTED`, not `PASS`.
