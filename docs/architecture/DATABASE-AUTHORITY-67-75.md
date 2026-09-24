# Database authority · 67/75

## Decision

ContaGest uses one forward structural migration authority:

- **ORM/model authority:** `backend/prisma/schema.prisma`
- **forward structural migration authority:** `backend/prisma/migrations/**/migration.sql`
- **production deployment entrypoint:** `backend/scripts/prisma-deploy-safe.mjs`

Supabase SQL remains supported only in explicitly classified roles:

1. **post-deploy/security policy SQL** — RLS and privilege hardening that does not create application tables;
2. **historical ephemeral baseline SQL** — legacy SQL-first bootstrap required only to replay the complete migration chain on isolated `*_e2e`, `*_drill` or `*_restore` databases;
3. **legacy compatibility SQL** — existing Supabase/Hípico compatibility surfaces retained for supported workflows, but not the canonical forward structural migration path.

## Enforcement

`config/database-authority-67-75.json` is an exhaustive allowlist of SQL surfaces.

`scripts/database-authority-audit-v6775.mjs` fails when:

- a SQL file exists under `supabase/sql` or `backend/supabase/migrations` without classification;
- one SQL file is classified more than once;
- a Prisma migration directory lacks `migration.sql`;
- the production deploy entrypoint stops using `prisma migrate deploy`;
- reset/db-push is introduced into the production-safe deploy path;
- policy SQL creates application tables;
- the historical bootstrap loses its ephemeral database guard;
- the ephemeral bootstrap SQL include chain drifts from the classified historical baseline.

## Change rule

A new application table/column/index/constraint must be delivered through a new Prisma migration. A companion Supabase SQL file is allowed only when its compatibility/security purpose is explicit and it is added to the authority manifest in the same change.

Existing historical SQL is not rewritten or renamed by 67/75. This avoids invalidating already deployed environments and migration evidence.

## Validation

`tests/database_authority_67_75.test.mjs` executes the audit against the checked-in repository and locks the deployment contract.

Runtime/PostgreSQL/CI claims remain exact-SHA only.
