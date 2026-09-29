# PostgreSQL Performance & RLS Query Tuning — #644

Baseline authority: `main@21e0f78bbc880a9c41fbbd52eb322a5e95280e4d`.

## Purpose

This ticket is evidence-driven. It does **not** authorize adding or deleting an index because it looks useful. Every physical change must be justified by an isolated PostgreSQL before/after plan using `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`, followed by the existing tenant/RLS correctness gates.

The initial harness covers three representative tenant-scoped journeys from the canonical Prisma schema:

- client lookup/order by tenant + name;
- posted ledger entries by tenant + fiscal period + recency;
- analytics events by tenant + route + recency.

The journey list is versioned in `config/postgres-performance-v644.json`; the runner is `scripts/postgres-performance-v644.mjs`.

## Safety contract

- only loopback PostgreSQL URLs are accepted (`localhost`, `127.0.0.1`, `::1`);
- benchmark SQL must be read-only `SELECT` statements;
- synthetic fixtures are created inside a transaction and rolled back after each measured journey;
- scale is bounded to 100–50,000 rows per measured table;
- no production database, secrets, PII, or copied production rows are required;
- no index change is made by the harness;
- RLS/tenant correctness remains owned by the #635/#641 gates and must be rerun after any future index/query change.

## Run contract-only checks

```bash
node --test tests/postgres_performance_issue_644.test.mjs
node scripts/postgres-performance-v644.mjs contract config/postgres-performance-v644.json
```

## Run the real PostgreSQL baseline

Prerequisites: local PostgreSQL 17, `psql`, canonical migrations/policies applied, and a loopback `DATABASE_URL` pointing to an isolated disposable database.

```bash
PERF_SCALE=5000 DATABASE_URL=postgresql://...@localhost:5432/... \
  node scripts/postgres-performance-v644.mjs run config/postgres-performance-v644.json
```

The runner writes a JSON artifact under `artifacts/postgres-performance-v644/` containing planning/execution time, shared hit/read blocks, row estimates, node types and used indexes. That artifact is the evidence source for any subsequent before/after optimization.

## Evidence in this implementation runtime

- source/config contract tests: `PASS` (4/4);
- config CLI contract: `PASS`;
- real PostgreSQL 17 `EXPLAIN ANALYZE`: `BLOCKED_INFRASTRUCTURE` because this chat runtime has neither `psql` nor Docker/PostgreSQL available;
- index additions/removals: `NOT_EXECUTED / NOT_AUTHORIZED` until a real before/after baseline exists.

Accordingly, this branch establishes the reproducible measurement authority but must not claim #644 performance acceptance as complete until the PostgreSQL plane executes and the measured evidence supports any required tuning.
