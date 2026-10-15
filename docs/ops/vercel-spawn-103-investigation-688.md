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
