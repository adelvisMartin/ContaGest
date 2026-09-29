# Production schema drift audit (#625)

## Authority and purpose

ContaGest treats `backend/prisma/schema.prisma` plus the ordered files under `backend/prisma/migrations/**/migration.sql` as the structural database authority. SQL outside that chain remains explicitly classified by `config/database-authority-67-75.json` as policy authority, historical ephemeral bootstrap, or legacy compatibility SQL.

`node scripts/database-drift-audit.mjs` compares two **physical PostgreSQL catalog snapshots**: an expected isolated database built from the candidate migration chain and the actual target database. The command never applies DDL and never reads application rows.

Before introspection, the command runs the repository's existing `scripts/database-authority-audit-v6775.mjs` gate and fails closed if the declared Prisma/sidecar authority is inconsistent.

The audit is evidence for a later migration plan. It is not a migration runner and must not be used to justify `prisma db push`, `migrate reset`, manual `DROP`/`ALTER`, or automatic deletion of production-only objects.

## What is compared

The snapshot covers:

- schemas and relevant owners;
- tables, RLS enablement/forced-RLS and owners;
- columns, PostgreSQL types, defaults, nullability, identity/generated state;
- PK/FK/UNIQUE/CHECK constraints;
- indexes by physical semantics rather than name alone;
- enum/domain types;
- triggers;
- functions/procedures, arguments, return type, language, owner, security-definer flag and SHA-256 body fingerprint;
- RLS policies;
- table/routine grants;
- installed extensions;
- sequences and owners;
- Prisma migration chain names/hashes and aggregate digest;
- Prisma model names versus expected physical public tables;
- sidecar SQL classification from `database-authority-67-75.json`.

Function source is hashed before a snapshot is emitted. Application row values are never queried or written.

## Drift categories and severity

The machine-readable categories are fixed by #625:

| Category | Meaning | Default severity |
|---|---|---|
| `MISSING_IN_PROD` | expected application object is absent | P1, P0 for known critical ledger/fiscal objects |
| `EXTRA_IN_PROD` | production application object has no expected counterpart | P2; review before any removal |
| `TYPE_MISMATCH` | column/type/sequence/extension contract differs | P1 |
| `CONSTRAINT_MISMATCH` | nullability/default/PK/FK/UNIQUE/CHECK contract differs | P1 |
| `INDEX_MISMATCH` | index semantics differ | P1 |
| `TRIGGER_MISMATCH` | trigger contract differs | P1/P0 for ledger lifecycle guards |
| `POLICY_MISMATCH` | RLS/table ownership/grant contract differs | P1 |
| `FUNCTION_MISMATCH` | routine contract or body fingerprint differs | P1/P0 for ledger lifecycle guards |
| `AUTHORITY_HISTORY_MISSING` | canonical Prisma migration history is absent | P0 |
| `EXPECTED_PLATFORM_OBJECT` | known Supabase/PostgreSQL platform-managed difference | INFO |

The classifier compares normalized physical semantics. Constraint/index renames do not create drift if their physical contract is equivalent. Common PostgreSQL type/default equivalents are normalized before comparison.

## Closed platform allowlist

`config/database-drift-platform-allowlist-v1.json` is intentionally closed and versioned. It contains only known Supabase/PostgreSQL managed schemas, schema prefixes, extension names, and owner-equivalence groups. Objects in `public` are **not** ignored merely because they are deployed on Supabase.

Changing the allowlist requires review: adding an application schema/table to it can hide real drift.

## Live execution

### 1. Build the expected source in isolated PostgreSQL 17

Use the canonical migration-chain tooling owned by #626 to create a clean PostgreSQL 17 database whose name ends in one of the repository-approved isolated suffixes (`_e2e`, `_drill`, `_restore`) and apply the exact candidate migration chain there.

The drift auditor refuses a live expected database without an approved isolated suffix.

### 2. Provide connections through environment injection

Use an injected read-only production credential whenever possible. Do not put connection URLs, passwords, JWTs or API keys in CLI arguments, committed files, terminal screenshots or artifacts.

```powershell
$env:DRIFT_EXPECTED_DATABASE_URL = $env:CONTAGEST_625_EXPECTED_DB
$env:DRIFT_ACTUAL_DATABASE_URL   = $env:CONTAGEST_PROD_READONLY_DB
node scripts/database-drift-audit.mjs --project-ref soxzatxiwlfsvtblrqal --repo-sha (git rev-parse HEAD)
```

On POSIX shells, set the same environment variables through the local secret manager or session environment and run the same Node command.

Production introspection starts a PostgreSQL `BEGIN READ ONLY`, sets bounded statement/lock timeouts, runs only the versioned catalog `SELECT`/`WITH` statements from `scripts/database-drift/introspection.mjs`, and rolls back before disconnecting.

### 3. Offline/reproducible rerun

Sanitized catalog snapshots can be compared without any database connection:

```text
node scripts/database-drift-audit.mjs \
  --project-ref soxzatxiwlfsvtblrqal \
  --repo-sha <exact-sha> \
  --expected-snapshot <sanitized-expected.json> \
  --actual-snapshot <sanitized-actual.json> \
  --out qa/evidence/database-drift
```

For the same SHA and the same two snapshots, `deterministicDigest` is stable; `generatedAt` is intentionally excluded from that digest.

## Output

The command writes:

- `schema-drift-<project-ref>-<sha12>.json` — machine-readable manifest;
- `schema-drift-<project-ref>-<sha12>.md` — human report.

Both are bound to candidate SHA, logical project ref, Prisma version, PostgreSQL versions when available, full ordered migration list/hash, platform allowlist version and database-authority metadata. Artifacts are created with owner-only file permissions where the host supports them.

The manifest safety gate rejects PostgreSQL URLs with embedded credentials, password/secret-like assignments and JWT-like values before writing the result.

## Verified production precheck — 2026-09-29

A read-only metadata precheck against logical project `soxzatxiwlfsvtblrqal`, bound to repository baseline `fa86b361288247ba24e3f633f5895165cd707f1e`, established:

- production PostgreSQL reports version `17.6`;
- `public._prisma_migrations` is absent while Supabase platform migration metadata exists separately;
- `public."LedgerEntry"` lacks `postedAt`, `postedBy` and `reversalOfId`;
- the lifecycle functions `guard_ledger_entry_lifecycle` and `guard_posted_ledger_line_mutation` are absent;
- no non-internal lifecycle triggers exist on `LedgerEntry` in the targeted precheck;
- `FiscalRuleVersion`, `FiscalSequence`, `FiscalDocumentRuleSnapshot` and `FiscalCloseEvidence` are absent.

This precheck is deliberately narrower than the complete generated manifest. It records critical facts without pretending that a full expected-from-zero comparison was executed in the audit environment. The complete manifest must be generated with an isolated expected PostgreSQL source before production convergence.

## Deriving a forward-only migration plan

The auditor never emits executable DDL. For each P0/P1 finding:

1. confirm the expected object on PostgreSQL 17 from-zero (#626);
2. identify upgrade compatibility/data preconditions;
3. map ledger lifecycle findings to #628 and fiscal-authority findings to #629;
4. route all production DDL/backfills through #627;
5. rehearse the exact forward-only plan on an isolated database;
6. review any destructive operation manually; an `EXTRA_IN_PROD` finding is never an instruction to drop an object;
7. rerun this audit after convergence and require the unexplained P0/P1 set to be empty.

## Known follow-ups from the 2026-09-29 precheck

- `AUTHORITY_HISTORY_MISSING` / Prisma history: #626 then #627.
- Ledger lifecycle drift: #628, applied only through #627 after #626 evidence.
- Fiscal authority objects: #629, applied only through #627 after the single-source contract is proven.

GitHub Actions/Vercel availability is separate from this local database evidence. A remote check that did not run is `NOT_EXECUTED` or `BLOCKED_INFRASTRUCTURE`, never PASS.
