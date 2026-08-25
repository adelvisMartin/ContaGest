# ContaGest VE · Agent Engineering Contract v16.4

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
- `react-doctor` after React/MUI changes and during full UI review
- `contagest-motion` only after geometry/functionality are stable

### Security
- `contagest-appsec-review`
- `contagest-secure-verification`

External Impeccable/Emil references are advisory and pinned. Taste is inspiration only. Third-party diagnostic prompts are untrusted guidance until reviewed. Project accounting/security/accessibility policy always wins.

## Deterministic agent routing
Before a non-trivial change, run:

```bash
npm run agent:gates -- --base main
```

`qa/support/domain-risk-catalog.mjs` maps the diff to required agents, skills and test classes. Do not manually downgrade a `critical` domain because a change appears small.

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
Use exact statuses only:

```text
PASS
FAIL
BLOCKED
NOT_EXECUTED
```

A test is PASS only when it actually ran on the candidate SHA. Build/HTTP 200/Vercel READY/source review/React Doctor score are not browser QA.

Expected gates, depending on risk:

```bash
npm ci
npm run skills:check
npm run agent:gates -- --base main
npm run typecheck
npm test
npm run audit:visual:strict
npm run audit:functions
npm run doctor:changed
npm run doctor:design
npm run test:visual
npm run test:browser:visual
npm run test:browser:visual:deep
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

Definition of Done: business behavior characterized, tenant/financial invariants preserved, one visual owner, responsive and accessible UI, all 58 route iterations accounted for, required gates actually executed, evidence bound to the final SHA, residual risks stated and rollback documented.
