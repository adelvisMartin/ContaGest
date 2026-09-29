# Canonical Database Gate — #632

## Purpose

`node scripts/canonical-database-gate-v632.mjs` is the single local database authority contract for ContaGest. It composes the existing production-drift engine from #625 and migration-chain runner from #626 instead of replacing either one.

The `database`, `financial`, and `full` profiles of `scripts/local-verification-runner-v630.mjs` now consume this gate. GitHub Actions may call the same command when provider capacity is available; local evidence remains authoritative for local execution and remote provider state is reported separately.

## Authority

The gate keeps the existing declared authority unchanged:

- Prisma schema: `backend/prisma/schema.prisma`
- structural migrations: `backend/prisma/migrations/**/migration.sql`
- authority classification: `config/database-authority-67-75.json`
- migration compatibility/snapshots: `config/migration-chain-v626.json`
- production drift engine: `scripts/database-drift-audit.mjs`

The intentional historical duplicate timestamp `20260927143000` remains governed by the allowlist in `config/migration-chain-v626.json`; #632 does not create a second allowlist.

## Canonical local execution

Preferred execution, because #630 owns creation and cleanup of the isolated database:

```powershell
$env:LOCAL_VERIFY_DATABASE_ADMIN_URL="postgresql://postgres:<local-password>@127.0.0.1:5432/postgres"
npm run verify:local -- --profile database --expected-sha <candidate-sha>
```

Direct execution is also supported. If `DATABASE_URL` is absent, the gate delegates ephemeral database creation/cleanup to the exported #630 lifecycle helper:

```powershell
$env:LOCAL_VERIFY_DATABASE_ADMIN_URL="postgresql://postgres:<local-password>@127.0.0.1:5432/postgres"
node scripts/canonical-database-gate-v632.mjs --expected-sha <candidate-sha>
```

If `DATABASE_URL` is supplied directly, it must be PostgreSQL on `localhost`, `127.0.0.1`, or `::1` and its database name must end in `_e2e`, `_drill`, or `_restore`. Non-loopback/production targets are rejected before destructive work. The gate never runs `db push` or `reset` against production.

## Checks

The gate performs, in order:

1. declared structural/policy/legacy authority audit;
2. approved migration-history immutability against the merge-base with `main`;
3. Prisma schema validation;
4. PostgreSQL 17 server-version contract;
5. #626 from-zero migration chain on real ephemeral PostgreSQL;
6. transactional two-tenant negative smoke: tenant-scoped uniqueness succeeds across tenants, same-tenant duplicate fails, orphan tenant FK fails, then `ROLLBACK`;
7. #626 supported upgrade snapshots;
8. #626 final physical schema manifest/hash;
9. classified raw-SQL/RLS/grant/SECURITY DEFINER audit;
10. optional #625 drift comparison against a read-only target.

A migration directory already present at the approved merge-base is immutable. New migration directories are allowed and are then validated by #626, including its duplicate-timestamp allowlist and type/upgrade checks.

## Optional read-only drift

Drift is opt-in and uses only the #625 introspection path:

```powershell
$env:DATABASE_GATE_DRIFT_TARGET_URL="postgresql://<read-only-user>:<password>@<host>:5432/<database>"
$env:DATABASE_GATE_DRIFT_PROJECT_REF="logical-project-ref"
node scripts/canonical-database-gate-v632.mjs --expected-sha <candidate-sha>
```

The target URL is not written to the JSON/Markdown evidence. Credential-bearing PostgreSQL URLs and bearer tokens are sanitized from captured failure text. The destructive expected side is always the isolated local PostgreSQL database; the optional target is introspected read-only by #625.

## Stable result categories

The JSON and human reports use only these top-level categories:

- `AUTHORITY_CONFLICT`
- `MIGRATION_HISTORY_MUTATED`
- `FROM_ZERO_FAILED`
- `UPGRADE_DIVERGENCE`
- `TYPE_MISMATCH`
- `CONSTRAINT_MISMATCH`
- `TENANT_ISOLATION_RISK`
- `DRIFT_DETECTED`
- `PASS`

Evidence is written under `artifacts/database-gate-v632/<exact-sha>/gate.json` and `gate.md`. The deterministic manifest digest excludes explicit temporal metadata while remaining bound to the exact candidate SHA and check results.

`REMOTE_CI=BLOCKED_INFRASTRUCTURE` and `REMOTE_DEPLOY=NOT_EXECUTED` are informational and do not convert a local database PASS into a remote PASS.

## Regression contract

`tests/local_verification_runner_v630.test.mjs` locks:

- #630 database/financial/full profiles to one canonical #632 command;
- stable result categories;
- rejection of approved migration mutation while allowing a new migration directory;
- duplicate-authority and upgrade-divergence classification;
- rejection of destructive production URLs;
- deterministic exact-SHA manifests;
- credential/token sanitization;
- transactional two-tenant negative fixture shape;
- #630 cleanup remaining in `finally`, so an owned ephemeral database is dropped even after a gate failure.

No production dump, secret, PII, or credential belongs in gate artifacts.
