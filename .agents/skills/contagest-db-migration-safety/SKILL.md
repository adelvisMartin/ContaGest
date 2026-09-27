---
name: contagest-db-migration-safety
description: PostgreSQL/Prisma migration, constraint, RLS, index and rollback gate for production-safe schema evolution.
contractVersion: 2
---

# ContaGest DB Migration Safety

## Trigger
Any Prisma/migration/SQL change, table/column/enum/index/FK/trigger/function/RLS policy, or behavior that depends on database constraints.

## Non-trigger
Do not mutate already-applied migrations or treat application validation as a replacement for DB invariants.

## Authority
`AGENTS.md`, canonical schema/migrations and executed PostgreSQL evidence outrank ORM assumptions or UI behavior.

## Source of truth
Prisma schema, supplemental SQL/migrations, PostgreSQL introspection and representative upgrade/from-zero fixtures.

## Graphify probes
Use to find model/service/query dependencies and migration consumers; graph output cannot prove schema compatibility.

## Inputs
Exact SHA, schema diff, current/previous schema fixture, representative two-tenant data, target PostgreSQL version and recovery plan.

## Invariants
One declared schema authority; applied migrations immutable; existing tenant/financial data survives authorized upgrade; critical FK/unique/check/RLS/trigger constraints protect below UI/API; large-table lock/deploy compatibility reviewed; destructive change has backup/restore path.

## Workflow
1. Produce schema diff/rationale.
2. Build empty ephemeral PostgreSQL from zero.
3. Apply all migrations in order.
4. Seed representative two-tenant fixtures.
5. Run DB/API and negative tenant/RBAC tests.
6. Validate constraints/indexes/RLS/function security.
7. Test representative upgrade.
8. Document rollback/roll-forward/restore.

## Negative tests
Cross-tenant row access, duplicate uniqueness, invalid check/FK, unsafe SECURITY DEFINER/search_path, destructive upgrade and rollback/restore failure as applicable.

## Stop conditions
Schema drift, failed from-zero/upgrade, untested destructive DDL, unsafe RLS, missing tenant constraint/index on critical data or unknown rollback impact.

## Verification
Execute real PostgreSQL from-zero and upgrade evidence when the change touches persistence authority.

## Output schema
Migration SHA; PostgreSQL version; from-zero result; upgrade result; policy/constraint introspection; tests; backup point; rollback plan; `STATUS`; block decision.

## References
`AGENTS.md`, `contagest-bcp-dr`, `contagest-tenant-isolation-rbac`, `contagest-release-evidence`.
