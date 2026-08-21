---
name: contagest-ui-audit
description: Senior ERP UI/UX, source-ownership, shell, contrast, responsive and route-by-route audit for the canonical v14 visual contract.
---

# ContaGest UI Audit v14

Use Impeccable for systematic critique, typography, spacing, hierarchy, responsive and hardening. Use Taste to challenge generic output, never to copy a brand. Use Emil only after layout/functionality are stable. Screenshot/Dribbble references are direction for density, information hierarchy and interaction patterns—not pixel-copy instructions.

## First rule: find the actual visual owner
Before touching a selector inspect **all** author-style sources:

- `frontend/index.html` — must contain zero global `<style>` blocks;
- `frontend/src/styles/erp-runtime.css` and its five imports;
- page markup/inline `style=`;
- MUI/React `sx`/theme overrides;
- component classes and pseudo-elements.

A previous audit removed historical CSS files but missed a large inline design system in `index.html`; that unlayered CSS could still dominate the canonical layers. v14 treats document-head CSS as part of the cascade and blocks its return.

## Canonical authority
Exactly six CSS files may exist in `frontend/src/styles/`:

```text
contagest-visual-system-v12.css
erp-runtime.css
module-adapters.css
runtime-primitives-v13.css
shell-contract.css
shell-stability-v1127.css
```

`contagest-visual-system-v12.css` is the appearance authority despite the historical filename. `shell-contract.css` owns geometry only. `shell-stability-v1127.css` owns interaction/z-index/overflow only. `module-adapters.css` owns narrow domain geometry only and consumes `--cg-v-*` tokens.

## Visual direction
Operational ERP, not landing page:
- neutral surfaces and high information density;
- dark mode near-black/graphite, not blue gradient;
- light mode is the same geometry with daylight tokens;
- compact sidebar with primary routes and active domain groups;
- no global KPI strip repeated on every route;
- no gradients, glass, giant icon circles, decorative blobs or billboard counters;
- one type scale: page 20–25, section 16–18, body 12–14, KPI 14–18;
- numerical values never ellipsized; use tabular numbers, adequate width and controlled scaling;
- human-readable select labels; UUIDs/technical IDs never replace names unless there is genuinely no display identity.

## Source iteration
Run:

```bash
npm run audit:visual
npm run audit:functions
```

For each route answer:
1. Which file/component owns the layout?
2. Which stylesheet/layer owns each shared selector?
3. Is there hidden/global CSS in `index.html`, page code or MUI?
4. Does every form have a real submit path?
5. Does every visible action have a handler/delegation owner?
6. What service/API does the primary workflow call?
7. What happens on empty/loading/error/duplicate/permission failure?
8. Is there a browser test for the actual user action?

## Six visual iterations per route
### A Source/ownership
Delete superseded declarations; do not stack overrides. Check duplicated components, CSS, routes and frameworks.

### B Desktop 1440/1024
First viewport must expose context and primary action. Header/sidebar cannot consume disproportionate space. Cards use the same density/radius. Long amounts and RIF/document values remain complete.

### C Tablet 768
Collapse operational grids intentionally. Sidebar overlays. Filters/actions remain reachable. Tables own horizontal scroll.

### D Mobile 430/390/360
`document.scrollWidth <= viewport`. No clipped buttons, labels or cards. Monetary values do not wrap. Actions wrap/full-width. Touch controls remain usable.

### E Theme/state/a11y
Light/Dark change color only. Verify contrast, focus, keyboard, empty/one/many, loading/error/disabled and reduced motion.

### F Functional + cleanup
Run the route’s primary interaction, remove old code in the same change, then rerun source audit + contracts + Playwright.

## Appointment UX contract
For Health/Veterinary/Psychology/Dentistry:
- patient/entity picker shows a real name/contact, not UUID;
- date, time, duration and modality fit without a giant vertical card;
- submit action is visible without needless scrolling on normal desktop;
- create request is executed and failure is visible;
- exact duplicate/conflict is handled;
- successful appointment appears immediately in agenda/calendar;
- agenda is calendar/list oriented and owns its mobile horizontal scroll;
- confirmation integrations are secondary actions, not visual noise.

## Shell contract
The sidebar should behave like a professional tool:
- primary routes first;
- domain groups collapsed except active group;
- no tier-dot noise or hundreds of locked rows;
- account/profile at bottom;
- collapsed desktop rail retains useful primary icons;
- mobile becomes a drawer;
- one topbar: route context, search, rate utility, theme, user;
- no duplicate logo/brand and no second quick-navigation strip.

## Print-only exception
Standalone print/export HTML may embed CSS only as:

```html
<style data-cg-print-only>...</style>
```

The audit removes those blocks from runtime analysis. Never use the marker to hide application UI CSS.

## Evidence gates

```bash
npm run audit:visual:strict
npm run audit:functions
npm run test:visual
npm run test:browser:visual
npm run test:browser:visual:deep
npm run test:browser:functional
```

Windows:

```powershell
.\QA-VISUAL-CONTAGEST.ps1
```

Only report `PASS`, `FAIL`, `BLOCKED` or `NOT_EXECUTED`. A source/build result does not substitute for browser evidence.
