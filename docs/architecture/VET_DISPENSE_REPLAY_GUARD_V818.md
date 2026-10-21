# #818 · Veterinary dispense idempotency payload binding

**Bug:** existing `/clinical-inventory/consume` uses a tenant-scoped advisory lock and deduplicates by `sourceId=${prescriptionId}:${clinicalActId}`, but an already-present InventoryMovement was returned unconditionally. A retry with the *same key* and a **different lot or quantity** would appear successful, misleading downstream clinical evidence/invoice linking.

**Fix:** with the same server-scoped key, compare persisted movement `lotId` and Prisma Decimal quantity to the proposed lot/quantity *inside the existing transaction* before returning replay success. Different payload → HTTP409 `VETERINARY_DISPENSE_IDEMPOTENCY_CONFLICT`. Same payload keeps existing no-write replay; no modifications to stock ledger, inventory locking, expiry, monetary accounting, prescription or financial-case linking.

**Missing for DoD:** PG17 duplicate/concurrent requests, cross-tenant adversarial API, multi-partial dispense, prescription status amendments, returns/reversals, invoice/payment reconciliation, browser. SOURCE_REUSE=NONE. Test: `node --test tests/vet_dispense_replay_guard_v818.test.mjs`. Rollback revert source/test/docs only.