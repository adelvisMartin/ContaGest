# #658 — PostgreSQL transaction advisory lock / Prisma decoder

**Problem:** `pg_advisory_xact_lock(bigint)` returns PostgreSQL `void`.
The preexisting policy-version creation on `main` projected this void
value via Prisma `$queryRaw`, an unsupported decoding shape in some
Prisma versions. This change selects a constant integer from the
set-returning function instead of exposing the void column.

Before:
```sql
SELECT pg_advisory_xact_lock(hashtextextended($1, 562))
```

After:
```sql
SELECT 1::integer AS "lockAcquired"
FROM pg_advisory_xact_lock(hashtextextended($1, 562))
```

The transaction-level lock key, scope, lock ordering, version allocation
and policy insert are unchanged. The new source contract test asserts
that the lock is still acquired before version allocation, and that
the selected scalar is supported by Prisma.

**Verification:** `node --test tests/data_lifecycle_advisory_lock_v658.test.mjs`.
**Pending:** PostgreSQL 17 + Prisma integration, concurrent writers,
and policy/legal-hold/purge full workflow (PR #1006). The source test
alone is not proof of concurrency or lock acquisition. No production
migration or purge is part of this patch. #658 remains open.
Rollback: revert this single PR, no data transformation needed.
