# ADR · #562 Data lifecycle authority

## Decision

ContaGest has one lifecycle authority instead of ad-hoc deletes per module. `DataRetentionPolicyVersion` stores effective dates, provenance, delete semantics, purge capability and a content hash. Global engineering defaults are fail-closed; any retention duration that depends on legal/business policy remains `NULL` until an approved version supplies it. Tenant overrides are versioned and protected entities cannot be made purgeable by a tenant administrator.

`DataLegalHold` can target a whole tenant, entity type or record. A destructive lifecycle operation checks holds server-side and the database exposes the same fail-closed assertion. Hold rows cannot be deleted; release requires an explicit lifecycle release context and leaves actor/authorization/reason evidence.

`DataLifecycleJob` is the resumable/idempotent work authority. `(tenantId, operation, idempotencyKey)` is unique and the request hash prevents a reused key from changing meaning. Purge adapters are explicit allowlisted SQL paths scoped by tenant; there is no dynamic table-name SQL. Each batch stores only hashed subject identifiers/counts/cutoff/policy evidence, not the prohibited payload that was removed.

`AuditLog`, `LedgerEntry`, `FiscalDocument` and `FiscalCloseEvidence` reject generic DELETE at the PostgreSQL boundary. Even an authorized lifecycle session still needs a policy that explicitly permits purge; the baseline does not. This prevents CRUD or tenant cascades from silently destroying audit/accounting/fiscal evidence.

## Storage alignment

`DataStorageObject` is the DB registry for private storage objects. Media writes register bucket/key/checksum and their lifecycle class. User-managed media deletion checks retention/legal hold before provider removal and then records a tombstone. Signed clinical attachments register as `ClinicalMediaObject` and remain outside generic deletion. `detectStorageOrphans` compares registry state with a provider inventory; CI exercises it with a real temporary filesystem sandbox so missing blobs and unregistered blobs are both observable.

## Tenant export/deletion

The lifecycle API exposes an idempotent tenant export *manifest* containing counts and scope, while actual payload export stays delegated to the existing domain export adapters to avoid a giant sensitive in-memory dump. Tenant deletion is represented as an authorized job with explicit prechecks. It remains `blocked` while legal holds, protected accounting/audit/fiscal rows, active storage objects or unfinished lifecycle jobs exist. #562 therefore does not add a generic `DELETE tenant` escape hatch.

## Compatibility and legal boundary

No historical row is rewritten. Existing media that predates the registry remains detectable as unregistered during inventory reconciliation. The engineering matrix is not legal advice and deliberately does not invent fiscal/clinical retention periods; those remain tied to the reviewed legal/privacy authorities (#29/#567).

## Verification

The dedicated gate runs the source contract first, then an isolated PostgreSQL 17 database plus a real filesystem sandbox. Acceptance covers protected-delete denial, tenant A/B purge isolation, legal-hold blocking, idempotent/resumable batch jobs, storage orphan detection, typecheck and backend build for the exact candidate SHA. Queued/cancelled/provider-blocked jobs are not PASS.
