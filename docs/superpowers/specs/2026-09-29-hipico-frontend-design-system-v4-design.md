# Control Hípico UI System v4 — Design Specification

**Date:** 2026-09-29  
**Status:** Proposed for implementation  
**Baseline:** `main@3295bdeb7add7b0962f549887287606f7448993d`  
**Branch:** `feat/hipico-ui-system-v4`  
**Scope:** Control Hípico PWA/APK frontend, design system, visual QA, Playwright/E2E and PWA cache delivery.  
**Out of scope:** financial rules, bet settlement, Supabase schemas, WhatsApp business logic, authorization contracts, persistence semantics.

## 1. Problem statement

Control Hípico currently has a canonical CSS layer, but the rendered product still reads as visually inconsistent and oversized in desktop contexts. The current implementation mixes a `14px` body baseline with `1rem` form controls, 40–42px desktop controls, a large wordmark splash, and a burgundy-heavy palette. Dark mode exists technically, but the control is not consistently discoverable and theme state is split between local device preference and workspace configuration.

The product also still renders the legacy `logo-control-hipico.png` wordmark from both the boot shell and `brandMarkup()`. This conflicts with the newer vector brand assets already present under `assets/brand/` and makes the UI feel like a collection of historical layers instead of one coherent system.

The repository already has meaningful browser QA: Playwright covers all nine primary views across 360/390/430/768/1366/1920 and mobile landscape, including empty/offline/loading/error, keyboard focus and reduced motion. What is missing is a stronger visual contract: current screenshots are evidence artifacts, not deterministic snapshot gates.

## 2. Design intent

The target is an **Equestrian Operations Console**: dense, calm, fast to scan, professional and operational. It must not look like a generic admin template, casino dashboard, marketing landing page, or consumer betting app.

External visual research used for direction includes recent equestrian and horse-racing dashboard work on Dribbble and current accessibility/testing guidance from Playwright/WCAG. The recurring useful patterns are:

- restrained ivory/charcoal surfaces;
- deep green as the primary operational accent;
- brass/earth accents used sparingly;
- compact card spacing and clear information hierarchy;
- typography optimized for scanning dense numeric information;
- dark themes based on neutral charcoal/green rather than tinted burgundy surfaces;
- explicit visual state separation instead of relying on saturated fills.

We will use these as design principles, not copy any third-party composition or asset.

## 3. Architecture decision

Do **not** rewrite the PWA in React/MUI or introduce a competing UI framework. Preserve the accepted incremental architecture in `ADR-FRONTEND-ARCHITECTURE-106.md` and evolve the existing vanilla JS/CSS runtime.

The implementation has four coordinated layers:

1. **Design tokens and primitives** in canonical CSS.
2. **Theme and branding authority** in the existing bootstrap/render flow.
3. **Markup adjustments** only where current structure blocks the target hierarchy.
4. **Playwright visual/functional gates** to make the new system enforceable.

No second stylesheet may become an alternate authority. `assets/css/app.css` remains canonical.

## 4. Token system

### 4.1 Typography

Use one system stack only; no remote font dependency is introduced because Control Hípico must remain reliable offline.

```css
--hc-font-sans: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
--hc-font-mono: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;

--hc-type-2xs: 11px;
--hc-type-xs: 12px;
--hc-type-sm: 13px;
--hc-type-md: 14px;
--hc-type-lg: 16px;
--hc-type-xl: 20px;
--hc-type-2xl: 24px;
```

Rules:

- desktop body: 13px;
- touch/mobile body: 14px;
- default buttons: 13px / 600;
- compact buttons/tabs: 12px / 600;
- inputs/selects: 13px desktop, 14px touch;
- numeric money/KPI/table values: `font-variant-numeric: tabular-nums`;
- page titles: 20–24px, never fluid beyond 24px on normal application screens;
- no generic `button,input,select,textarea { font-size: 1rem; }`.

### 4.2 Spacing and density

Desktop is compact; touch restores larger hit areas.

```css
--hc-space-1: 4px;
--hc-space-2: 8px;
--hc-space-3: 12px;
--hc-space-4: 16px;
--hc-space-5: 20px;
--hc-space-6: 24px;

--hc-control-h: 36px;
--hc-control-h-sm: 32px;
--hc-touch-h: 44px;
```

Desktop target sizes:

- normal button/input/select: 36px;
- compact action/tab: 32–34px;
- icon button: 36px;
- topbar: 56px;
- sidebar: approximately 220–228px;
- card header: 44–48px;
- standard card body padding: 12–14px.

For `pointer: coarse`, interactive targets return to at least 44px height unless a larger surrounding hit target is provided.

### 4.3 Radius and elevation

Reduce the current rounded-card visual weight.

```css
--hc-radius-xs: 4px;
--hc-radius-sm: 6px;
--hc-radius-md: 8px;
--hc-radius-lg: 10px;
--hc-radius-xl: 12px;
```

Shadows are subtle and reserved for floating/popover surfaces. Static cards rely primarily on border/surface separation.

## 5. Color system

### 5.1 Light theme

```text
Background       #F4F5F2
Surface          #FFFFFF
Surface subtle   #ECEFEA
Surface raised   #F8F9F7
Border           #D7DCD6
Border strong    #B9C1BA
Text             #171A18
Text muted       #667069
Brand            #235C45
Brand hover      #1B4937
Brand soft       #E7F0EB
Accent / brass   #A77B36
Success          #2D6A4F
Warning          #9A6B18
Danger           #A23A43
Info             #3F647C
Focus            #2F7A5B
```

### 5.2 Dark theme

```text
Background       #0B0E0C
Surface          #121714
Surface subtle   #18201B
Surface raised   #151B17
Border           #2A352E
Border strong    #47564C
Text             #F3F6F3
Text muted       #A6B0A9
Brand            #79B891
Brand hover      #8BC7A2
Brand soft       #173324
Accent / brass   #D1AD6A
Success          #78C39D
Warning          #DBB568
Danger           #E5848A
Info             #8DB4CE
Focus            #8CCAA5
```

### 5.3 Usage rules

- green is the product/primary operational color;
- group-specific colors remain contextual indicators only (dots/rails/chips), not full-page themes;
- brass is an accent, never the default CTA;
- red is reserved for destructive/error/negative states;
- no burgundy/pink global theme remains;
- focus indicators must remain visually distinguishable in both themes;
- status meaning must never rely on color alone.

## 6. Branding

### 6.1 Remove legacy rendered wordmark

`logo-control-hipico.png` must stop being rendered by the product shell. `brandMarkup()` must no longer select the PNG wordmark.

The app shell uses a compact text lockup:

- primary: `CONTROL HÍPICO`;
- optional small status/version metadata;
- vector mark from `assets/brand/control-hipico-mark.svg` may be used where an icon is appropriate.

The large boot wordmark is replaced by a compact app mark + product name. This prevents the boot/auth experience from resembling a marketing splash.

If `logo-control-hipico.png` has no remaining runtime references after implementation, delete it from the PWA asset authority and remove it from the service-worker shell. If another runtime consumer is discovered, keep the file only for that consumer and document it as non-authoritative.

### 6.2 PWA manifest/icons

Manifest and installed-app icons remain valid unless the implementation proves they are visually inconsistent with the chosen vector mark. This redesign must not casually break installed PWA icon compatibility.

## 7. Theme authority

Theme is a **device/user presentation preference**, not business workspace data.

Canonical authority:

- storage key: `hipico-control-theme`;
- allowed values: `system | light | dark`;
- `theme-bootstrap.js` applies the theme before first paint;
- UI actions update the same storage key and `document.documentElement.dataset.theme`.

Migration rule:

- if the storage key is absent and an existing workspace has `config.theme`, import that value once as a compatibility fallback;
- after migration, rendering must not use `workspace.config.theme` as a competing authority;
- no business sync must overwrite local display preference.

The control must be discoverable in desktop topbar and Settings; mobile must have an equivalent accessible control. The label remains explicit, e.g. `Tema: Sistema`, `Tema: Claro`, `Tema: Oscuro`, or an accessible compact cycle button with `aria-label="Cambiar tema"`.

## 8. Component standards

### 8.1 Button

Variants: primary, secondary/default, ghost, danger, success only where state semantics justify it.

Contract:

- one height scale;
- icon/label alignment standardized;
- no browser-default button presentation;
- disabled state is visibly disabled and non-interactive;
- keyboard focus visible;
- touch height >= 44px under coarse pointer.

### 8.2 Inputs/selects/date controls

- same height, border, radius and typography;
- custom select remains keyboard accessible;
- labels use the same type scale;
- helper/error text is 11–12px;
- date presentation remains single-line where possible;
- focus/invalid/disabled states have explicit contracts.

### 8.3 Cards/KPI

- reduce decorative chrome;
- compact headers;
- numeric KPI values use tabular figures;
- avoid excessive tinted cards;
- critical/error cards may use a semantic rail/border instead of large saturated backgrounds.

### 8.4 Navigation

Desktop:

- compact sidebar;
- no duplicated desktop quick-nav bar;
- clear current-view state;
- theme control remains reachable.

Mobile/tablet:

- preserve current functional navigation contracts;
- no clipping/overflow at 360/390/430/768 or landscape;
- bottom/mobile navigation must not obscure content or safe-area controls.

### 8.5 Tables and dense operational data

- 12–13px table text desktop;
- tabular numbers;
- sticky/overflow behavior only where existing workflows require it;
- long labels and large balances must not overlap actions;
- horizontal overflow is allowed only in explicit owners such as `.table-wrap`.

## 9. Screen-level improvements included

This PR may improve existing frontend composition when it directly enforces the new system. Allowed scope includes:

- dashboard hierarchy and KPI density;
- race/capture action grouping;
- reports/closing layout density;
- Settings theme discoverability;
- auth/boot branding cleanup;
- WhatsApp cards and status-chip consistency;
- empty/error/loading/offline surfaces;
- modal/calendar/select consistency;
- responsive spacing and anti-overlap fixes discovered by Playwright.

Not allowed:

- new business features unrelated to presentation;
- redesigning monetary logic;
- changing authorization semantics;
- replacing navigation architecture;
- introducing a new framework/library solely for styling.

Any additional frontend improvement discovered during implementation must be classified as either:

- **IN SCOPE:** necessary to satisfy this design system or QA contract;
- **FOLLOW-UP:** valuable but independent and should not inflate this PR.

## 10. Accessibility requirements

- WCAG 2.2 AA target for text and non-text contrast;
- visible `:focus-visible` in all themes;
- no focus traps outside modal/dialog contracts;
- semantic labels for icon buttons;
- reduced-motion removes non-essential transitions/animations;
- no information encoded by color only;
- 44px touch targets in coarse-pointer contexts;
- keyboard-operable custom selects, theme control and dialogs;
- dark/light theme must not regress readability of muted text or disabled controls.

## 11. Playwright and regression strategy

### 11.1 Existing matrix retained

The current QA catalog remains authoritative:

- views: dashboard, race, WhatsApp, advanced, participants, history, reports, POLLA, settings;
- viewports: 360, 390, 430, 768, 1366, 1920, mobile landscape;
- states: normal, empty, offline, loading, error, permission/auth, recovery;
- keyboard focus and reduced motion.

No existing coverage may be removed to make the redesign pass.

### 11.2 New deterministic visual gates

Add Playwright snapshot tests using `expect(page).toHaveScreenshot()` for a representative, stable matrix:

- dashboard: 390 light/dark, 1366 light/dark;
- race/capture: 390 light/dark, 1366 light/dark;
- settings: 390 light/dark, 1366 light/dark;
- auth/boot: 390 light/dark, 1366 light/dark.

Snapshots must be deterministic:

- fixed fixture data;
- fixed viewport;
- animations disabled/reduced;
- no dynamic timestamps unless masked or fixture-controlled;
- no automatic snapshot regeneration in CI.

### 11.3 Structural design-system tests

Add static/DOM assertions for:

- no `logo-control-hipico.png` runtime rendering;
- no generic `1rem` control rule;
- theme values limited to system/light/dark;
- theme control visible and operable;
- required token families exist;
- desktop controls stay compact;
- coarse pointer restores >=44px interactive height;
- money/KPI values use tabular figures;
- dark and light theme token contracts exist.

### 11.4 Browsers and CI

- Chromium is the PR visual gate.
- Firefox/WebKit remain scheduled/cross-browser regression where repository policy already supports them.
- no `skip`, `only`, `force`, arbitrary sleeps, inflated timeouts or disabled browsers to manufacture green.
- artifacts include screenshots/diffs on visual failure.

## 12. PWA delivery

Because `app.css`, shell markup and branding assets are service-worker cached, the redesign must rotate the shell cache version after implementation and include any new/changed shell assets.

The automatic updater merged in PR #682 remains the delivery mechanism. The redesign must not regress its one-time reload behavior or delete user data.

## 13. Files expected to change

Primary implementation set:

- `frontend/public/hipico-control/assets/css/app.css`
- `frontend/public/hipico-control/assets/js/app.js`
- `frontend/public/hipico-control/assets/js/theme-bootstrap.js`
- `frontend/public/hipico-control/index.html`
- `frontend/public/hipico-control/sw.js`
- `frontend/public/hipico-control/manifest.webmanifest` only if theme/icon values require alignment
- `qa/hipico-visual-functional-v105.spec.mjs` or successor with explicit version bump
- `qa/support/hipico-visual-catalog-v105.mjs` or successor if theme cases are modeled there
- related regression tests under `tests/`
- Playwright snapshot assets generated by the final deterministic baseline

Conditional:

- `frontend/public/hipico-control/logo-control-hipico.png` deletion only if no runtime consumer remains;
- existing workflow file(s) only if needed to publish the Chromium visual gate/artifacts.

## 14. Validation plan

Before merge, execute against the exact candidate SHA where locally/tooling permits:

1. syntax/static tests for modified JS;
2. focused design-system regression tests;
3. existing Hípico characterization/regression tests relevant to shell/navigation/theme;
4. Playwright Chromium representative visual snapshots;
5. full Hípico visual/functional matrix in Chromium;
6. build/static Pages artifact where configured;
7. PWA service-worker/update regression;
8. diff review for accidental business-logic changes;
9. CI status for exact candidate SHA.

Report `VERIFIED`, `NOT VERIFIED`, `BLOCKED`, and `OUT OF SCOPE` separately. GitHub Actions infrastructure failures are not equivalent to code failures and are not reported as PASS.

## 15. Acceptance criteria

The redesign is accepted only when all of the following are true:

- [ ] legacy wordmark no longer renders in boot/app shell;
- [ ] typography is tokenized and visually consistent;
- [ ] desktop buttons/inputs/selects are compact and professional;
- [ ] touch controls remain >=44px in coarse-pointer contexts;
- [ ] one green/neutral/brass visual system replaces burgundy/pink global theming;
- [ ] light, dark and system themes are accessible and discoverable;
- [ ] theme preference has one canonical local authority with migration compatibility;
- [ ] dashboard/race/settings/auth have deterministic Playwright visual baselines in light/dark, mobile/desktop;
- [ ] existing 360/390/430/768/1366/1920/landscape anti-overlap coverage remains;
- [ ] keyboard, focus, reduced motion, loading, empty, error, offline and auth-denial coverage remains;
- [ ] no business logic, balances, bets, persistence schema or authorization contract changes are introduced;
- [ ] service-worker cache revision delivers the new shell without requiring manual cache deletion;
- [ ] final diff contains no duplicate design authority, legacy override layer or dead styling;
- [ ] PR documents exact test/build/runtime evidence and infrastructure blockers separately.

## 16. Risks and mitigations

**Risk: CSS breadth causes hidden view regressions.**  
Mitigation: preserve the complete view/viewport matrix and add deterministic snapshots before merge.

**Risk: compact desktop density harms touch UX.**  
Mitigation: separate coarse-pointer target sizing from desktop visual density.

**Risk: theme migration overwrites synchronized workspace data.**  
Mitigation: treat workspace theme as read-once fallback only; canonical value is local presentation storage.

**Risk: branding cleanup breaks PWA cache/install assets.**  
Mitigation: distinguish rendered wordmark authority from manifest icons; rotate shell cache and validate install shell.

**Risk: scope creep into unrelated UI features.**  
Mitigation: only improvements necessary to enforce tokens, component consistency, responsive behavior or QA are included; independent features become follow-up tickets.

## 17. Rollback

This work does not alter persisted business schema. Rollback is a code revert of the UI/theme/snapshot commits plus a shell-cache revision. User operational data remains compatible.
