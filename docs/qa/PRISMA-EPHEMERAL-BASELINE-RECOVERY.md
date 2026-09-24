# PostgreSQL ephemeral baseline recovery

## Root cause

ContaGest's historical Prisma directory does not contain a schema-creating migration before the first business deltas. The historical v8.5 schema was SQL-first and already existed when the earliest Prisma migrations were introduced.

A brand-new PostgreSQL service therefore failed at `0003_accounting_hr_fiscal_hardening` with `relation "Tenant" does not exist`.

## Canonical recovery

Disposable CI databases are identified only by the suffixes:

- `_e2e`
- `_drill`
- `_restore`

`ops/database/prepare-supabase-ephemeral.sql` first creates the minimal Supabase compatibility roles/functions and then replays `supabase/sql/contagest_full_bootstrap_v8_5.sql`.

`backend/scripts/prisma-deploy-safe.mjs` verifies representative baseline tables, records only the four historical migrations already represented by that bootstrap, and then executes `prisma migrate deploy` normally from `0006_auth_password_hash` onward.

## Safety boundary

The deploy wrapper never baselines a database whose name does not match the explicit disposable suffix allowlist. It never uses `migrate reset` or `db push`, and it fails closed on a partial historical baseline.

The release candidate database is named `contagest_release_51_e2e` so the same guard applies instead of weakening the protection.

## Verification

A PASS requires a real ephemeral PostgreSQL job on the exact candidate SHA to complete bootstrap, migration deploy/status, seed, vertical E2E and cleanup. Source contracts alone are not runtime evidence.
