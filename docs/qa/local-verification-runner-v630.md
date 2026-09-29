# Local Verification Runner v630

Canonical local verification for issue #630.

## Purpose

`npm run verify:local -- --profile <profile>` orchestrates existing authoritative repository commands. It does not replace test suites or GitHub workflows. Its evidence is bound to the checked-out candidate SHA and is intended to remain useful when GitHub Actions or Vercel are unavailable.

## Profiles

```powershell
npm run verify:local -- --profile backend
npm run verify:local -- --profile frontend
npm run verify:local -- --profile database
npm run verify:local -- --profile financial
npm run verify:local -- --profile ui
npm run verify:local -- --profile changed --base main
npm run verify:local -- --profile full
```

Use `--dry-run` to print the exact plan with every gate as `NOT_EXECUTED`. A dry-run never claims PASS.

Use `--expected-sha=<40-char-sha>` whenever the candidate SHA is known. A mismatch fails with `EVIDENCE_SHA_MISMATCH`. The runner also rejects a dirty worktree because generated evidence must describe one immutable candidate.

## Profile authority

- `backend`: backend typecheck, authoritative tests/contracts and backend build.
- `frontend`: frontend build plus the current visual contract suite.
- `database`: #626 migration from-zero, supported upgrades, physical manifest, DB authority and raw-SQL security.
- `financial`: real PostgreSQL financial/fiscal/idempotency regressions plus Decimal, ledger, typecheck and backend build.
- `ui`: frontend build, the current `qa:ui:58` authority plus explicit Chromium functional, accessibility and contrast gates. The superseded/broken `qa:ui` chain is not selected.
- `changed`: asks `agent:gates` for the changed boundaries and maps only affected boundaries to the profiles above; it never invents a second routing catalog.
- `full`: de-duplicates the authoritative commands from the profiles above; it does not enumerate historical workflows.

## PostgreSQL safety

`database`, `financial`, `full`, and a `changed` plan that selects DB/financial require PostgreSQL reachable on loopback (`localhost`, `127.0.0.1` or `::1`). Configure one of:

```powershell
$env:LOCAL_VERIFY_DATABASE_ADMIN_URL='postgresql://postgres:postgres@127.0.0.1:5432/postgres'
# or DATABASE_URL pointing to the same local PostgreSQL service
```

The runner creates a unique `contagest_verify_<sha>_<pid>_<timestamp>_e2e` database, injects it as `DATABASE_URL`, and drops it with `FORCE` in `finally`, including gate failure. Non-loopback database hosts fail closed with `LOCAL_POSTGRES_BLOCKED:NON_LOCAL_HOST`; this prevents accidental destructive QA against Supabase/dev/prod.

The DB profile delegates migrations to #626; it does not execute ad-hoc DDL.

## Browser

The UI profile uses the existing repository Chromium gates and real frontend build/runtime paths. Firefox/WebKit remain separate scheduled/issue-specific evidence unless a ticket explicitly requires them.

## Evidence

Successful or failed non-dry runs write:

```text
artifacts/local-verification/<candidate-sha>/<profile>/manifest.json
artifacts/local-verification/<candidate-sha>/<profile>/logs/<gate>.log
```

The manifest records candidate/base SHA, profile, derived changed profiles, OS/architecture, Node/npm and applicable PostgreSQL/Playwright versions, every gate command, timing, exit code/status, log path, remote CI/deploy metadata, and a deterministic SHA-256.

Allowed states are only:

```text
PASS | FAIL | BLOCKED | NOT_EXECUTED | NOT_APPLICABLE
```

A required `FAIL`, `BLOCKED` or `NOT_EXECUTED` fails the local profile. `REMOTE_CI` / `REMOTE_DEPLOY` are metadata only and cannot turn a local PASS into FAIL or a missing remote execution into PASS.

Credential-bearing URLs and token-like metadata are redacted before persistence. Business payloads, PII, production rows and secrets are not evidence inputs.

## Recommended ticket mapping

| Ticket boundary | Profile |
| --- | --- |
| backend/API/auth | `backend` |
| frontend source without browser risk | `frontend` |
| Prisma/migrations/schema | `database` |
| accounting/fiscal/banking/payroll money flows | `financial` |
| component/layout/theme/accessibility/browser flow | `ui` |
| mixed unknown scope during iteration | `changed` |
| batch/release close | `full` |

For P0/P1 tickets, keep any stricter ticket-specific gate in addition to the profile. This runner is a canonical orchestrator, not permission to reduce an acceptance criterion.
