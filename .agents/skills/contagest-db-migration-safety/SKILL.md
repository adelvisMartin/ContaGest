---
name: contagest-db-migration-safety
description: PostgreSQL/Prisma migration, constraint, RLS, index and rollback gate for production-safe schema evolution.
---

# ContaGest DB Migration Safety

## Trigger
Any change under Prisma/migrations/SQL, any new table/column/enum/index/FK/trigger/function/RLS policy, or a behavioral change that depends on database constraints.

## Invariants
- Schema has one declared source of truth; Prisma and supplemental SQL may not drift silently.
- Migrations are immutable once applied.
- Existing tenant/financial data survives upgrade unless an explicitly authorized migration says otherwise.
- FK, unique, check, RLS and trigger rules protect critical invariants below the UI/API layer.
- Large-table changes are reviewed for lock duration and deploy compatibility.
- Destructive changes require backup/restore path and explicit authorization.

## Required pipeline
1. Produce schema diff and migration rationale.
2. Build an empty ephemeral PostgreSQL database from zero.
3. Apply every migration in order.
4. Seed representative fixtures for two tenants.
5. Exercise DB/API integration tests and negative tenant/RBAC tests.
6. Validate constraints, indexes, RLS and function security mode.
7. Test upgrade against a representative previous schema/data snapshot.
8. Document rollback/roll-forward and restore requirements.
9. Only after evidence may production migration be separately authorized.

## Stop conditions
Schema drift, failed from-zero rebuild, untested destructive DDL, unsafe RLS change, missing tenant index/constraint on critical data or unknown rollback impact => `BLOCK_MAIN=yes` / `BLOCK_PRODUCTION=yes` as appropriate.

## Evidence
Migration SHA, PostgreSQL version, from-zero result, upgrade result, policy/constraint introspection, tests, backup point, rollback plan and status.
