# Control Hípico Platform 2.0 — Integration Plan

**Baseline:** `main@42d7ed9e1919af9f0d6228af52d5d93e87be1f4b`

## Goal

Propagate the already-reviewed Agent/Shadow (#288) and Command Center/UX (#289) capabilities that were merged only inside the historical stacked branches, without reverting the newer canonical backend, messaging-adapter, mobile-hardening, security, or release-contract work that is already present on `main`.

## Non-negotiable invariants

- `/api/v1/hipico/*` remains the canonical backend/domain boundary.
- Serverless remains an adapter/BFF; it must not become a second domain brain.
- `SOURCE` is read-only. No productive autosend is enabled.
- `SHADOW` and `ASSISTED` never apply direct monetary/settlement effects.
- `financialAuthority=false` and `directEffectsApplied=false` remain enforced.
- No client-supplied actor identity may become audit authority.
- Backend/proxy failures must surface as unavailable/degraded, never as healthy zero counts.
- No secret/token may be exposed to the browser or committed to the repository.
- Do not force-merge historical stacked branches.

## Task 1 — Capture exact integration delta

1. Compare `main@42d7ed9…` with `fix/hipico-command-center-289-recovery@b6d70dd…`.
2. Classify files as additive vs. semantic-merge-required.
3. Confirm Agent/Shadow and Command Center modules are absent from `main` before adding them.
4. Record CI evidence for `b6d70dd…`; classify `runner_id=0` + `steps=[]` as infrastructure-blocked, not PASS/fail.

## Task 2 — Add Agent/Shadow modules (#288)

Add the canonical implementation and regression assets:

- `backend/src/modules/hipico/agent-engine.ts`
- `backend/src/modules/hipico/agent-policy.ts`
- `backend/src/modules/hipico/agent-policy.test.ts`
- `backend/src/modules/hipico/agent-route-security.test.ts`
- `backend/src/modules/hipico/agent.routes.ts`
- `backend/src/modules/hipico/automation.store.ts`
- `docs/ADR-AGENT-SHADOW-288.md`
- `qa/fixtures/hipico-agent-golden-v1.json`
- `supabase/sql/hipico_v23_agent_shadow.sql`

Semantically wire the router into the current `backend/src/app.ts` rather than replacing that file with the stacked ancestor.

## Task 3 — Add Command Center/UX modules (#289)

Add:

- `backend/src/modules/hipico/command-center.routes.ts`
- `backend/src/modules/hipico/command-center.service.ts`
- `backend/src/modules/hipico/command-center.service.test.ts`
- `frontend/api/hipico/command-center.js`
- `frontend/public/hipico-control/assets/js/command-center.js`
- `frontend/public/hipico-control/assets/js/command-center-shell.js`
- `frontend/public/hipico-control/assets/js/theme-bootstrap.js`

Semantically merge the current versions of:

- `backend/src/modules/hipico/hipico-system.service.ts`
- `backend/src/modules/hipico/hipico-system.service.test.ts`
- `frontend/api/hipico/canonical-backend.js`
- `frontend/package.json`
- `frontend/public/hipico-control/index.html`
- `frontend/public/hipico-control/sw.js`
- `frontend/public/hipico-control/STYLE-GUIDE.md`
- `android/app/src/main/assets/sync-web.mjs`

Preserve newer main-side security checks, mobile-hardening contracts, release/version behavior, and Android/PWA parity.

## Task 4 — Regression-first verification of integrations

Before considering the integration complete, verify source contracts for:

- Agent mode promotion is adjacent-only.
- Client `operatorId` cannot author audit identity.
- Unknown tool args / SQL / shell / secret-like payloads are rejected.
- `SHADOW` never acts; monetary/review operations never auto-act.
- Command Center reports `unavailable`/`degraded` instead of synthetic zeroes.
- Bridge `degraded` is not rewritten as `not_configured`.
- Browser never receives the server-only operator token.
- Canonical backend path normalization/traversal protections remain intact.
- Light/dark/system bootstrap does not persist sensitive operational data.

## Task 5 — Inspect exact resulting diff and security surface

Review the final branch diff against `main`, including migrations, routes, auth/rate-limit middleware, generated/static assets, Service Worker cache list, Android sync list, and package scripts. Reject any unrelated historical delta.

## Task 6 — Execute repository gates when infrastructure permits

For the exact final SHA:

```bash
cd backend
npm run typecheck
npm run test:hipico
npm test
npm run build

cd ../frontend
npm run test:hipico:command-center
# plus the repository's current source-contract/unit/build/browser/WCAG/PWA gates
```

Run PostgreSQL-backed E2E only against an isolated ephemeral database. Do not report PASS if GitHub Actions again produces `runner_id=0` / `steps=[]` or if Vercel is rate-limited.

## Task 7 — Reconcile late stacked deltas before #290

Inspect PR #323 and PR #325 individually. Bring forward only changes that belong to the Platform 2.0 architecture and remain absent from `main`; do not merge either stack wholesale.

## Task 8 — Rebuild #290 over the clean integration base

Selectively recover from PR #318 only the still-relevant production gates: ephemeral PostgreSQL, RLS/migrations, TestChannel E2E, PDF/OCR, lifecycle/restart recovery, Agent/Shadow, Command Center/browser/PWA/Android, secret scan, release guard, artifacts, and SHA-bound evidence. Remove duplication already solved by #284–#289.

## Completion criteria

This plan is not DONE until the final exact SHA has been diff-reviewed, contains no secrets or known regressions, all applicable local/repository gates have actually executed, and required published checks are green. External runner/Vercel blocks are reported separately as `BLOCKED`, never normalized into PASS.
