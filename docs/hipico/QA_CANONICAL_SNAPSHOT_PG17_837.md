# Control Hípico #837 — reproducible PostgreSQL 17, RLS and local Docker QA

**Status is determined by executed logs at the candidate SHA, never by this document.** Owner: #837; existing business admission and release authorities are unchanged. SOURCE WhatsApp remains NO_GO; auction financial operations remain blocked by #1010.

## What the QA gate proves (and does not prove)

The real integration probe `backend/src/modules/hipico-bot/hipico-domain-query.pg17.integration.ts` runs with a separate PostgreSQL 17 writer while the canonical reader holds one `RepeatableRead` snapshot. It verifies:

1. Aggregate `OPEN/v1` and `RACE_OPENED` event belong to the same snapshot even after a concurrent transaction commits `CLOSED/v2` and `RACE_CLOSED`.
2. The next read sees `CLOSED/v2` and its events. The query remains bounded and scoped by owner, group, kind and key; missing scope fails closed.
3. Service-level `ownerId/groupKey` filtering is tested with overlapping keys. Independently, **PostgreSQL RLS** is tested after `SET LOCAL ROLE authenticated`, with per-owner test claims and no-claim denial. Additional PostgreSQL permission tests require actual SQLSTATE `42501`: `anon` cannot SELECT, and `authenticated` cannot UPDATE domain state. A superuser SQL filter alone would not establish RLS.
4. The test refuses `DATABASE_RUNTIME_URL` overrides, non-local hosts, mismatched allocator host/port and names outside `hipico_e2e_*`; PostgreSQL major must equal 17.
5. BIGINT state versions outside JavaScript's safe integer range fail closed in both read and write, without appending new evidence. Additionally, an applied transition when `state_version` equals `Number.MAX_SAFE_INTEGER` rejects with `HIPICO_DOMAIN_STATE_VERSION_EXHAUSTED` **before** inserting the event or incrementing the version; the PG17 probe checks the aggregate and event count remain unchanged.
6. A correction added *after* a result but carrying a backdated `event_timestamp` must not be hidden from LAB. Canonical event ordering uses database `created_at`; newly recorded events receive `clock_timestamp()` only after acquiring the aggregate lock. The PG17 integration calls the real `persistHipicoDomainEvent` writer and requires LAB result disclosure to remain unavailable.

7. The PostgreSQL index for the new `created_at DESC, id DESC` ordering is present, valid and ready before the synthetic 100-read p50/p95 baseline runs. This is not a production SLA.
8. On applied canonical transitions, `hipico_domain_aggregates.updated_at` is stamped with `clock_timestamp()` *after* the event insert instead of transaction-start `now()`. The PG17 test requires aggregate `updated_at` not to predate the result event `created_at`. Corrections are append-only evidence and do not advance the aggregate's state timestamp.
9. Both canonical API read and write routes distinguish permanent state-version errors (`HIPICO_DOMAIN_STATE_VERSION_UNSAFE` / `HIPICO_DOMAIN_STATE_VERSION_EXHAUSTED`) from temporary backend outages: HTTP `409` with `retryable:false`, not `503` / infinite retry. Domain events remain unchanged on the rejected write. The route unit contract checks this classification; an HTTP/browser run is still required.

These are synthetic QA fixtures, not official external racing results, financial balances or remates. RLS is owner-based in the existing SQL policy; group-level separation is guaranteed by the server's query scope, not by pretending a group RLS policy exists.

## Execute with your own Docker Desktop on Windows

Prerequisites: Docker Desktop in Linux-containers mode, Docker Compose v2, Node.js 22, npm, Git, and a **clean checkout of the exact PR SHA**. Run PowerShell from the ContaGest repository root:

```powershell
git fetch origin
git switch fix/837-hipico-consistent-canonical-read-20261119
git pull --ff-only
$prHead = ((git ls-remote origin refs/heads/fix/837-hipico-consistent-canonical-read-20261119) -split '\s+')[0]
git rev-parse HEAD
git status --short
.\scripts\hipico-domain-snapshot-pg17-local.ps1 -CandidateSha $prHead
```

The script `scripts/hipico-domain-snapshot-pg17-local.ps1` performs and reports:

- Required `-CandidateSha` and live `git ls-remote` checks before **and after** QA, refusing stale PR HEAD, the wrong branch or a dirty working tree; environment fail-closed checks, Node22 + Docker Compose availability. If the network cannot confirm the current remote PR head, the run is BLOCKED—not certified.
- Dependency-free workflow/SQL static regression, reproducible backend npm-lock install, Agent System v3 router, backend lint/typecheck, Hípico test suite and build.
- An isolated `postgres:17-alpine` Compose project with ephemeral host port bound only to `127.0.0.1`, **tmpfs only**, a random synthetic QA password and health-gated startup using `docker compose up --wait` (no fixed sleeps).
- Creation of a unique `hipico_e2e_*` database; apply v14/v16/source-identity to an empty schema, seed a synthetic pre-existing aggregate+event, then apply the NEW `20261119144500_hipico_domain_recorded_order_index` migration and verify the historical evidence was preserved.
- The exact same real-write/snapshot/RLS integration test used by GitHub Actions.
- A PowerShell `finally` that drops the database, shuts down only the unique QA project and restores previous environment variables—even when tests fail.

No real WhatsApp session, buyer, horse, betting account, financial ledger or production database is accessed. A non-zero test exit **must not** be claimed as PASS. If a cleanup failure is reported, inspect the **unique QA project name** before taking action; never run broad Docker cleanup commands against unrelated projects.

If PowerShell policy blocks execution, use your organization's approved local-script policy; do not disable security controls globally.

## GitHub CI equivalent

`.github/workflows/hipico-domain-snapshot-pg17.yml` uses `postgres:17-alpine`, isolates the QA database with `scripts/hipico-ephemeral-db-v290.mjs`, routes the ticket via Agent System v3, runs the workflow-SQL contract check, typecheck and the real integration test, and drops the database in an `if: always()` step. The temporary `authenticated` role `GRANT SELECT` exists **only inside this synthetic test database**; production permissions and RLS migrations are not modified.

Evidence for approval must name **full SHA, job URL, PASS/FAIL output, PG17 version, schema migration result, and cleanup status**. A queued job, skipped job, check from an older SHA, or a local mock is not PASS.

## Additive index migration: operational gate and rollback

The canonical reader now uses database `created_at` instead of user-supplied `event_timestamp`. The existing v14 B-tree index only covers the latter. The new **immutable** Prisma ORM 6 migration `backend/prisma/migrations/20261119144500_hipico_domain_recorded_order_index/migration.sql` creates `hipico_domain_events_recorded_order_v837` on `(owner_id, group_key, aggregate_kind, aggregate_key, created_at DESC, id DESC)` with `CREATE INDEX CONCURRENTLY`, without updating historical rows or blocking ordinary writes. PostgreSQL prohibits this operation inside an explicit transaction block.

**Release prerequisites (NOT EXECUTED):** run the new from-zero + pre-existing synthetic row upgrade rehearsal on isolated PG17; independently verify an upgrade of a representative sanitized legacy schema (without using any shared/production database); query `pg_index.indisvalid` and `indisready`, compare representative `EXPLAIN (ANALYZE, BUFFERS)` before/after with sanitized synthetic volumes, measure p50/p95, and check replica/lock/space budgets. A failed concurrent build can leave an invalid index, so `IF NOT EXISTS` does not by itself prove a healthy index. The migration contains a postcondition on `pg_index.indisvalid`, `indisready` and column order, failing closed with `HIPICO_DOMAIN_RECORDED_ORDER_INDEX_NOT_READY` if a stale/invalid index exists; the PG17 integration independently checks it. Do **not** deploy or merge until these gates pass on the exact SHA.

**Safe recovery plan:** keep the pre-deploy backup/restore point and deployment SHA. If an index build is invalid or undesirable, DBA-reviewed `DROP INDEX CONCURRENTLY IF EXISTS public.hipico_domain_events_recorded_order_v837;` runs **outside a transaction** during an authorized maintenance operation. Do not rewrite or delete append-only domain events. Reverting application code alone does not reverse an applied migration.

**Historical limitation:** older rows recorded with `now()` use transaction-start timestamps, not necessarily exact commit order. This patch never silently backfills them; chronology guarantees and tie cases require a separately authorized reconciliation if they affect real historical records.

## Domain boundary: remates, apuestas and source provenance

The existing `docs/hipico/AUCTION_ADMISSION_V1010.md` marks auctions **BLOCKED** pending owner approval of business model, buyer eligibility, money authority, disputes, currency, permits and terms. A sale lot/hammer price is not a recreational race wager or an ERP ledger posting.

Public benchmarking (not a production data feed) may use publicly accessible official pages such as:
- [Keeneland 2026 sales buyer guide](https://www.keeneland.com/sales/buyers-guide-sales/) for **examples** of buyer registration, eligibility and conditions to discuss with the owner—not to clone legal rules.
- [Keeneland November 2026 sale information](https://www.keeneland.com/sales/2026/14/november-breeding-stock-sale/about/) for publicly posted catalog context.
- [TwinSpires terms](https://www.twinspires.com/terms/) for restrictions on third-party Equibase racing data. Automated scraping or redistribution is **not authorized by mere public access**.

Do not create crawler selectors, harvest records, bypass access controls, import unlicensed race/horse data or generate official-looking outcomes until source permission, provenance, retention, consent, rate limits and product authority are documented. Distinguish externally verified result from internal operator result and synthetic simulation.

## Remaining release gates

This focused patch **does not** certify UI/UX mobile and keyboard, Chromium/Firefox/WebKit, physical PWA/APK #119, 24–72h soak #120, DR #842, shared reports/ledger #1018, WhatsApp SOURCE #1011 or final GO/NO-GO #839. Keep PR #1367 in DRAFT until exact-SHA CI and relevant reviews complete.
