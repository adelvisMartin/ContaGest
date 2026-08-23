---
name: contagest-ui-audit
description: Senior ERP product-design, source-ownership, contrast, responsive and route-by-route audit for ContaGest visual contract v15.
---

# ContaGest UI Audit v15

This skill exists to prevent a technically valid ERP from looking like a collection of unrelated admin templates. It evaluates **function, information architecture, visual ownership and browser behavior together**.

External references such as Dribbble are research input only. Extract reusable patterns—density, hierarchy, navigation, calendar composition, active states, light/dark equivalence—not logos, assets or pixel copies.

## Visual research baseline

The v15 benchmark focuses on patterns repeatedly found in modern finance, SaaS, ERP and healthcare dashboards:

- calm collapsible sidebar instead of a long tree permanently expanded;
- strong but restrained selected state;
- account/profile and utility actions at the bottom;
- command/search entry available without navigating the complete menu;
- dark and light themes with the **same geometry**;
- neutral surfaces, 1px borders and minimal shadows;
- compact controls and typography suitable for hours of daily work;
- calendar/list-first appointment experiences instead of giant vertical forms;
- dense tables that remain readable and own their horizontal overflow.

The implementation source of truth is `docs/design-system/ERP_VISUAL_BENCHMARK_V15.md`.

## First rule: find the real visual owner

Before touching a selector inspect all author-style sources:

- `frontend/index.html` — zero global `<style>` blocks;
- `frontend/src/styles/erp-runtime.css` and its five imports;
- page markup / inline `style=`;
- MUI/React `sx` and theme overrides;
- component classes and pseudo-elements.

Never repair a cascade problem by stacking another global override. Delete or migrate the obsolete owner.

## Canonical authority

Exactly six CSS files may exist under `frontend/src/styles/`:

```text
contagest-visual-system-v12.css   # canonical v15 appearance; historical filename
shell-contract.css                # shell geometry
shell-stability-v1127.css         # interaction/z-index/overflow safety
runtime-primitives-v13.css        # low-level compatibility primitives
module-adapters.css               # narrow domain geometry
erp-runtime.css                   # deterministic entrypoint
```

`contagest-visual-system-v12.css` is the **final appearance authority**. No page-local CSS, Tailwind runtime, alternate theme, Precision Ledger layer, versioned hotfix or vertical mini-design-system may return.

## v15 visual contract

### Typography

- page title: **20–24 px**;
- section title: **15–17 px**;
- body/form: **12–13 px**;
- KPI: **16–20 px**;
- label/table metadata: **9–11 px**;
- monetary/document values: tabular numbers, nowrap where required and never `text-overflow: ellipsis`.

### Shell

- sidebar: **244 px**, collapsed rail **68 px**;
- topbar: **60 px** desktop / **54 px** mobile;
- primary routes visible first;
- only the active domain group expanded;
- profile + utilities at the bottom;
- one topbar only: route context, global search, primary operation, BCV utility, theme, user;
- mobile sidebar becomes a drawer.

### Light / Dark

Light:

```text
bg       #F4F5F7
surface  #FFFFFF
text     #17191D
brand    #5661E8
```

Dark:

```text
bg       #111214
surface  #181A1D
text     #F4F5F7
brand    #7C86FF
```

Theme changes **color only**, never layout dimensions or information order.

### Explicitly forbidden

- decorative gradients;
- glassmorphism / backdrop blur;
- giant icon circles or background blobs;
- 30–60 px operational KPI values;
- solid saturated sidebar blocks for every selected row;
- duplicated header/nav bars;
- UUIDs as visible human labels;
- hidden primary actions below unnecessary vertical whitespace;
- document-level horizontal scroll.

## Route-by-route design iteration

Every route in `qa/support/module-visual-catalog.mjs` must pass all six phases.

### A — Information architecture

Answer:
1. What is the page's primary job?
2. What is the primary action?
3. Which 3–6 pieces of information deserve first-viewport priority?
4. What belongs in secondary tabs, details or overflow?
5. Is any component present because of an old template rather than user need?

### B — Desktop 1440 / 1024

- first viewport exposes title/context + primary action;
- no giant dead zones;
- KPI cards are compact and values complete;
- forms use intentional columns rather than one huge vertical stack;
- tables are information-dense but not cramped;
- sidebar and topbar do not consume disproportionate space.

### C — Tablet 768

- two-column operational workspaces collapse intentionally;
- sidebar overlays rather than shrinking the content to unusable width;
- actions remain visible;
- table overflow has an explicit owner.

### D — Mobile 430 / 390 / 360

- `document.scrollWidth <= viewport`;
- actions wrap/full-width where needed;
- labels and values do not clip;
- currency and document identifiers remain readable;
- controls stay touch-usable;
- calendar/table/tab owners may scroll horizontally without moving the document.

### E — States and accessibility

Verify:

- empty / one / many;
- loading / error / disabled;
- long names / long RIF / large monetary values;
- keyboard navigation and visible focus;
- WCAG contrast for text and controls;
- `prefers-reduced-motion`.

### F — Functional proof and cleanup

Execute the real primary workflow. A beautiful dead form fails this phase. Remove superseded markup/style in the same change, then rerun source + browser gates.

## Route-family composition

### Dashboard / Analytics

Use a compact metric row, one primary data visualization, one operational action area, and lower-priority detail below. Never repeat a second global KPI strip from the shell.

### Sales / Purchases / Inventory / Banking / Accounting

Prefer toolbar + filters + dense table/workbench. Currency stays right-aligned/tabular. Posted or closed accounting artifacts are visually distinguished from editable drafts.

### Admin / RBAC / Settings

Use a dedicated settings/workspace pattern: navigation/context on the left or shell, content on the right, compact permission grids and explicit destructive-action hierarchy. Do not create another admin theme.

### Health / Veterinary / Psychology / Dentistry

Calendar/list and current operational context have priority over forms. Human/entity pickers display names/contact—not raw UUID. Create/edit appointment must have real service binding, visible failure and immediate agenda feedback.

### Gym / Nutrition / Routines

Member/trainer/routine context first; tabs own horizontal overflow. `cg-gym-*` remains a domain hook only, never a second design system.

### POS / Orders / Delivery

Touch targets are slightly larger where operational speed requires it. Cart/order state remains visible. Kanban owns its horizontal overflow.

## Source gates

```bash
npm run audit:visual:strict
npm run audit:functions:strict
npm run test:visual
```

## Browser evidence

```bash
npm run test:browser:visual
npm run test:browser:visual:deep
npm run test:browser:functional
```

Windows:

```powershell
.\QA-VISUAL-CONTAGEST.ps1
```

Only report `PASS`, `FAIL`, `BLOCKED` or `NOT_EXECUTED`. A Vercel build proves bundling/deployment viability; it does **not** substitute for rendered Playwright QA.
