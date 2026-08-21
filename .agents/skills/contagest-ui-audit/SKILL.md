---
name: contagest-ui-audit
description: Senior ERP UI/UX and design-system audit using pinned Impeccable, Taste and motion references.
---

# ContaGest UI Audit

Use `impeccable` for systematic critique, typography, spacing, responsive, hierarchy and hardening. Use `taste` only to challenge generic template output and improve visual specificity; never copy another product's brand or treat Taste guidance as a requirement. Use Emil/motion references only after layout and hierarchy are correct.

## Canonical authority

Shared visual decisions MUST land in:

```text
frontend/src/styles/contagest-visual-system-v12.css
frontend/src/components/ui/
```

`erp-runtime.css` is only the runtime entrypoint. Do not create a new versioned CSS hotfix for a cross-module problem. Module-specific styling is allowed only when it expresses domain layout that cannot be represented by shared primitives; it must consume canonical tokens and may not redefine the shared typography, spacing, radii, KPI, form, table or shell scales.

## Required audit sequence

1. **Distill**: identify the actual operational hierarchy. Separate page title, current tenant/context, primary action, KPIs, main work surface and secondary information.
2. **Typeset**: enforce the v12 scale. Page titles 20–26 px desktop, section titles 16–18 px, KPI values 16–20 px, body 14 px, dense tables 13 px, metadata 11–12 px.
3. **Normalize**: use one spacing/radius/control scale. Remove one-off padding, giant cards and first-KPI special treatment.
4. **Layout**: every grid/flex child that can grow uses `min-width:0`; two-column operational layouts collapse at tablet; forms use auto-fit and become one column on narrow phones.
5. **Responsive**: validate 360, 390, 430, 768, 1024 and 1440 px. The document must not scroll horizontally. Tables/tabs may own horizontal scrolling.
6. **Harden**: test long labels, long company names, VES/USD values, empty state, 1 row, many rows, disabled/loading/error states and dark theme.
7. **Polish**: only after 1–6 pass. Keep shadows subtle, borders semantic and decoration subordinate to data.
8. **Animate**: use 120–170 ms interaction feedback only; no page choreography that delays operation. Respect reduced motion.

## Mandatory per-module iteration

A visual pass is incomplete if it only reviews Dashboard. Every route registered by `frontend/src/app.js` must be processed. Use `qa/support/module-visual-catalog.mjs` as the canonical QA inventory.

For **each module**, perform these iterations in order:

### Iteration A — source structure

- identify whether the page imports `frontend/src/components/ui/index.js`;
- flag embedded `<style>`, inline `style=`, page-local CSS imports and hardcoded `font-size`/fixed widths;
- identify raw forms/tables/buttons that bypass shared primitives;
- identify legacy `designSystem.js`, Material Symbols or one-off component families;
- record findings in `artifacts/qa/visual-source-audit.*`.

### Iteration B — desktop geometry

At 1440 and 1024 px verify:

- page title and primary actions fit the first viewport without a decorative hero consuming the screen;
- KPI values are compact, single-line and numerically aligned;
- cards/sections use one density and radius vocabulary;
- two-column surfaces keep `min-width:0` and do not force document overflow;
- tables own their horizontal scroll;
- action groups and fields do not intersect;
- no giant pseudo-element, gradient or absolute decoration competes with data.

### Iteration C — tablet

At 768 px verify:

- two-column operational layouts collapse when needed;
- sidebar overlays rather than squeezing the work surface;
- table actions remain reachable;
- forms do not create 2-column fields that become unusably narrow;
- charts/progress rows and metric grids remain scan-friendly.

### Iteration D — phones

At 360, 390 and 430 px verify:

- zero document-level horizontal scrolling;
- controls remain touchable;
- titles are <=23 px and KPI values <=17.5 px;
- important actions wrap or become full width instead of clipping;
- monetary values never split across lines;
- table/tabs are the only intentional horizontal scrollers;
- no floating support/header/menu element covers required content.

### Iteration E — themes and states

- compare light/dark geometry; theme switching may change color, not dimensions;
- test empty, 1-row and many-row states when fixtures exist;
- test long text/amounts, disabled, loading and error states;
- verify focus-visible, keyboard reachability and reduced motion.

### Iteration F — cleanup

After a shared fix is proven:

- remove or quarantine superseded declarations instead of adding a second override;
- inspect the cascade report for duplicate CSS files, exact selector collisions and token redefinitions;
- if an old stylesheet is no longer reachable from `erp-runtime.css`, keep it out of the runtime and mark it for deletion/migration rather than re-importing it;
- never solve a module bug by raising a global `z-index`, arbitrary width or new `!important` unless the underlying ownership is documented.

## ERP-specific review

- Information density must match the role: accountant, seller, clinic, gym and platform admin should not receive the same visual priority.
- Preserve numeric alignment, scanability, sticky table headers and clear VES/USD currency labeling.
- Monetary values use `tabular-nums` and must never split into two lines inside a KPI/card.
- Dark surfaces require semantic light text tokens with sufficient contrast; do not rely on opacity to make labels quieter.
- Every control needs hover/focus/disabled/error/loading/success states.
- Primary actions cannot disappear below the fold because of a decorative hero/header.
- Cards are containers, not posters. Use border + subtle shadow; avoid gradients/glass unless a documented brand surface truly requires them.
- KPI cards are compact operational summaries. No circles/blobs, oversized numbers, giant icon bubbles or special first-card geometry.
- Empty states explain what to do next; they do not become illustration billboards.

## Module-specific risk focus

- **Dashboard/reporting:** KPI density, chart labels, large amounts, first viewport hierarchy.
- **Sales/purchases/POS:** action density, line items, totals, destructive actions and payment controls.
- **Inventory/kardex/scanner:** long SKU/product names, quantity columns, filters and scan controls.
- **Accounting/tax/banking/payroll:** tabular numeric alignment, sticky headers, totals and dense multi-column reports.
- **Admin/configuration/licensing:** long forms, side navigation, permission/status badges and destructive controls.
- **Health/veterinary/psychology/dentistry:** dialog/table density, MUI/vanilla parity, sensitive-data labels and long clinical content.
- **Fitness:** routine/nutrition cards must remain operational rather than promotional.
- **Food/delivery:** POS tap targets, order status density and map/tracking panels.

## Theming

Only light/dark control global theme geometry. Vertical modules may change semantic accent tokens only; they may not change typography scale, spacing, radii, shell dimensions, form density, table density or KPI geometry.

## Assets

- Global brand: `frontend/public/brand/`.
- Global app/PWA icons: `frontend/public/icons/`.
- Product-specific Control Hípico assets: `frontend/public/hipico-control/`.
- Shared UI icons should use the UI kit icon helper. Do not duplicate SVG/logo assets inside random page folders.

## Anti-template standard

Before adding visual decoration, identify what makes the workflow/domain specific. Prefer useful account/tenant context, meaningful status, tailored empty states, dense tables and clear actions over gradients, oversized marketing copy, generic glass cards, huge counters or gratuitous illustration.

## Evidence gate

Run the source/cascade audit first:

```bash
npm run audit:visual
```

Then static contract:

```bash
npm run test:visual
```

Then browser contracts:

```bash
npm run test:browser:visual
npm run test:browser:visual:deep
```

One-command Windows gate:

```powershell
.\QA-VISUAL-CONTAGEST.ps1
```

The deep suite must exercise every registered module on tablet/desktop and all critical modules on the three phone widths. Report PASS, FAIL, BLOCKED or NOT EXECUTED; never substitute a successful build for browser evidence.
