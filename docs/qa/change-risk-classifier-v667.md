# #667 — Change Risk Classifier (local-first)

## Authority and scope

The agent routing catalog remains `qa/support/domain-risk-catalog.mjs` (#623). The deterministic verification policy in `qa/support/change-risk-classifier-v667.mjs` consumes that catalog for review metadata, then selects **executable profiles**, not agents. `scripts/local-verification-runner-v630.mjs` (#630) is still the sole executor and evidence writer.

This is a **minimum** gate selector, not a waiver of ticket-specific acceptance evidence, code review, security assessment or isolated PostgreSQL tests.

## Run

From a **clean committed branch** based on `main`:

```sh
node scripts/local-verification-runner-v630.mjs --profile changed --base main --dry-run
node scripts/local-verification-runner-v630.mjs --profile changed --base main --expected-sha "$(git rev-parse HEAD)"
node --test tests/change_risk_classifier_v667.test.mjs
```

The dry-run returns machine-readable JSON with `riskDecision`, per-path rationale (`matches`), matching agent catalog domains, derived profiles, gate commands, critical flag, and `NOT_EXECUTED` for every previewed gate. Execution writes `artifacts/local-verification/<SHA>/changed/manifest.json` with statuses and a deterministic manifest hash.

For DB/financial/security changes the runner provisions a **new isolated PostgreSQL database** from a loopback admin URL (e.g. `LOCAL_VERIFY_DATABASE_ADMIN_URL`), destroys only its owned database in `finally` and refuses a non-local host. No production/development shared DB is an acceptable substitute. Missing DB/browser/runtime prerequisites must remain `BLOCKED` or `NOT_EXECUTED`, never PASS.

## Routing policy

| Changed area | Minimum profiles |
| --- | --- |
| Prisma or Supabase SQL/migrations | backend + database |
| Accounting, fiscal, FX, payments, sales/inventory domain | financial + database (+ backend for backend paths) |
| Auth, tenant/RBAC, mass assignment and sensitive media boundaries | backend + database + security |
| UI tokens, canonical styles and shared components | frontend + ui |
| Frontend page/route or browser spec | frontend + ui-routes (or ui-routes for specs alone) |
| Docker/ops/workflows/build dependencies | infra |
| AGENTS and agent governance | docs (when Markdown) + agent |
| Plain Markdown/docs | docs |
| Other recognized backend/frontend code | backend/frontend |
| Unknown changed path | backend + frontend (fail-safe) |
| Missing diff context | backend (fail-safe) |

When multiple contexts change, profiles are unioned and duplicate commands removed. The policy intentionally does not infer the full suite from every change, and excludes unrelated broad agent-routing matches from automatic gate selection. Schema/migration changes still require tenant-negative and DB gates even when the associated code touches other domains.

### Manual overrides

To **add** gates, pass `--add-profiles=security,ui`. To **reduce** automatically selected gates, pass `--remove-profiles=... --override-reason="Specific auditable owner justification"`. Reductions with missing/short reasons are rejected, and every reduction is marked `riskDecision.override.requiresReview=true`. A justification is not evidence that skipped material validation passed; reviewers must approve the exception. Neither option is accepted for fixed explicit profiles.

## Evidence and limitations

Unit fixtures cover finance/FX, DB, auth/RBAC, UI, documentation, operations, mixed diffs, deterministic ordering, invalid paths and manual overrides. Integration fixtures create temporary Git repositories and call the actual runner with `--profile changed --dry-run`; no network or persistent DB is needed for those fixtures.

Full lint/typecheck/build/E2E, material DB transactions, provider CI and deployment remain separate verification dimensions. Other tickets, in particular #638 (CRUD factory) and #666 (documentation reference validation), retain their own acceptance scopes; this classifier does not claim to implement or close them.
