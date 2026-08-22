# ContaGest VE · Agent Engineering Contract v14

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
`frontend/index.html` must contain **zero global `<style>` blocks**. A historical inline design system once survived CSS-file cleanup and overrode the canonical layered styles; the v14 audit now blocks that regression.

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
- no gradients/glass/decorative blobs in operational routes;
- no global dashboard KPI strip injected into every module;
- sidebar is mode-scoped: show primary work and the active domain, not the entire ERP as locked text;
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
- `contagest-motion` only after geometry/functionality are stable

### Security
- `contagest-appsec-review`
- `contagest-secure-verification`

External Impeccable/Emil references are advisory and pinned. Taste is inspiration only. Project accounting/security/accessibility policy always wins.

## Deterministic agent routing
Before a non-trivial change, run:

```bash
npm run agent:gates -- --base main
```

`qa/support/domain-risk-catalog.mjs` maps the diff to required agents, skills and test classes. Do not manually downgrade a `critical` domain because a change appears small.

## Functional audit
Every route registered in `pageRegistry` must exist in `qa/support/module-visual-catalog.mjs`. The current catalog contains 58 routes.

Run:

```bash
npm run audit:functions
npm run audit:visual:strict
```

The functional audit inventories, route by route: `render`, `mount`, forms, submit bindings, buttons, service methods, store writes, validation, feedback, destructive-operation signals and findings. A visible control without a real workflow is a defect even when the page renders.

Appointment modules must prove entity selection, human labels, date/time validation, create request, duplicate/conflict behavior, immediate agenda update, persistence after refresh and error feedback.

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

A test is PASS only when it actually ran on the candidate SHA. Build/HTTP 200/Vercel READY/source review are not browser QA.

Expected gates, depending on risk:

```bash
npm ci
npm run skills:check
npm run agent:gates -- --base main
npm run typecheck
npm test
npm run audit:visual:strict
npm run audit:functions
npm run test:visual
npm run test:browser:visual
npm run test:browser:visual:deep
npm run test:browser:functional
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

Definition of Done: business behavior characterized, tenant/financial invariants preserved, one visual owner, responsive and accessible UI, required gates actually executed, evidence bound to the final SHA, residual risks stated and rollback documented.
