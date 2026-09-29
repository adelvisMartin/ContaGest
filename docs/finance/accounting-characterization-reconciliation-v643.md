# Accounting Characterization & Reconciliation v643

Issue: #643.

## Authority

`qa/fixtures/accounting-characterization-v643.json` is the synthetic transversal characterization manifest. It does not replace the domain-specific financial tests; it names the scenarios and invariants that must survive refactors and binds them to the already-real PostgreSQL flow in `qa/financial-reconciliation-v559.test.ts`.

The executable characterization owner is `scripts/accounting-reconciliation-v643.mjs`. It evaluates logical effects using integer minor units/BigInt so the characterization layer never introduces binary floating-point money arithmetic.

## Golden flow

The real PostgreSQL adapter walks the same business chain used before/after financial refactors:

`document -> persisted totals -> ledger source identity -> balanced lines -> bank/inventory effects -> reversal/close boundaries -> reconciliation report`.

The adapter covers sale + VAT, purchase + payable, collection/payment banking, sale reversal, duplicate retry/concurrency, closed period rejection, source-to-ledger identity, inventory/bank reconstruction, and A/B tenant isolation. It emits an exact-candidate JSON report instead of a hand-edited snapshot.

The compact `goldenEffects` list in the v643 manifest is intentionally only a logical-effect contract used to detect duplicates, imbalance, orphan sources and destructive posted mutations. Account-level/balance reconstruction remains owned by the real PostgreSQL adapter and its v559 fixture; v643 does not invent a second accounting engine or a second set of derived balances.

## Invariants

- total debit equals total credit for every posted effect and for the observed period;
- one logical source/effect key cannot produce duplicate financial effects;
- expected money is compared in exact decimal/minor units;
- balances are reconstructable from explicit persisted effects in the real adapter;
- posted history is preserved; reversals are append-only compensating effects;
- every characterized ledger effect has an owning source;
- tenant A/B financial objects cannot be cross-mutated.

Any difference is a finding, not silently normalized.

## Failure injection

The pure reconciliation engine exposes deterministic corruption fixtures for:

- duplicate logical effect -> `DUPLICATE_EFFECT`;
- debit/credit mismatch -> `UNBALANCED_ENTRY`;
- missing source -> `ORPHAN_SOURCE`;
- destructive change after posting -> `POSTED_MUTATION`.

These mutations exist only in-memory in tests and never touch the database.

## Execution

Fast characterization contract:

```bash
node --test tests/accounting_characterization_reconciliation_issue_643.test.mjs
```

Real isolated PostgreSQL characterization:

```bash
npm run test:backend:financial:reconciliation:real
```

Local Verification v630 already treats that real reconciliation command as mandatory in `financial`; `full` composes and de-duplicates the financial profile. The local runner creates a loopback-only disposable database. Never point this flow at production Supabase.

## Refactor use

Before a financial refactor, retain the exact fixture/manifest and run both commands. After the refactor, run them again on the new exact SHA. A changed expected amount requires an explicit reviewed contract change; a mismatch is not fixed by weakening an assertion.

Remote CI with no assigned runner/steps is recorded `BLOCKED_INFRASTRUCTURE/NOT_EXECUTED`, never PASS.
