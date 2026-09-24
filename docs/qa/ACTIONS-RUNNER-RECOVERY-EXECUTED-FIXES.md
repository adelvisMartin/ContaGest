# GitHub Actions recovery — executed-runner regression fixes

## Baseline

This recovery batch starts from `main@b5ed36e6a35a491bf7735feb834ff15f78e8dee1`.

GitHub-hosted runners are executing again. The former `steps=null` incident is therefore no longer sufficient to classify current failures as infrastructure-only. Every red job is now inspected from its exact-SHA logs.

## Root causes observed on the recovered runner

### PostgreSQL / Browser QA

The disposable databases started empty while the oldest Prisma migrations are deltas over the historical SQL-first ContaGest schema. This produced `42P01 relation "Tenant" does not exist`.

The recovery keeps the database isolated and ephemeral. It bootstraps the historical v8.5 schema only for database names ending in `_e2e`, `_drill` or `_restore`, verifies required baseline tables, records only the four historical Prisma migrations that the SQL bootstrap already represents, then executes every later Prisma migration normally.

No production/shared database is reset, pushed or rewritten.

### Exact-SHA workflows

Pull-request workflows declared `CANDIDATE_SHA=github.event.pull_request.head.sha` but default checkout used GitHub's synthetic merge ref. The subsequent SHA assertion therefore failed even when the source branch was correct.

48/51, 49/51 and every executable 51/51 job now checkout the declared candidate SHA explicitly before validating it.

### AppSec

`frontend/api/**` is a serverless backend surface, not browser-delivered JavaScript. The security audit previously classified every path below `frontend/` as browser code and falsely reported server-side secret access in `frontend/api/hipico/status.js`.

The scanner now applies client-secret rules only to actual browser surfaces: `frontend/src`, `frontend/public`, the frontend entrypoint, solutions and portal pages. Repository-wide literal secret scanning remains unchanged.

### WCAG

The workflow invoked `test:browser:a11y` and `test:browser:contrast`, but those scripts did not exist. They are restored as explicit Chromium Playwright commands over the already-existing WCAG and contrast specs.

### Stateless CAPTCHA bootstrap

The full app import reached a Prisma CRUD delegate while production DB variables were intentionally absent. Generic CRUD routes now import and resolve the Prisma delegate only inside request handlers. This preserves the public stateless CAPTCHA bootstrap while DB-backed CRUD remains fail-closed on first use.

## Verification policy

This batch is not PASS until its exact head executes:

- source contracts;
- ContaGest CI;
- security baseline;
- PostgreSQL real gates;
- Browser QA;
- WCAG;
- release candidate gates.

Issue #134 can only close after the hardened recovery criteria from PR #501 are satisfied: exact SHA, assigned runners, executed steps, retrievable logs and successful required workflows.
