# #664 · Operational smoke pack — ContaGest ERP + Control Hípico

## Status and authority

This is an **implementation increment** of [#664](https://github.com/adelvisMartin/ContaGest/issues/664), not production acceptance. It reuses the canonical PostgreSQL isolation helper in #630, the existing #58/75 real-browser journey and the read-only Hípico smoke. It does not add parallel auth, ledger, browser or tenant test owners.

## Preconditions

- Clean checkout of the candidate SHA, Node 22 and dependencies installed from the repository's **npm package-lock** (`npm ci`). This repository does not currently use a pnpm lockfile.
- Local native PostgreSQL **17** running with `psql` installed. Provide the **local admin** URL (`/postgres`), not a development or production DB URL. The run creates a unique `contagest_verify_*_e2e` database and drops it even when a child gate fails.
- Chromium and Playwright available locally (`npx playwright install chromium`). Existing Playwright config starts the frontend on loopback; the #58/75 runner starts the real backend.
- For the **combined** ERP + Hípico run, Control Hípico must already be reachable at a dedicated HTTPS or loopback HTTP root URL, and its read-only status and PWA routes must be available. Never pass a SOURCE WhatsApp group URL or private access token.

Example on a Unix-like shell (use temporary local credentials only):

```sh
export LOCAL_VERIFY_DATABASE_ADMIN_URL='postgresql://LOCAL_USER:LOCAL_PASSWORD@127.0.0.1:5432/postgres'
export CANDIDATE_SHA="$(git rev-parse HEAD)"
export HIPICO_SMOKE_BASE_URL='http://127.0.0.1:8090/'
node scripts/erp-operational-smoke-v664.mjs
```

Windows PowerShell:

```powershell
$env:LOCAL_VERIFY_DATABASE_ADMIN_URL = 'postgresql://LOCAL_USER:LOCAL_PASSWORD@127.0.0.1:5432/postgres'
$env:CANDIDATE_SHA = (git rev-parse HEAD).Trim()
$env:HIPICO_SMOKE_BASE_URL = 'http://127.0.0.1:8090/'
node scripts/erp-operational-smoke-v664.mjs
```

For a **focused ERP-only** verification, use `node scripts/erp-operational-smoke-v664.mjs --erp-only`. This marks Hípico `NOT_APPLICABLE` for the focused run, **not verified** for the combined ticket.

## Executed stages (when prerequisites exist)

1. Fail closed on stale/dirty SHA, production environment, remote PostgreSQL, wrong admin DB or server version other than PostgreSQL 17.
2. Create an ephemeral local PostgreSQL database using #630; strip remote DB/provider credentials, override runtime/direct DB URLs, and generate fresh local signing secrets.
3. Generate Prisma; run the canonical **from-zero migration chain** (#626), which prepares the supported historical baseline before deploying existing migrations on the disposable database; seed QA-only actors and apply canonical RLS.
4. Execute `qa/erp-operational-financial-v664.test.ts`: real backend liveness/readiness **exact-SHA**, authenticated tenant-scoped trial-balance read, unauthorized negative, deliberately unbalanced posting rejected with 422 and ledger unchanged.
5. Execute `scripts/erp-real-browser-postgres-v5875.mjs`: start the actual backend plus Playwright Chromium frontend; login with cookies, cross-tenant denial and UI create/read/persistence checks across dental, vet and gym. Fixtures are run-prefixed and cleaned by the existing #58/75 runner.
7. After the PostgreSQL database has been dropped, run `runHipicoSmoke()`: read-only GET of Hípico bounded status and actual PWA entrypoint; **no** WhatsApp sending, provider writes or financial mutation.
8. Store stage statuses, exact candidate SHA and elapsed time under `artifacts/operational-smoke/<SHA>/report.json`. **No credentials, PII or database URL** belong in the report.

All mandatory stages fail closed. `FAIL`, `BLOCKED` and `NOT_EXECUTED` are never reported as `PASS`. Provider CI/deploy and **manual QA** are separately `NOT_EXECUTED` unless separately evidenced.

## Unit and integration verification

```sh
node --test tests/erp_operational_smoke_v664.test.mjs
# For the complete local operational run:
node scripts/erp-operational-smoke-v664.mjs
```

The focused Node test checks unsafe PostgreSQL targets, exact-SHA guards, no hidden skips/forced commands and remote credential removal. The dedicated workflow \`operational-smoke-v664.yml\` runs this contract plus a PostgreSQL 17/Chromium **ERP-only** execution on an exact candidate SHA; the combined Hípico check remains a distinct prerequisite. The real integration test and Chromium are executed only by the full runner on PostgreSQL 17, **not** by the pure Node contract test.

## Limitations / follow-ups

- The #58/75 Chromium journey covers create and read/persistence across three verticals; it is **not** proof of every update/delete branch or full ERP regression.
- Hípico read-only status checks contract shape, not a physical device or WhatsApp send.
- A successful localhost run is not proof that an external deployment has the same SHA, configuration or readiness.
- A process killed without cleanup opportunity (e.g., SIGKILL/power loss) can leave a disposable DB; inspect and remove only known `contagest_verify_*_e2e` leftovers through DBA-controlled procedures.
- The owner-performed device/browser/manual acceptance campaign remains deferred; #664 stays open until all material criteria and exact-SHA evidence are satisfied.

## Rollback

The increment introduces no migration or application business change. Revert the new smoke files/commits if necessary; the disposable database is scoped to the run.
