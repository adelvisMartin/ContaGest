---
name: contagest-ui-audit
description: Senior ERP UI/UX, source-ownership, cascade and responsive audit for ContaGest using the canonical v13 visual contract.
---

# ContaGest UI Audit

Use Impeccable for systematic critique, typography, spacing, responsive, hierarchy and hardening. Use Taste only to challenge generic template output; never copy another product's brand. Use Emil/motion references only after layout, ownership and accessibility are correct.

## Canonical authority

`frontend/src/styles/` is a controlled directory. Exactly these files may exist:

```text
contagest-visual-system-v12.css
erp-runtime.css
module-adapters.css
runtime-primitives-v13.css
shell-contract.css
shell-stability-v1127.css
```

`app.js` imports only `erp-runtime.css`. The runtime imports only the other five pillars. No page-local CSS, legacy folder, compatibility shim, Tailwind runtime, Precision Ledger stylesheet, retired theme stylesheet, versioned responsive hotfix or extra shell/header file is permitted.

Shared visual decisions belong to `contagest-visual-system-v12.css` and `components/ui/`. Reusable low-level compatibility/layout belongs to `runtime-primitives-v13.css`. Genuine domain geometry belongs to `module-adapters.css` and must consume only `--cg-v-*` tokens.

## Source audit is the first iteration

Run:

```bash
npm run audit:visual
```

Before making a fix, use the generated report to answer:

- Which file currently owns the bad selector?
- Is the problem primitive/shared, shell-specific or genuinely domain-specific?
- Is an old declaration still present when it should be deleted?
- Is there a page-local `<style>`, CSS import, inline geometry, hardcoded color/size or fixed width?
- Does the route exist in `qa/support/module-visual-catalog.mjs`?
- Does a table/kanban own its overflow instead of the document?

After the fix run:

```bash
npm run audit:visual:strict
```

Never solve a cascade bug by adding another global override before identifying ownership.

## Print-only exception

Accounting/export helpers may generate standalone HTML for printing. Their CSS is not runtime UI and must be marked explicitly:

```html
<style data-cg-print-only>...</style>
```

The source auditor removes only these marked blocks before evaluating runtime `<style>`, font sizes, colors, widths and positioning. Do not use `data-cg-print-only` on markup rendered in the application.

## Required six-iteration cycle for every route

### A — Source/ownership

- confirm pageRegistry ↔ QA catalog parity;
- inspect UI kit adoption;
- find raw tables/forms/buttons, embedded styles, inline geometry and local CSS;
- identify duplicate functional/visual implementations;
- inspect exact selector/token collisions;
- delete superseded CSS instead of quarantining it indefinitely.

### B — Desktop 1440/1024

- operational title/actions fit first viewport;
- KPI values remain compact, one-line and tabular;
- cards use one density/radius vocabulary;
- flex/grid children use `min-width:0`;
- dense tables own horizontal scroll;
- actions/fields do not overlap;
- no decorative pseudo-element or hero competes with data.

### C — Tablet 768

- operational two-column layouts collapse when needed;
- sidebar overlays rather than shrinking content;
- table actions remain reachable;
- forms avoid unusably narrow columns;
- charts/progress/metric grids remain readable.

### D — Mobile 430/390/360

- document `scrollWidth <= clientWidth`;
- monetary values do not wrap;
- primary actions wrap/full-width instead of clipping;
- touch targets are usable;
- tables/tabs/kanban are the only intentional horizontal scrollers;
- no header, support widget, drawer or floating action covers required content.

### E — Theme/state/accessibility

- only `light` and `dark` exist globally;
- theme changes color, never geometry;
- test empty/one/many, long text/amounts, loading/error/disabled;
- focus-visible and keyboard reachability remain intact;
- reduced motion is respected.

### F — Cleanup/regression

- remove old selector/file in the same change;
- rerun strict source audit;
- rerun static visual contracts;
- run base Playwright matrix;
- run deep matrix for all routes and all critical phone widths;
- capture screenshot evidence on failure;
- do not call browser PASS unless that run actually executed.

## Critical migration invariants

### Contabilidad / Libro Diario

- uses `PageHeader`, `MetricGrid`, `Section`, canonical fields/buttons/table;
- print HTML is isolated with `data-cg-print-only`;
- VES/USD and Debe/Haber remain tabular, nowrap and auditable;
- preview/table scroll is owned locally.

### Admin / RBAC

- permissions, editable tables and demo/licensing forms cannot create another component scale;
- domain classes are scoped through `module-adapters.css`;
- checkbox grids collapse safely and action controls stay reachable at 360 px;
- destructive and irreversible actions retain clear visual hierarchy.

### Salud / Veterinaria

- `HealthcarePage` is human-only;
- `veterinaria` resolves only to `VeterinaryClinicPageV1123.jsx`;
- never reintroduce `animal ?`, `kind:'animal'` or `careImmunizationForm` into Healthcare;
- MUI veterinary geometry must align with the shared shell/tokens.

### Fitness / Gym

- `cg-gym-*` names may identify domain widgets but may not define an independent design system;
- all geometry/colors come from `module-adapters.css` + `--cg-v-*`;
- tabs own horizontal scroll; cards/forms use canonical density;
- member, trainer, routine and nutrition flows must fit at 360 px without document overflow.

## Anti-template standard

The ERP is information-first. Prefer useful tenant/context, statuses, tailored empty states, dense aligned tables and clear actions over gradients, glass, giant counters, circles/blobs, oversized icon bubbles, landing-page headlines or decorative illustrations.

## Evidence gates

```bash
npm run audit:visual:strict
npm run test:visual
npm run test:browser:visual
npm run test:browser:visual:deep
```

Windows:

```powershell
.\QA-VISUAL-CONTAGEST.ps1
```

Report only `PASS`, `FAIL`, `BLOCKED` or `NOT EXECUTED`. A source gate or build cannot substitute for Playwright browser evidence.
