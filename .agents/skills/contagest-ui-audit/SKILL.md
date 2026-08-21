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

`erp-runtime.css` is only the runtime entrypoint. Do not create a new versioned CSS hotfix for a cross-module problem.

## Required audit sequence

1. **Distill**: identify the actual operational hierarchy. Separate page title, current tenant/context, primary action, KPIs, main work surface and secondary information.
2. **Typeset**: enforce the v12 scale. Page titles 20–26 px desktop, section titles 16–18 px, KPI values 16–20 px, body 14 px, dense tables 13 px, metadata 11–12 px.
3. **Normalize**: use one spacing/radius/control scale. Remove one-off padding, giant cards and first-KPI special treatment.
4. **Layout**: every grid/flex child that can grow uses `min-width:0`; two-column operational layouts collapse at tablet; forms use auto-fit and become one column on narrow phones.
5. **Responsive**: validate 360, 390, 430, 768, 1024 and 1440 px. The document must not scroll horizontally. Tables/tabs may own horizontal scrolling.
6. **Harden**: test long labels, long company names, VES/USD values, empty state, 1 row, many rows, disabled/loading/error states and dark theme.
7. **Polish**: only after 1–6 pass. Keep shadows subtle, borders semantic and decoration subordinate to data.
8. **Animate**: use 120–170 ms interaction feedback only; no page choreography that delays operation. Respect reduced motion.

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

Static contract:

```bash
npm test
```

Browser contract:

```bash
npm run test:browser
```

At minimum the responsive-all-routes and visual-system-v12 suites must execute for visual release claims. Report PASS, FAIL, BLOCKED or NOT EXECUTED; never substitute a successful build for browser evidence.
