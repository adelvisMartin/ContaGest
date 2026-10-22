# #688 · Vercel BUILD_UTILS_SPAWN_103 — exact-deployment investigation

Status: **source regression identified; deployment recovery NOT VERIFIED**. This is a code/test-characterization repair, not permission to skip preflight QA or deploy unreviewed code.

## Source of evidence and target

Project: `conta-gest-frontend` (`prj_0kjuUKTv3iEKd8B3VeOyqgMI8gof`), team `team_kEFhtV7VkJyTHIQWxA9Q80YI`, framework Vite; project setting Node 24.x is overridden by repository `engines.node=22.x`. Builds actually use Node v22.23.2, per deployment logs.

Evidence snapshots (Vercel Deployment Events API; no secret values copied):

| Deployment | Exact source SHA | State | Observed cause |
| --- | --- | --- | --- |
| `dpl_563HexLjmMyQ81scc2gdxSUpDykB` | `f38287cda3a72d6fe8ad49a3e7c307bd132490fc` | ERROR | `source-qa` → `contracts-current`: `tests/cloudflare_security_audit_skill_contract.test.mjs` asserted old literal role names no longer present in a semantically equivalent wrapper. |
| `dpl_7vVoZJahaubUKLaYxTmCh21RZYWH` | `b6483997ab85b6131f9c5f4f25f5b51bce08abcd` | ERROR | `source-qa` → `contracts-current`: `tests/tenant_user_provisioning_55_75.test.mjs` assumed tenant registration writes directly in `auth.routes.ts`; registration now invokes `registerTenantBootstrap` and a private PostgreSQL function. |
| `dpl_CxQoQEqYQzMLaBrqYfJ8fkmL53fz` | `5523608b3ca7f98727d043902ae7d47dd09880c5` | CANCELED | No build logs available; not a substitute for SUCCESS. |

At both failed SHAs: `npm ci --no-audit --no-fund` completed; `build:identity` passed; `frontend/scripts/vercel-build.mjs` invoked `scripts/vercel-source-preqa-diagnostic.mjs`, and `test:contracts:current` failed before browser QA, backend-stage or Vite production bundle. The build script mapped this to exit **103**. This is **not** evidence of OOM, a Node 24 mismatch, network outage or a Vercel runner crash.

## Safest repair

1. Align the legacy #55/75 source characterization with the current **private PostgreSQL bootstrap** in `backend/src/database/auth-bootstrap.ts`: verify the public-registration gate, absence of inline tenant upsert/update, collision mapping, parameterized SQL call, explicit error on no result, and only the authorized tenant/profile identifiers returned. Keep the existing atomic license/member transaction checks.
2. Preserve the Cloudflare review trust precedence (owner + AGENTS.md → orchestrator/AppSec/security reviewers → external pinned guidance) without freezing obsolete descriptive spellings. Keep pin, allowlist, no vendored execution, security bounds and status contracts.
3. Do not bypass `contracts-current` or switch build commands to skip tests; do not change production environment settings without an exact-deployment reason.

## Reproducible local and exact-SHA verification

From a clean checkout of the candidate (Node 22, `npm ci`):

```sh
node --test tests/tenant_user_provisioning_55_75.test.mjs tests/cloudflare_security_audit_skill_contract.test.mjs
npm run test:contracts:current
npm run build:frontend
```

For full acceptance: also run backend typecheck and repo CI; inspect the Vercel deployment created **for the merged candidate SHA** and confirm all five Vercel build stages PASS plus provider status READY. A local contract PASS cannot substitute for a remote production deploy.

If build fails at another test on the same SHA, capture its exact filename/assertion from that deployment and address the underlying contract only if it is actually outdated. Do not reinterpret a real security regression as test drift.

## Rollback and escalation

The change is restricted to source-only characterization and this incident runbook; no business data, migrations, keys, identities or Vercel config are modified. Revert the PR if the test update weakens an invariant or introduces a new regression. If later failures are caused by provider quota, concurrency, or settings, record a **separate** `BLOCKED_INFRASTRUCTURE` state with provider evidence and an operator action.

Owner remains responsible for provider remediation and manual QA. Ticket #688 must not be closed solely on the strength of old deployment logs or queued CI.

## Follow-up after PR #1008 merged: next source-only regression (2026-10-15)

Provider deployment `dpl_3gABPS4RT9fGnQaDcvsiX3k9e8Ny` ran from exact `main@6b0e77e2bd8d0eef58c57653406a0e007388c223`. The previous Cloudflare and bootstrap assertions no longer stopped `contracts-current`; its next test failed in `tests/license_canonical_modules_56_75.test.mjs:41`: **actual unique canonical routes = 59, old literal assertion = 57**. The same failure was observed in deployment `dpl_25UGU2VDgBekRRT74ur6s4ggo7SQ` for `main@9ced7fa1fa7b6aaa516a37b190a072a719fbccc6`. Neither had a successful production build. This is a distinct stale source test, not evidence of an unauthorized module silently added by this PR.

Proof of source authority: `backend/src/shared/contracts/access-manifest.json` has 59 **unique** routes; the validated `ACCESS_MANIFEST` drives `frontend/src/data/moduleCatalog.js` and `CANONICAL_LICENSE_MODULES` in `backend/src/modules/licenses/licenses.contracts.ts`. Test fix must compare the exact route sets and preserve validation of unknown routes. Do not hard-code either 57 or 59: module growth must require an authorized manifest change but must not break on an incidental constant in a source-only regression.

This incremental PR updates **only the characterization test and this operational log**; it does not edit permissions, license issuance, RLS, tenant contexts, route definitions or manifest modules. The specific new invariant passed one V8 source-only evaluation with the current 59-route manifest and current license validator. **Not** a full Node test, Vercel READY or production deploy. Further failures in future exact-SHA Vercel builds require independent root-cause investigation. Do not close #688 until a completed READY deployment is observed.

## Follow-up: Problem Details v2 validation source drift (2026-10-15)

Verified Vercel deployment `dpl_D4Ay6vgHSz9oi58Fo2pcAr3Yy9RE`, exact `main@21c597dea8d2ee307181e2462d6a7944027b3a8c`, ended `ERROR` / `BUILD_UTILS_SPAWN_103` during `source-qa → contracts-current`. The failing `tests/api_validation_error_59_75.test.mjs` asserted the old inline middleware (`ZodError`, `HttpError`, `databaseMessage`, direct `payload.details = error.issues`). The current authoritative behavior is intentionally split: `backend/src/shared/middleware/error.ts` calls `normalizeOperationalError` and `buildErrorEnvelope`; `backend/src/shared/observability/contract.ts` maps Zod to 422, provider dependency to 503, explicit HttpError status otherwise, with `redactTelemetryValue` and Problem Details v2. `redaction.ts` applies recursive key/value masking.

Change `tests/api_validation_error_59_75.test.mjs` to assert the **current authority and retained security rules**; never restore unsafe raw Zod issues or bypass `source-qa`. Add executable behavior regressions `qa/observability-validation-v688.test.ts` for 422/409/503/500 with redacted fake credentials. The source test callbacks ran against actual GitHub source and both passed (2/2); this is **not** an actual `node --test` or `tsx` run. No local checkout/dependencies or full Vercel READY proof available in that result.

Reproduce locally with Node 22/npm lockfile:

```sh
node --test tests/api_validation_error_59_75.test.mjs
npm --workspace backend exec -- tsx --test ../qa/observability-validation-v688.test.ts
npm run test:contracts:current
npm run build:frontend
```

After merging, inspect the **exact deployed main SHA** and follow each newly surfaced `source-qa` failure to its true owner. Do not close #688 before `READY` and post-deploy checks; the latest provider result in this section is an observed ERROR, not successful production recovery.


## 2026-10-22 · five-ticket batch: #688, #985, #979, #638, #720

### Exact observed production failure; not a generic infrastructure crash

- GitHub baseline: main@0b9a78a15e1eb8d9afeeee2f39d86b87a6ab0ca1.
- Vercel project prj_0kjuUKTv3iEKd8B3VeOyqgMI8gof, deployment dpl_8g8TxV3ALEwAfgvtnS8gASAWF2bR for that **exact** SHA: ERROR / BUILD_UTILS_SPAWN_103.
- Project setting Node 24.x is overridden by repository engines.node=22.x; actual build ran Node v22.23.4. Do not infer a Node-mismatch failure.
- Build workspace /vercel/path0/frontend; install npm ci --no-audit --no-fund; build npm run build invokes frontend/scripts/vercel-build.mjs. Identity stage 1/5 PASS; source-qa 2/5 FAIL at contracts-current (2 assertions fail). Later stages are **NOT EXECUTED**.
- The failed source suite is tests/tenant_isolation_adversarial_issue_641.test.mjs. Its assertions at lines 31 and 45 expect a deprecated tenantScoped=false CRUD branch and mistake harmless static field labels (such as ['clientId']) for a user-provided foreign identifier.
- The current CRUD source injects authenticated ctx.tenantId in all list/read/write operations and reports only fixed field-name labels. The batch source-contract fix checks tenant+permission middleware, scoped list/read/update/delete, server-owned tenant for create, write-body validation and non-disclosing relation errors. No API, auth, RLS, migrations or build stage is relaxed.
- Pre-commit source-only matching checked ten CRUD source assertions, both guarded mutations and four constant-label error sites. This is **NOT** a native Node test, PostgreSQL/API regression run or Vercel PASS. The candidate SHA must pass those gates independently.

### Reconciliation of the remaining four tickets

| Issue | Integrated code / historical evidence | Material acceptance still pending |
| --- | --- | --- |
| #985 OPS disposable PostgreSQL | PR #987 merged disposable drill database name; PR #1159 merged recovery _restore name. The SQL guard remains strict. Historical run 38606567669 passed migrations but skipped restore/rollback after an unrelated quality failure. | Confirm a successful exact-SHA PostgreSQL 17 job with actual recovery and application rollback. |
| #979 RFC7807 / redaction | PR #1160 merged nested credential redaction; PR #1263 merged private-key test fixture hardening. Problem Details v2 and negative leakage assertions exist. | Execute candidate-SHA runtime/CI observability regressions. |
| #638 CRUD allowlists / RBAC | PRs #1009, #1163 and #1270 merged typed model-bound permissions and schemas, guarded fields, query limits and tenant predicates. | Backend typecheck and PostgreSQL 17 two-customer A/B HTTP authorization tests on final SHA. |
| #720 production security | Prior read-only production catalogs reported least-privileged dedicated roles and 14/14 backend-only browser grants removed. Historical, not proof of current deployed process. | Vercel READY and deployed HTTP backend smoke verifying use of contagest_runtime, without destructive production QA. |

**Release decision:** NOT_READY / PARTIAL until final candidate checks, recovery drills, security QA and deployment READY are verified. #647 and #669 must consume the real evidence independently, not a presumed production PASS. Keep all five issues open/in the validation backlog until their material acceptance gates pass. Do not disclose credentials, signed URLs or production environment values.
