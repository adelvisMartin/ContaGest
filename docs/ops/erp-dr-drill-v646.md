# #646 — ERP disaster-recovery drill: local PostgreSQL 17, synthetic only

## Status and boundary

**PARTIAL / implementation delivered; real PostgreSQL restore NOT_EXECUTED until an operator runs it on a native, throwaway localhost PostgreSQL 17.** This is an ERP recovery *test harness*, not the production backup scheduler and not a substitute for the #842 Hípico backup-role/25-table recovery authority.

Authority: `AGENTS.md`, `.agents/skills/contagest-bcp-dr/SKILL.md`, `backend/scripts/migration-chain-v626.mjs` and `scripts/local-verification-runner-v630.mjs`. Existing `ops/backup/backup-postgres.sh` and `ops/backup/restore-drill.sh` remain unchanged. Real/offsite backup credentials, age private identities, Rclone configs and Supabase credentials **never** enter this harness.

## Design and safety

- The command accepts only `LOCAL_VERIFY_DATABASE_ADMIN_URL` targeting `localhost`, `127.0.0.1` or `::1`, database `/postgres`, no URL query/hash, and credentials. Production, preview and explicitly production CI contexts fail closed. It verifies **the server is PostgreSQL 17** using the established local guard. The database must truly be your own local disposable PostgreSQL instance; *do not tunnel a remote production database through loopback*.
- The canonical #630 helper creates two distinct `contagest_verify_*_e2e` databases, safely drops them in `finally`, and requires a privileged local admin role to create/drop databases. The source and target must be isolated from any development/shared database.
- Canonical **from-zero migration** authority #626 is executed against both databases; the source is seeded with QA-only actors and canonical RLS. Its fixture adds **two synthetic tenants**, client records, balanced posted journals (100.00 and 25.50), tax periods and audit entries.
- The backup uses PostgreSQL `pg_dump --data-only --format=custom --schema=public`, excluding `_prisma_migrations` data. **Only synthetic/QA fixtures**, not production data, are temporarily stored unencrypted in a restricted OS temporary directory (0700); SHA-256 is captured and the archive is deleted at the end.
- An explicit fault injection deletes only the two generated synthetic tenants in the **disposable source**, with dependent synthetic rows disappearing through canonical FKs; it then restores the archive into the **separately migrated disposable target**. No `--clean`, `--create`, `ALLOW_UNSAFE_RESTORE`, `ALLOW_PRIMARY_HOST_RESTORE` or provider API call is permitted.
- Exact synthetic tenant IDs and **one client, posted ledger entry, tax period and audit record per tenant** are checked independently before and after recovery. Each posted fixture entry must retain exactly two nonzero, mutually exclusive debit/credit lines balanced with exact integer cents (no binary floating-point). Fiscal snapshots include period `2097-10`, status `open` and the original `ivaDebit`/`ivaCredit`/`igtfPaid` Decimal values. Each synthetic tenant now has **nonzero, distinct** fiscal amounts: the journal 100.00 tenant has IVA debit 16.00, IVA credit 3.20 and IGTF paid 2.10; the journal 25.50 tenant has 4.08, 0.50 and 0.30. These are arbitrary synthetic values, **not statutory rates or compliance guidance**. The validator binds these triples to their owning tenant via the unique synthetic posted journal signature, rejecting exchanged tax values, zeroed values, or altered amounts even if the source and restored snapshot match each other. This does not replace legal-rule provenance or tax calculation validation. An identical but internally corrupted source and restore is rejected, in addition to pre/post SHA-256 comparison. These **synthetic fixture controls are not a production-wide ledger or tax reconciliation**. The real Express `/health/live`, `/health/ready` and Prisma retrieval of both restored synthetic tenants form the post-restore API smoke (via `qa/erp-restore-smoke-v646.test.ts`).
- Child subprocess environment is rebuilt from a narrow allowlist; it never inherits `SUPABASE_SERVICE_ROLE_KEY`, production DB URLs, offsite configuration or messaging credentials. The JSON report contains only status/error *codes*, exact source SHA, synthetic object counts/hashes, measured elapsed and synthetic RPO/RTO times. No passwords, connection strings, customer names, real rows or tokens.
- The report is written to `artifacts/drill-v646/<exact-SHA>/report.json`. A process terminated by SIGKILL/power loss cannot execute cleanup; inspect and destroy only verified `contagest_verify_*_e2e` orphan databases with a DBA before retrying.

## Runbook

Prerequisites: pristine checkout at the intended candidate SHA; Node 22, `npm ci`, native PostgreSQL 17 with `psql`, `pg_dump`, `pg_restore` and permission to create databases. Use a **temporary local admin credential**, never a Supabase/production URL.

PowerShell:

```powershell
$env:LOCAL_VERIFY_DATABASE_ADMIN_URL = 'postgresql://LOCAL_DR_ADMIN:LOCAL_PASSWORD@127.0.0.1:5432/postgres'
$env:CANDIDATE_SHA = (git rev-parse HEAD).Trim()
node --test tests/erp_disaster_recovery_v646.test.mjs
node scripts/erp-disaster-recovery-v646.mjs
```

Unix:

```sh
export LOCAL_VERIFY_DATABASE_ADMIN_URL='postgresql://LOCAL_DR_ADMIN:LOCAL_PASSWORD@127.0.0.1:5432/postgres'
export CANDIDATE_SHA="$(git rev-parse HEAD)"
node --test tests/erp_disaster_recovery_v646.test.mjs
node scripts/erp-disaster-recovery-v646.mjs
```

Expected: all stage statuses `PASS`, including `api-smoke`, `integrity`, and `cleanup`; target JSON candidate SHA equals checked-out HEAD. A `BLOCKED` or `FAIL` report is **never** a successful restore. The independent CI, production provider, object-storage restore and physical QA remain separately `NOT_EXECUTED` until evidenced.

## RPO/RTO semantics

`measuredSyntheticRpoMs` is the observed elapsed interval **from completion of the local test archive to deliberately triggered synthetic loss**, and `measuredSyntheticRtoMs` is elapsed from that simulated loss until verification and disposable DB cleanup; no artificial sleep is injected. No extra writes were performed between the backup and loss; consequently these numbers **do not demonstrate a real production RPO guarantee, PITR recoverability or a provider SLA**. Define a real production RPO/RTO target before #646 can be closed; rehearse with an authorized encrypted offsite backup in an equally isolated target, verify complete coverage including object storage, secrets restoration, tenant scopes and financial/fiscal snapshots, and record restore source timestamp/version, measured loss point and clock skew.

## Quality and release

Automated owner gates are checked in *local mode* rather than consuming GitHub Free Actions minutes for this PR, per user instruction. `[skip ci]` on the PR HEAD suppresses `push`/`pull_request` jobs; required GitHub checks may remain pending, and this does **not** mean tests passed. Separate mandatory evidence for full completion: Node contract tests; real PG17 drill; backend typecheck; ledger/fiscal/tenant real-DB regressions; independent review; verified offsite/prod-like backup source and complete recovery runbook. UI Playwright is not a substitute for database-integrity verification; final manual/device QA remains deferred by owner.

## Rollback

Revert only the new runner, Node contracts, restored-API smoke test and this runbook. No production data, migrations, existing backup scripts or GitHub branch protection were changed.
