# Control Hípico UI System v4.1.3 — Authority and Visual Baselines

## Purpose

This release finishes the authority cleanup started in v4.1.2 without changing betting, balances, Supabase, WhatsApp domain rules or IndexedDB ownership.

## CSS authority

`frontend/public/hipico-control/assets/css/app.css` is now an import-only entrypoint. The order is intentional:

1. `ui-system-v3-compat.css` in the low-priority `legacy` cascade layer;
2. `ui-system-v4.css` as the semantic/token/component authority;
3. `ui-system-v4-convergence.css` for final shell, overlay, icon, floating-utility and reduced-motion convergence.

Product rules must not be added directly to `app.css`. This prevents a new high-specificity compatibility layer from growing around the canonical design system.

## Visual regression authority

The required reviewed baselines are declared in `qa/support/hipico-visual-baselines.mjs`. The baseline gate is:

```powershell
node scripts/hipico-visual-baseline-gate.mjs
```

If one or more reviewed PNGs are missing the command exits with `BASELINE_REQUIRED`.

To intentionally create/update baselines on a developer machine:

```powershell
node scripts/hipico-visual-baseline-gate.mjs --update
```

The update path is refused when `CI` is present. Baselines are review artifacts: CI may compare them but must never manufacture or auto-approve them.

## Required coverage

- dashboard, race, reports and settings at 1366px in light/dark;
- dashboard at 390px touch in light/dark;
- full-width shell, sidebar persistence, theme switching, density and legacy-brand absence remain behavioral assertions in Playwright.

## PWA

The service-worker shell is rotated to `r34-ui-v4-1-3-authority` and includes `ui-system-v4-convergence.css` so installed clients cannot keep an incomplete presentation layer offline.

## Verification classification

A missing browser runtime or missing reviewed PNG is `BASELINE_REQUIRED` / `NOT_EXECUTED`, never PASS. GitHub-hosted runner failures with no executed steps remain `BLOCKED_INFRASTRUCTURE`.
