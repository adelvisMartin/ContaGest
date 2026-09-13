# Control Hípico Update 1 Promotion Design

## Goal
Promote the currently missing Control Hípico Platform 2 capabilities onto the current `main` without importing historical branch drift: Agent/Shadow automation, Command Center, and AnyDoc/Archify PDF automation.

## Baseline
- Authority branch: `main`.
- Frozen baseline for this update: `6c81a5bec07dbdfd1003cc40d9477ce7c7432d26`.
- Isolated promotion branch: `integration/hipico-update-1-promotion`.

## Architecture
Use `main` as the only authority for files that already exist. Import only missing capability modules from their reviewed recovery branches. Shared integration points are merged semantically rather than copied wholesale.

### Overlay A — Agent/Shadow
Promote the deterministic-first agent engine, promotion policy, persistence, routes, tests, golden corpus, migration and ADR. Preserve invariants: no raw SQL/shell/admin tools, no LLM direct DB writes, no monetary authority, SOURCE remains shadow/read-only.

### Overlay B — Command Center
Promote the canonical read model, authenticated BFF and PWA shell/state UI. Preserve `no-store`, fail-visible unavailable/degraded states, SOURCE read-only and LAB QA semantics, and no internal operator token in the browser.

### Overlay C — AnyDoc/Archify/PDF automation
Promote local-first AnyDoc 0.2.4 extraction, Bridge binary document ingress, durable bounded spool, automatic PDF capture for new SOURCE messages only, Archify tooling/diagrams/runbook, and Hípico-specific agent/risk gates. Hosted OCR remains explicit opt-in only and `financialAuthority=false` remains absolute.

## Merge rules
1. Do not replace entire historical directories.
2. Existing `main` files win unless a missing capability requires a narrow semantic edit.
3. No force-push to `main`.
4. PR merge must use expected HEAD SHA.
5. Exact-SHA evidence is required for claims; jobs with no runner/steps are BLOCKED_INFRASTRUCTURE, not PASS.
6. #119 physical QA and #120 soak remain open until real evidence exists.

## Verification
- Diff inventory and ancestry against final `main`.
- Type/source contract verification where runnable.
- Hípico backend/source tests and deterministic 2000 scenario campaign where runnable.
- Bridge tests, build, Vercel preview and GitHub Actions exact-SHA when available.
- Security review: SOURCE write path, owner/authority injection, secrets, hosted OCR, SSRF, replay/idempotency.

## Rollback
The promotion is one isolated PR. Rollback is the merge revert; migrations remain additive and historical evidence is never dropped automatically.
