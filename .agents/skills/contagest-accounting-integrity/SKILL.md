---
name: contagest-accounting-integrity
description: Deterministic financial integrity gate for postings, taxes, inventory valuation, banking, payroll and closing operations.
---

# ContaGest Accounting Integrity

## Trigger
Use for every change touching sales, purchases, inventory movements/costs, banking, payroll, taxes, chart of accounts, journal/ledger, fiscal documents, accounting rules, exchange rates or period closing.

## Non-negotiable invariants
- For every posted accounting document: `Σ debit == Σ credit` at the supported monetary precision.
- Money uses Decimal/domain money helpers; never binary floating point as persistence authority.
- `posted` records are immutable through ordinary CRUD. Corrections use reversal/adjustment with traceability.
- Closed periods reject financial mutation server-side.
- Financial writes resolve tenant from authenticated authority, never from browser-provided tenant identity.
- A source event may create its accounting effect once only; retries are idempotent.
- Exchange rate, currency, fiscal period, source document and actor are reproducible from evidence.
- Issued fiscal documents and sequences are not silently renumbered or deleted.
- Any mutation capable of changing balances produces audit evidence.

## Workflow
1. State the accounting event and expected journal before editing code.
2. Characterize current calculation with fixtures covering VES/USD, tax, zero, rounding and reversal.
3. Verify transaction boundary and concurrency/idempotency behavior.
4. Verify period/open-state and authorization before calculation/posting.
5. Verify journal equality and source linkage after persistence.
6. Exercise failure/retry and confirm no duplicate financial effect.
7. Run relevant DB/API/unit/browser tests and record evidence separately.

## Required negative tests
- cross-tenant source ID;
- duplicate retry/idempotency key;
- posted edit/delete;
- closed-period write;
- unbalanced manual journal;
- invalid/zero exchange rate when currency requires conversion;
- unauthorized reversal;
- duplicate fiscal number.

## Stop conditions
`BLOCK_MAIN=yes` for unbalanced journal, cross-tenant financial access, mutable posted entry, closed-period bypass, duplicate financial effect, silent precision loss or missing migration evidence.

## Output
`STATUS=PASS|FAIL|BLOCKED|NOT_EXECUTED`, affected invariant, evidence, residual risk, rollback and `BLOCK_MAIN=yes|no`.
