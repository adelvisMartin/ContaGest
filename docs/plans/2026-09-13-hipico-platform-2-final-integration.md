# Hípico Platform 2.0 — final integration plan

**Candidate branch:** `integration/hipico-platform-2-final`  
**Baseline:** `main@bec584c17e94ea0c071ffe07541efb685d21d32a`  
**Scope:** reconcile the stacked #288/#289/#290 deltas that are still absent from current `main`, preserve newer hardening already integrated by #327, and strengthen project agent/skill guardrails without broad unrelated refactors.

## Authority and invariants

- Current `main` is the merge authority. Historical PR files are inputs, never replacement truth when current code diverged.
- SOURCE remains read-only. LAB is the only automation write target.
- Documents/providers/model/agent output are evidence only (`financialAuthority=false`).
- Canonical state mutation stays under authenticated `/api/v1/hipico/*`; `/api/v1/hipico-bot/*` remains integration/adaptor surface.
- Current proxy/path/auth hardening, tenant boundaries, auditability and fail-closed behavior must not regress.
- No production migration/deploy/merge is performed by this plan.

## Gate 1 — reconcile Agent/Shadow automation (#288)

Expected paths include `backend/src/modules/hipico/agent-*`, canonical app routing, Hípico SQL/workflows/tests and exact-SHA evidence hooks.

1. Diff historical #288 recovery head against current `main` path-by-path.
2. Port only missing modules/tests.
3. Reconcile shared routes/configuration semantically; preserve newer current-main validation.
4. Verify replay/idempotency, human takeover, group isolation, SOURCE/LAB boundary and zero financial authority.

## Gate 2 — Command Center + responsive shell (#289)

Expected paths include:
- `backend/src/modules/hipico/command-center.*`
- `frontend/api/hipico/command-center.js`
- `frontend/public/hipico-control/assets/js/{theme-bootstrap,command-center,command-center-shell}.js`
- `frontend/public/hipico-control/{index.html,sw.js,STYLE-GUIDE.md}`
- `android/hipico-control-v1130/scripts/sync-web.mjs`
- Command Center contract tests and package test wiring.

Requirements:
- keep current hardened `canonical-backend.js` rather than overwriting it;
- fail closed for unavailable reads;
- no SOURCE JID exposure;
- loading/empty/error/offline/success states;
- keyboard/focus/contrast/light/dark/reduced-motion contracts;
- geometry at 360/390/430/768/1024/1440 without document-level horizontal overflow;
- service-worker shell parity without caching authenticated API responses;
- Android web parity checks.

## Gate 3 — AnyDoc / Archify (#290)

1. Port only absent pinned AnyDoc/Archify toolchain and workflows.
2. Preserve local-first OCR and explicit hosted OCR opt-in.
3. Keep architecture artifacts SHA-bound and deterministic.
4. Do not weaken data-engine workflow or exact-SHA gates.

## Gate 4 — agents and project skills

Inspect `AGENTS.md`, gate router and project skills before edits. Improvements must be bounded and auditable:
- deterministic routing for Control Hípico paths;
- evidence vocabulary `PASS/FAIL/BLOCKED/NOT_EXECUTED`;
- post-task retrospective may propose skill changes, but agents may not silently mutate security/CI/release policy;
- repeated failures can produce a reviewed skill update plus regression test; no recursive or autonomous self-edit loop;
- exact-SHA evidence remains mandatory.

## Gate 5 — verification

Run/observe on the final candidate SHA, as applicable:

```bash
npm ci
npm run skills:check
npm run agent:gates -- --base main
npm run typecheck
npm test
npm --workspace backend run typecheck
npm --workspace backend run test:hipico
npm run audit:functions
npm run audit:visual:strict
npm run doctor:changed
npm run doctor:design
npm run build
npm run check:bundle
```

For Hípico-specific risk, also require canonical contracts, PostgreSQL/migration isolation gates, Bridge/source-read-only tests, AnyDoc/provider/race/agent tests and the existing deterministic scenario campaign when wired by repository scripts.

Browser/runtime evidence must cover the affected PWA route at 360/390/430/768/1440, light/dark, keyboard/focus, loading/empty/error/offline/success and console/network errors. If runners/browsers/providers do not execute, report `BLOCKED`/`NOT_EXECUTED`, never PASS.

## Delivery

- Review final diff against `main` and classify unrelated work as follow-up.
- Open one integration PR to `main` only after the candidate branch is coherent.
- Do not merge automatically.
- Closure report records baseline/final SHA, changed paths, acceptance evidence, security/regression risks and exact gate status.
