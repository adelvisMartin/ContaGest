# ADR · #561 Fiscal rules, numbering and period close

## Decision

Fiscal rules are append/version oriented and selected by tenant, code and effective date. Every rule carries source, documentation, an explicit validity window and a deterministic SHA-256 content hash. Overlapping windows for the same tenant/code are rejected. Issued-document integrations persist a `FiscalDocumentRuleSnapshot`; that snapshot is immutable, so a newer rule cannot silently reinterpret historical data.

Fiscal numbers are allocated only by PostgreSQL through `allocate_fiscal_number`. The function serializes equal idempotency keys with a transaction advisory lock before it reads or increments a sequence. Distinct requests advance the sequence atomically, and independent uniqueness constraints protect both the idempotency key and allocated value. Cancellation changes reservation state but never deletes or decrements the sequence, so a number is never recycled.

A close is enforced at the database boundary. `ClosingPeriod` cannot transition to `closed` while the target period contains unposted ledger entries, unbalanced posted entries, draft sales or draft purchases. A successful close writes immutable base evidence containing prechecks, post-close counts and a SHA-256 hash over tenant, period, module, actor, timestamp and evidence. A direct `closed -> open` transition is rejected. `reopen_fiscal_period` requires an actor, authorization reference and reason; its audit fields can only be set while the authorized database-local workflow flag is active and become immutable once recorded.

## Compatibility and historical migration

This migration is a forward-only sidecar. Existing invoices, ledger entries and close rows are not rewritten and no current regulatory percentage is backfilled into old documents. Historical records keep their prior semantics until a trustworthy source can reconstruct the exact original rule, at which point an explicit snapshot/backfill migration can be reviewed separately. This is intentional: absence of provenance is preferable to silently applying today's rule to yesterday's transaction.

No existing public API route or UI contract is changed by #561. Repository helpers are available for issuance workflows that need to resolve a dated rule, reserve/bind/cancel a number and persist the applied rule snapshot. Integrating a particular document workflow must be atomic with its document transaction and is not emulated with a second best-effort request.

## Security and tenancy

All new records are tenant-scoped and foreign-keyed to `Tenant`; number uniqueness includes tenant/document type/series. Repository helpers require tenant IDs and allocation requires an idempotency key. Rule history, document snapshots and close evidence are fail-closed against ambiguous or unauthorized mutation. The reopening function is an enforcement boundary, not a UI-only convention, and is designed to be called only after the existing approval/RBAC workflow (#96/#236) has authorized the operation.

## Verification contract

The dedicated gate uses a disposable PostgreSQL 17 database built from canonical repository migrations. It verifies rule provenance/history/overlap, distinct-request concurrency, same-key concurrency without sequence gaps, retry idempotency, non-recycling after cancellation, period-scoped close prechecks, SHA-256 pre/post evidence, direct-reopen denial and the authorized reopen path. It also runs typecheck, the repository's authoritative lint/contracts and a backend build against the same candidate SHA.

A workflow being queued, skipped or provider-blocked is **not** PASS. Only executed checks for the exact candidate SHA count as runtime verification.
