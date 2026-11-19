# Control Hípico #837 — reproducible PostgreSQL 17, RLS and local Docker QA

**Status is determined by executed logs at the candidate SHA, never by this document.** Owner: #837; existing business admission and release authorities are unchanged. SOURCE WhatsApp remains NO_GO; auction financial operations remain blocked by #1010.

## What the QA gate proves (and does not prove)

The real integration probe `backend/src/modules/hipico-bot/hipico-domain-query.pg17.integration.ts` runs with a separate PostgreSQL 17 writer while the canonical reader holds one `RepeatableRead` snapshot. It verifies:

1. Aggregate `OPEN/v1` and `RACE_OPENED` event belong to the same snapshot even after a concurrent transaction commits `CLOSED/v2` and `RACE_CLOSED`.
2. The next read sees `CLOSED/v2` and its events. The query remains bounded and scoped by owner, group, kind and key; missing scope fails closed.
3. Service-level `ownerId/groupKey` filtering is tested with overlapping keys. Independently, **PostgreSQL RLS** is tested after `SET LOCAL ROLE authenticated`, with per-owner test claims and no-claim denial. A superuser SQL filter alone would not establish RLS.
4. The test refuses `DATABASE_RUNTIME_URL` overrides, non-local hosts, mismatched allocator host/port and names outside `hipico_e2e_*`; PostgreSQL major must equal 17.
5. BIGINT state versions outside JavaScript's safe integer range fail closed rather than silently rounding.

These are synthetic QA fixtures, not official external racing results, financial balances or remates. RLS is owner-based in the existing SQL policy; group-level separation is guaranteed by the server's query scope, not by pretending a group RLS policy exists.

## Execute with your own Docker Desktop on Windows

Prerequisites: Docker Desktop in Linux-containers mode, Docker Compose v2, Node.js 22, npm, Git, and a **clean checkout of the exact PR SHA**. Run PowerShell from the ContaGest repository root:

```powershell
git fetch origin
git switch fix/837-hipico-consistent-canonical-read-20261119
git pull --ff-only
git rev-parse HEAD
git status --short
.\scripts\hipico-domain-snapshot-pg17-local.ps1
```

The script `scripts/hipico-domain-snapshot-pg17-local.ps1` performs and reports:

- Dirty-worktree and Git SHA verification, environment fail-closed checks, Node22 + Docker Compose availability.
- Reproducible backend npm-lock install, Agent System v3 router, backend lint/typecheck, Hípico test suite and build.
- An isolated `postgres:17-alpine` Compose project with ephemeral host port bound only to `127.0.0.1`, **tmpfs only**, a random synthetic QA password and health-gated startup using `docker compose up --wait` (no fixed sleeps).
- Creation of a unique `hipico_e2e_*` database, then the canonical v14/v16/source-identity migrations on **only that database**.
- The exact same real-write/snapshot/RLS integration test used by GitHub Actions.
- A PowerShell `finally` that drops the database, shuts down only the unique QA project and restores previous environment variables—even when tests fail.

No real WhatsApp session, buyer, horse, betting account, financial ledger or production database is accessed. A non-zero test exit **must not** be claimed as PASS. If a cleanup failure is reported, inspect the **unique QA project name** before taking action; never run broad Docker cleanup commands against unrelated projects.

If PowerShell policy blocks execution, use your organization's approved local-script policy; do not disable security controls globally.

## GitHub CI equivalent

`.github/workflows/hipico-domain-snapshot-pg17.yml` uses `postgres:17-alpine`, isolates the QA database with `scripts/hipico-ephemeral-db-v290.mjs`, routes the ticket via Agent System v3, runs typecheck and the real integration test, and drops the database in an `if: always()` step. The temporary `authenticated` role `GRANT SELECT` exists **only inside this synthetic test database**; production permissions and RLS migrations are not modified.

Evidence for approval must name **full SHA, job URL, PASS/FAIL output, PG17 version, schema migration result, and cleanup status**. A queued job, skipped job, check from an older SHA, or a local mock is not PASS.

## Domain boundary: remates, apuestas and source provenance

The existing `docs/hipico/AUCTION_ADMISSION_V1010.md` marks auctions **BLOCKED** pending owner approval of business model, buyer eligibility, money authority, disputes, currency, permits and terms. A sale lot/hammer price is not a recreational race wager or an ERP ledger posting.

Public benchmarking (not a production data feed) may use publicly accessible official pages such as:
- [Keeneland 2026 sales buyer guide](https://www.keeneland.com/sales/buyers-guide-sales/) for **examples** of buyer registration, eligibility and conditions to discuss with the owner—not to clone legal rules.
- [Keeneland November 2026 sale information](https://www.keeneland.com/sales/2026/14/november-breeding-stock-sale/about/) for publicly posted catalog context.
- [TwinSpires terms](https://www.twinspires.com/terms/) for restrictions on third-party Equibase racing data. Automated scraping or redistribution is **not authorized by mere public access**.

Do not create crawler selectors, harvest records, bypass access controls, import unlicensed race/horse data or generate official-looking outcomes until source permission, provenance, retention, consent, rate limits and product authority are documented. Distinguish externally verified result from internal operator result and synthetic simulation.

## Remaining release gates

This focused patch **does not** certify UI/UX mobile and keyboard, Chromium/Firefox/WebKit, physical PWA/APK #119, 24–72h soak #120, DR #842, shared reports/ledger #1018, WhatsApp SOURCE #1011 or final GO/NO-GO #839. Keep PR #1367 in DRAFT until exact-SHA CI and relevant reviews complete.
