---
name: contagest-accounting-integrity
description: Deterministic financial integrity gate for postings, taxes, inventory valuation, banking, payroll and closing operations.
contractVersion: 2
---

# ContaGest Accounting Integrity

## Trigger
Use for every change touching sales, purchases, inventory movements/costs, banking, payroll, taxes, chart of accounts, journal/ledger, fiscal documents, accounting rules, exchange rates or period closing.

## Non-trigger
Do not use as visual-design authority or to invent business rules absent from canonical domain contracts.

## Authority
`AGENTS.md` and deterministic accounting/domain code outrank this procedure. The accounting agent owns interpretation; this skill defines required engineering gates.

## Source of truth
Accounting/fiscal services, Prisma constraints/migrations, financial QA fixtures and exact candidate source.

## Graphify probes
Use only to locate posting/reversal/sequence dependencies, for example `trace accounting posting and fiscal sequence owners`; Graphify never proves financial correctness.

## Inputs
Changed files, exact SHA, financial event, tenant/role context, currency/rate/period, expected journal and relevant fixtures.

## Invariants
- `Σ debit == Σ credit` at supported monetary precision.
- Decimal/domain money is persistence authority; never binary float.
- Posted records are immutable through ordinary CRUD; corrections are traceable reversal/adjustment.
- Closed periods reject financial mutation server-side.
- Authenticated authority resolves tenant.
- Retries are idempotent and create one accounting effect.
- Exchange rate, currency, fiscal period, source and actor remain reproducible.
- Fiscal documents/sequences are not silently renumbered/deleted.
- Balance-changing mutations produce audit evidence.

## Workflow
1. State event and expected journal before editing.
2. Characterize VES/USD, tax, zero, rounding and reversal.
3. Verify transaction/concurrency/idempotency.
4. Verify period and authorization before posting.
5. Verify journal equality/source linkage after persistence.
6. Exercise failure/retry for duplicate effects.
7. Run relevant DB/API/unit/browser tests and record evidence separately.

## Negative tests
Cross-tenant source ID; duplicate retry/idempotency key; posted edit/delete; closed-period write; unbalanced manual journal; invalid/zero required FX; unauthorized reversal; duplicate fiscal number.

## Stop conditions
`BLOCK_MAIN=yes` for imbalance, tenant escape, mutable posted entry, closed-period bypass, duplicate financial effect, silent precision loss or missing required migration evidence.

## Verification
Execute the routed financial/DB/API tests on the exact candidate SHA. A source review alone is `NOT_EXECUTED` for runtime behavior.

## Output schema
`STATUS=PASS|FAIL|BLOCKED|NOT_EXECUTED`; affected invariant; evidence; residual risk; rollback; `BLOCK_MAIN=yes|no`.

## References
`AGENTS.md`, routed financial QA, `contagest-tenant-isolation-rbac`, `contagest-db-migration-safety`, `contagest-release-evidence`.
