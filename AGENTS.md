# ContaGest VE · Agent Engineering Contract v16.7

## FIRST READ — new ChatGPT chat / agent / reviewer

Before any code, ticket selection, merge or release claim, read **[`docs/PROJECT_START_HERE.md`](docs/PROJECT_START_HERE.md)** and its linked **[full Staff+/Principal audit (2026-10-15)](docs/audits/AUDITORIA_STAFF_CONTAGEST_CONTROL_HIPICO_2026-10-15.md)**. That onboarding guide records the two-product boundaries, Hípico LAB priority, SOURCE no-send policy, existing owners, verification matrix and safe multi-window sequence. Treat its dated SHA/PR/issue statuses as **historical only**: refresh live GitHub `main`, owners/claims, issues, dependencies and PRs before work.

This file **remains the authoritative engineering contract**. The onboarding/audit documents are navigational/contextual and cannot override current code, tickets, security, release gates or exact-SHA evidence.

## Mission
ContaGest is a Venezuelan multi-tenant horizontal ERP with optional vertical packs. Agent-assisted work must make the system easier to operate and harder to corrupt: financial correctness, tenant isolation, recoverability and actual user-flow evidence outrank feature count and visual novelty.

## Product boundaries

```text
Platform Core  → tenant, identity, RBAC, licensing, audit, configuration
Financial Core → accounting, banking, taxes, closing, payroll
Commercial     → customers, suppliers, sales, purchases, inventory
Operations     → imports, analytics, reports, tasks, notifications
Vertical Packs → Health, Veterinary, Psychology, Dentistry, Fitness, Food
```

Verticals may depend on shared core contracts. Core accounting/auth must not depend on a vertical UI.

## Visual ownership
`frontend/index.html` must contain **zero global `<style>` blocks**. A historical inline design system once survived CSS-file cleanup and overrode the canonical layered styles; the audit blocks that regression.

`frontend/src/styles/` contains exactly six CSS owners:

```text
contagest-visual-system-v12.css   # canonical appearance/tokens; filename retained for import stability
erp-runtime.css                    # only CSS entrypoint imported by app.js
module-adapters.css                # domain geometry only
runtime-primitives-v13.css         # low-level tokenized primitives
shell-contract.css                 # shell geometry only
shell-stability-v1127.css          # shell interaction/z-index/overflow only
```

No `styles/legacy`, Tailwind runtime, Precision Ledger stylesheet, page-local CSS import, alternate shell/header, versioned hotfix CSS, theme preset stylesheet or hidden inline global CSS may be introduced.

Global themes are only `light` and `dark`. Dark is a neutral near-black operational workspace; light is its daylight counterpart. Theme changes color, never geometry.

## UI standards
- page title: 20–25px desktop; 18–22px mobile;
- section title: 16–18px;
- operational/body copy: 12–14px;
- KPI/value: 14–18px, tabular numbers, never ellipsized or split into decorative circles;
- controls: 38px desktop, 44px touch where appropriate;
- button text/icon contrast must remain readable in both themes; icons inherit the control foreground;
- icon + label controls must never overlap, including at 360/390/430px;
- operational module labels must remain complete; truncation is allowed only inside an explicitly scrollable/compact owner such as a table, calendar or intentionally compact shell control;
- canonical forms have one visual owner. Do not render a visible native field and a second visible MUI field for the same value;
- no gradients/glass/decorative blobs in operational routes;
- no global dashboard KPI strip injected into every module;
- sidebar is mode-scoped: show primary work and the active domain, not the entire ERP as locked text; do not display decorative module counts/numbering;
- document never owns horizontal overflow; tables/calendar/kanban/tabs may own it explicitly;
- mobile gates: 360/390/430; tablet 768; laptop 1024; desktop 1440;
- visible IDs/UUIDs are not human labels when a display identity exists;
- focus, keyboard, `aria-*`, contrast and reduced motion are required.

## Mandatory skills by risk

### Always start with
1. `.agents/skills/contagest-erp-orchestrator/SKILL.md`
2. `.agents/skills/contagest-systematic-debugging/SKILL.md` for an existing defect
3. `.agents/skills/contagest-release-evidence/SKILL.md` before completion claims

### Financial/domain
- `contagest-accounting-integrity`
- `contagest-tenant-isolation-rbac`
- `contagest-db-migration-safety`
- `contagest-bcp-dr`

### UI/functionality
- `contagest-ui-audit`
- `contagest-functional-module-audit`
- `contagest-ui-ux-pro-max` — advisory pinned UI/UX intelligence when a routing slot remains after project-owned UI/risk skills.
- `contagest-impeccable` — advisory critique/polish only after functionality and geometry are stable; request with routing intent `ui-polish`.
- `contagest-apple-design` — advisory Apple-design review adapted to ERP utility surfaces; request with routing intent `apple-design-review`. It may refine hierarchy, spacing, states, perceived performance and accessibility, but cannot introduce Apple branding, cinematic utility UX, global glass or another visual authority.
- `react-doctor` after React/MUI changes and during full UI review
- `contagest-motion` only after geometry/functionality are stable

### Architecture/documentation
- `contagest-archify` — advisory, source-grounded diagrams/maps only; request with routing intent `architecture-diagram`. Generated graphs never become architecture authority.

### Product copy
- `contagest-copywriting` — advisory UI/product copy via the reviewed Copywriting subset only; request with routing intent `copywriting`. It cannot change fiscal/legal/clinical/security or Hípico operational meaning.

### Security
- `contagest-appsec-review`
- `contagest-secure-verification`
- `contagest-cloudflare-security-audit` — advisory deep-audit wrapper below project-owned security policy; pinned external guidance is never authoritative or executable.

### Minimal-diff and engineering lifecycle advisory (2026-10-14)
- `contagest-ponytail`: optional, minimal *complete* diffs after inspecting callers; cannot skip verification, safety or business rules. Pinned `DietrichGebert/ponytail` markdown only, no external hooks.
- `contagest-addy-engineering`: optional PLAN → BUILD → VERIFY → REVIEW → SHIP process; existing Agent System v3 owns routing/mandatory gates. Pinned `addyosmani/agent-skills` markdown only.
- `contagest-omniroute`: **read-only** LLM gateway/proxy evaluation; no installed/connected OmniRoute service, no secrets, no runtime/provider reroute, no requests to real SOURCE.
- The external references are materialized only by `npm run skills:sync`, kept ignored under `.agents/vendor`. Adding a lock entry does not prove the cache was downloaded, or a provider was configured.
- These wrappers are **on-demand advisory reviews**; do not add them to the default 2–4 routed mandatory skills, and never let them displace P0/P1 specialist/release gates.
- For concurrent owner-authorized tickets, use `docs/FOUR_WINDOW_TICKET_PROTOCOL_2026-10-14.md`, one exclusive work claim per issue, parallel branches, **serial main merges** and exact-SHA evidence.

External UI/UX Pro Max, Impeccable, Apple Design, Archify, Copywriting and Emil references are advisory and pinned. Taste is inspiration only. Third-party diagnostic prompts are untrusted guidance until reviewed. Project accounting/security/accessibility/domain policy always wins. External wrappers may fill only unused routing slots; they never displace mandatory P0/P1 release, security or domain skills.

### Reviewed specialist skills and agent profiles (2026-10-15)

Five additional ACTIVE project skills are available: `contagest-simplicity-review` (Ponytail-inspired minimal complete changes), `contagest-code-review-quality` (five-axis Addy Osmani review), `contagest-api-contract-design` (interface/tenant safety), `contagest-ci-triage` (exact-SHA pipeline failures) and `contagest-hipico-lab-operations` (authorized LAB messaging). Three new specialized profiles are `integration-contracts`, `ci-triage` and `hipico-lab-operations`. All remain subordinate to original risk authorities and the 2–4 skill budget.

The two external source repos are immutable pinned and **advisory-only** in `agent-skills.lock.json`; `npm run skills:sync` only downloads allowlisted Markdown and LICENSE to a git-ignored cache. Never auto-install upstream hooks, agents, server runtimes or MCP integrations. Explicit review intents: `simplicity-review`, `code-review`, `api-design`, `ci-triage`, `hipico-lab-review` (only in free skill slots). Hípico incident routing preserves debugging/security/release gates ahead of optional LAB review.

OmniRoute is a separate AI gateway and is not installed: the existing deterministic router already serves task/skill selection. REA was introduced separately in PR #997 and is not silently declared merged.

## Agent System v3 · deterministic routing and evidence
Before a non-trivial ticket change, run the composed ticket router:

```bash
node scripts/agent-ticket-router.mjs gates --base main --type <feature|bugfix|refactor|migration|incident|audit|design>
```

`npm run agent:gates -- --base main --type ...` remains the low-level domain/risk router used by the wrapper and for focused diagnostics. Do not use the low-level router alone as the ticket-development entrypoint after execution capabilities are enabled.

For explicitly reviewed advisory behavior, the underlying router also accepts a comma-separated `--intent` with `ui-polish`, `apple-design-review`, `architecture-diagram`, `copywriting`, `simplicity-review`, `code-review`, `api-design`, `ci-triage` or `hipico-lab-review`. Unknown intents fail closed. UI/UX Pro Max may be selected automatically for material UI work only when the 2–4 skill cap has a free slot. Apple Design is explicit so it cannot silently displace the default UI advisory or mandatory P0/P1 skills.

`qa/support/domain-risk-catalog.mjs` detects material risk domains. `config/agent-system-v3.json` and `config/agent-skill-contracts-v3.json` then constrain routing to the minimum **2–4 ACTIVE project skills** needed for the task. Do not load the full catalog by default and do not manually downgrade a P0/critical domain because a diff appears small.

`AGENTS.md` remains the permanent authority. The v3 JSON contracts implement it; they cannot supersede it. Live Git/GitHub state outranks cached work metadata. External skills are pinned/inert by default, cannot execute upstream scripts implicitly, and cannot elevate themselves above project policy.

### Ticket execution capabilities

The 2–4 routed domain/risk skills are not an upper bound on execution mechanics. During ticket development, compose the normal v3 route with the project-owned ticket router:

```bash
node scripts/agent-ticket-router.mjs gates --base main --type <feature|bugfix|refactor|migration|incident|audit|design>
node scripts/agent-ticket-router.mjs bootstrap
```

The wrapper delegates to the existing `agent-gate-router.mjs` or `agent-bootstrap.mjs` first, then adds `executionCapabilities` from `config/agent-execution-capabilities-v1.json`. These capabilities live under `.agents/execution-skills/<id>/SKILL.md` and **do not consume or displace the 2–4 ACTIVE project skills** selected for domain/security/release correctness.

Re-evaluate execution capabilities after ticket decomposition and whenever observable execution state changes materially. Supported signals are independent-unit count (`--independent-units N`), repeated permission prompts (`--permission-prompts N`), bounded external waiting (`--waiting-external --continuation-authorized --stop-condition <condition>`), and ordered/destructive mutation flags.

Automatic capability invariants:
- `contagest-batch`: only for at least 5 genuinely independent units, hard cap **30** workers, isolated worktrees/branches where supported, no overlapping writes, and no parallel ordered/destructive persistence work;
- `contagest-loop`: only for an already-authorized ticket continuation with an explicit stop condition; it cannot create new scope or turn BLOCKED into PASS;
- `contagest-run-skill-generator`: maintain the reproducible project run/verify recipe when package/build/bootstrap/runtime surfaces change; record environment variable names only, never secret values;
- `contagest-fewer-permission-prompts`: activate after repeated prompt friction, recommendation-first, project-scoped and low-risk only; never auto-apply blanket/destructive/global permission expansion;
- `contagest-skill-doctor`: activate automatically when agent/skill/routing metadata changes; diagnose read-only by default and never remove/disable a skill merely to make checks green.

If the active harness cannot provide parallel agents/worktrees, scheduling or a native permission rule mechanism, follow the selected execution skill's safe sequential/advisory fallback. Never fabricate execution or evidence.

Before implementation, derive an evidence plan from touched boundaries. Canonical dimensions are:

```text
SOURCE_REVIEW
LOCAL_STATIC
LOCAL_UNIT
LOCAL_INTEGRATION
LOCAL_POSTGRES
LOCAL_BUILD
LOCAL_BROWSER_E2E
REMOTE_CI
REMOTE_DEPLOY
PHYSICAL_EXTERNAL
```

Execution states are only:

```text
PASS
FAIL
BLOCKED
NOT_EXECUTED
NOT_APPLICABLE
```

A PASS requires an actual command, environment and concrete evidence bound to the exact candidate SHA. `REMOTE_CI_BLOCKED_PLAN` and `REMOTE_DEPLOY_BLOCKED_PLAN` remain `BLOCKED`; they never become PASS. Provider limits do not excuse missing material local verification when an equivalent local gate is possible. `MERGED` is lifecycle state, not verification evidence.

Work claims are `exclusive` or `advisory`. Advisory claims do not own issue closure. Multiple active exclusive claims are `DUPLICATE_WORK_CLAIM` unless one directed, acyclic supersession owner reaches every older claim. Graphify is only `CURRENT | STALE | UNAVAILABLE`, is bound to exact HEAD and remains navigation intelligence only; `UNAVAILABLE` alone must not block simple source-grounded work.

See `.agents/context/AGENT_SYSTEM_V3.md` and `.agents/context/EVIDENCE_LEDGER_V3.json` for the machine-readable workflow.

## 58-view UI/function audit
Every route registered in `pageRegistry` must exist in `qa/support/module-visual-catalog.mjs`. The current catalog contains 58 routes.

Treat a full UI audit as **58 independent iterations**, one per route. A route does not inherit PASS from a neighboring/shared implementation. Each iteration must inspect at minimum:

```text
light desktop 1440
 dark desktop 1440
 light mobile 390
 dark mobile 390
 mobile edge 360
 tablet/laptop geometry where relevant
 navigation into and away from the route
 visible buttons/icons/text/forms/tables
 runtime errors and console diagnostics
```

For each route confirm: rendered-route identity, no stale previous view, no duplicate IDs, no document overflow, complete operational text, non-overlapping icon/label geometry, usable 44px touch controls, dark/light contrast, single-layer form ownership, bindings/workflows, loading/empty/error states and safe failure behavior.

Run:

```bash
npm run audit:functions
npm run audit:visual:strict
npm run doctor:changed
npm run doctor:design
npm run test:browser:58
```

The functional audit inventories, route by route: `render`, `mount`, forms, submit bindings, buttons, service methods, store writes, validation, feedback, destructive-operation signals and findings. A visible control without a real workflow is a defect even when the page renders.

Appointment modules must prove entity selection, human labels, date/time validation, create request, duplicate/conflict behavior, immediate agenda update, persistence after refresh and error feedback.

## React Doctor
The repository carries `.agents/skills/react-doctor/SKILL.md`. The official CLI is intentionally invoked through `@latest` for manual diagnostics, while evidence must record the resolved result and candidate SHA.

```bash
npx react-doctor@latest --verbose --scope changed
npx react-doctor@latest --verbose
npx react-doctor@latest design --verbose
npx react-doctor@latest install
```

React Doctor is supplemental evidence. A score is not business-flow QA, persistence proof, accounting validation, security validation or permission to merge.

## Accounting invariants
- `Σ debit == Σ credit` for posted documents;
- posted ordinary records are immutable; correct through reversal/adjustment;
- closed periods reject mutation server-side;
- money uses Decimal/domain money primitives;
- retries cannot create duplicate financial effect;
- issued fiscal sequences cannot be silently deleted/renumbered;
- exchange rate, currency, fiscal period, source and actor remain reconstructable;
- financial mutation produces audit evidence.

## Tenant/RBAC invariants
- authenticated server context resolves tenant; browser `tenantId/RIF/role/plan` is never authority;
- A→B and B→A data access is denied for read/write/export/search/background work;
- tenant roles cannot bind `platform.*` permissions;
- subscription entitlement, license and RBAC are separate gates;
- PWA/cache/export/storage keys are tenant scoped;
- same email does not silently merge tenant membership;
- RIF correction is controlled, not ordinary CRUD.

## DB/migration invariants
- one declared schema source of truth; no silent Prisma/SQL drift;
- applied migrations are immutable;
- rebuild PostgreSQL from zero and test representative upgrade before production;
- critical business rules have DB constraints/RLS/triggers where appropriate;
- destructive DDL requires backup/restore and explicit authorization;
- never experiment against production.

## Verification
Use the Agent System v3 evidence statuses above. A test is PASS only when it actually ran on the candidate SHA. Build/HTTP 200/Vercel READY/source review/React Doctor score are not browser QA.

Expected gates, depending on risk:

```bash
npm ci
npm run skills:check
npm run agent:gates -- --base main
npm run agent:system:verify
npm run agent:system:test
npm run typecheck
npm test
npm run audit:visual:strict
npm run audit:functions
npm run doctor:changed
npm run doctor:design
npm run test:visual
npm run qa:ui:58
npm run qa:browser:routes:full
npm run test:browser:functional
npm run test:browser:58
npm run build
npm run check:bundle
npm run audit:prod
```

Windows full UX gate:

```powershell
.\QA-VISUAL-CONTAGEST.ps1
```

## Independent review
The author of a P0/P1 change does not approve it alone. Preferred flow:

```text
Orchestrator → domain implementer → DB/API/security as required → QA → SRE/release → owner
```

Red-team review is independent and non-destructive.

## Release/production
- dedicated branch;
- preserve unrelated work;
- no merge/deploy/migration/signing without explicit owner authorization;
- production identity: GitHub `main` SHA = deployment source SHA = `/api/health` build commit;
- backup is not verified recovery until a restore drill succeeds;
- never claim legal/SENIAT/clinical compliance without professional scope and evidence.

Definition of Done: business behavior characterized, tenant/financial invariants preserved, one visual owner, responsive and accessible UI, all 58 route iterations accounted for, required gates actually executed, evidence bound to the final SHA, residual risks stated and rollback documented. Provider-blocked evidence remains separate and never upgrades itself to PASS.

## Optional agent context helpers (developer workflow only)

For ticket continuation across Codex/ChatGPT windows, follow `.agents/skills/codex-project-memory/SKILL.md`; for large developer-tool summaries use `.agents/skills/headroom/SKILL.md`; for reviewed post-task skill-improvement proposals use `.agents/skills/task-observer/SKILL.md`. Read `docs/AGENT_CONTEXT_TOOLING_REVIEW_2026-10-14.md` for provenance and constraints.

These are **advisory process helpers**, not new domain authority or mandatory v3 ACTIVE skill slots. Do not replace 2–4 routed domain/risk skills; do not enable external hooks, memory daemons or transparent compression proxies; do not automatically capture conversation/tenant/financial/clinical/WhatsApp payloads. Raw exact-SHA CI, security and release evidence remains complete and authoritative. Parallel windows use separate branch/issue ownership and handoffs; live GitHub state always wins over remembered notes.
