# Control Hípico UI System v4.1 — Shell, Density and Navigation Amendment

**Date:** 2026-09-29  
**Status:** Proposed amendment to approved v4 design  
**Base spec:** `docs/superpowers/specs/2026-09-29-hipico-frontend-design-system-v4-design.md`  
**Baseline:** `main@3295bdeb7add7b0962f549887287606f7448993d`  
**Branch:** `feat/hipico-ui-system-v4`  

This amendment is additive and authoritative for shell/navigation decisions. Where it conflicts with the v4 spec, this v4.1 amendment wins.

## 1. Additional problem statement

The current screenshots expose four shell-level inconsistencies that the base redesign must solve rather than hide with page-specific CSS:

1. action buttons are visually too large and too text-heavy for a dense operational console;
2. content width is inconsistent because the canonical `.content` container uses a centered max width, causing some views to feel boxed while others visually consume more of the viewport;
3. the desktop sidebar is permanently expanded and cannot yield horizontal space to dense views;
4. the topbar does not behave as a complete global application header with fast access to theme, settings and compact utility actions.

These are design-system concerns, not isolated page bugs.

## 2. Icon authority — no parallel icon system

The project already has a canonical SVG icon registry in `frontend/public/hipico-control/assets/js/ui.js` through `ICONS` and `icon(name)`. This remains the only icon authority for Control Hípico.

Do **not** add MUI, Material Icons, Font Awesome or another icon package just to redesign these controls. The root package currently has Playwright as its only relevant UI test dependency and Control Hípico is a vanilla/offline PWA; adding a component framework or icon dependency would create an unnecessary second design/runtime authority.

Extend `ICONS` only for missing semantic actions required by this amendment, using the same 24×24 stroke contract. Candidate additions:

- `panelClose` / `panelOpen` for sidebar collapse/expand;
- `more` for the utility menu;
- `chevronDown` for menu affordances;
- `palette` or reuse `sun`/`moon` for theme;
- `user` only if account/profile access needs a distinct affordance.

Every icon-only control must have an `aria-label` and a tooltip/title or equivalent accessible description. Icon-only buttons are reserved for universally recognizable utility actions; destructive, financial, ambiguous or workflow-critical actions keep a visible text label.

## 3. Standard control geometry

### 3.1 Desktop

Use exactly three interactive size classes:

```text
compact/icon       32px
standard           36px
primary emphasis   38px maximum
```

Rules:

- standard `.button`, `.input`, `.select-trigger`, `.date-button`: 36px;
- `.button--small`, compact tab/action, utility icon button: 32px;
- primary workflow action such as `Captura rápida`: 38px maximum, not 44–48px on desktop;
- icon glyph: 16px for 32–36px controls, 18px only for primary emphasis;
- text: 13px/600 standard, 12px/600 compact;
- padding is tokenized; no view-specific button padding overrides;
- all button content uses `inline-flex`, `align-items:center`, `justify-content:center` and a standard 6px gap;
- no icon or label may be optically displaced vertically or horizontally;
- icon-only button width equals its height.

### 3.2 Touch / coarse pointer

For `pointer: coarse` or the existing touch QA contexts:

- interactive hit target is at least 44px high/wide;
- the visual glyph may remain 16–18px;
- dense text/button styling is preserved inside the larger hit area;
- no desktop compact target is allowed to leak into touch mode.

### 3.3 Button-to-icon conversion policy

Convert repetitive utility buttons to icon-first controls where the action remains obvious:

- Settings → gear icon;
- theme → sun/moon/system icon;
- help → help icon;
- sidebar collapse/expand → panel icon;
- close/dismiss → close icon;
- copy → copy icon where context clearly identifies the payload; otherwise use icon + short label;
- overflow/secondary utilities → `more` icon menu.

Keep visible labels for:

- Captura rápida;
- Nueva carrera;
- Cerrar jornada;
- Procesar resultados;
- Guardar/Confirmar/Importar and financial actions;
- destructive actions unless the surrounding dialog supplies an unambiguous named control.

## 4. Full-width application content contract

All primary authenticated views must use the same fluid shell width.

Canonical rule:

```css
.content {
  width: 100%;
  max-width: none;
  margin-inline: 0;
}
```

The content area fills all width available after the sidebar, while retaining consistent responsive padding. Individual feature pages must not reintroduce a centered global max width.

Allowed width constraints are component-local only, for readability or task semantics, e.g. authentication forms, modal dialogs, narrow editors or text-heavy help surfaces.

Views required to obey the fluid application contract include:

- Resumen;
- Captura / carrera activa;
- Chat WhatsApp;
- Adelantadas;
- Participantes;
- Historial;
- Cierres y saldos;
- POLLA;
- Configuración.

The 1366 and 1920 Playwright cases must assert that `.content` consumes the available main-column width within the configured shell padding rather than being centered at a fixed max width.

## 5. Collapsible desktop sidebar

### 5.1 States

Desktop sidebar has two explicit states:

- **expanded:** approximately 220–228px;
- **collapsed:** approximately 64–68px.

The collapsed state keeps icons visible, hides textual nav labels/secondary metadata visually, preserves accessible names, and expands the active view into the released horizontal space.

### 5.2 Control placement

A dedicated collapse/expand button sits at the bottom of the sidebar, visually separated from destructive/session actions. It uses the canonical icon registry and has explicit labels:

- `Colapsar barra lateral`;
- `Expandir barra lateral`.

The button must not be conflated with `Cerrar sesión`.

### 5.3 Preference authority

Sidebar collapse is a local device presentation preference, never workspace/business data.

Use a dedicated local key:

```text
hipico-control-sidebar-collapsed
```

Allowed values are effectively boolean. The preference must survive reload/PWA update but must not sync through Supabase or mutate workspace state.

On mobile/tablet where the existing responsive navigation contract changes the shell, the desktop collapse preference must not break or replace the mobile navigation behavior.

## 6. Global application header

The current topbar evolves into the canonical global header for every authenticated view.

### 6.1 Left area

- current view title;
- compact context/subtitle where useful;
- optional breadcrumb/back affordance only when the current workflow has nested navigation.

### 6.2 Right area

Use a stable hierarchy, from operational to utility:

1. active group selector/status;
2. connection/device/cloud state in compact form;
3. primary `Captura rápida` action;
4. icon-only theme control;
5. icon-only settings/utility menu trigger.

The header remains one line on desktop where space allows and degrades responsively without overlapping.

### 6.3 Utility menu

The top-right settings/utility trigger opens one canonical popover/menu. It must use existing design tokens and contain concise actions such as:

- Tema: Sistema / Claro / Oscuro;
- Configuración;
- Ayuda;
- account/session utilities where applicable;
- optional PWA/install entry when that action is available.

Do not duplicate business navigation already owned by the sidebar. The menu is for global preferences/utilities, not a second navigation tree.

Keyboard contract:

- trigger is reachable by Tab;
- Enter/Space opens;
- Escape closes and returns focus to trigger;
- arrow-key navigation is implemented if menu semantics use `role="menu"`; otherwise use a simpler popover of normal buttons/links with standard Tab behavior;
- click outside closes without losing data.

For simplicity and accessibility, prefer a popover containing normal buttons/links rather than introducing ARIA menu complexity unless actual menu keyboard semantics are fully implemented.

## 7. Header/sidebar interaction and layout

The shell grid is the only owner of sidebar width.

Recommended contract:

```text
expanded:  grid-template-columns: 224px minmax(0, 1fr)
collapsed: grid-template-columns: 66px minmax(0, 1fr)
```

The main column always uses `min-width:0`; `.content` is fluid. Header width follows the main column automatically.

No page may set its own left margin to compensate for sidebar state.

## 8. Additional frontend quality improvements in scope

The implementation may include the following improvements when they reduce inconsistency without changing business behavior:

- remove redundant labels when the icon plus accessible name is clearer;
- normalize action groups so primary/secondary/destructive hierarchy is visually obvious;
- align page headings/actions to a common baseline;
- reduce oversized empty space in cards and headers;
- normalize cards across dashboard/reports/settings to the same padding and border rhythm;
- make status chips smaller and vertically centered;
- make the floating help control match the icon-button system or move it into the global utility area where appropriate;
- ensure long group names do not force header growth;
- use tooltips for collapsed-sidebar nav items;
- preserve tabular numerals and consistent line-height in dense financial data;
- ensure light/dark icon contrast follows `currentColor` tokens rather than hard-coded colors.

Anything requiring new business state, backend endpoints, authorization changes or financial behavior remains follow-up/out of scope.

## 9. Required QA additions

In addition to the v4 tests, add deterministic checks for this amendment.

### 9.1 Structural/contracts

Assert:

- no new external icon/component library dependency is added for Hípico;
- all shell icons come from `ui.js` canonical registry;
- desktop standard controls are 36px and compact/icon controls 32px;
- coarse-pointer controls meet 44px minimum;
- `.content` has no global max-width/centering authority;
- all nine views render inside the same fluid shell contract;
- sidebar expanded/collapsed states change only shell geometry, not feature data;
- collapse preference uses local presentation storage, not workspace config;
- global header contains theme and utility/settings access;
- icon-only buttons have accessible names.

### 9.2 Playwright functional

Add browser tests covering:

1. collapse sidebar at 1366, verify main content width increases and current view remains unchanged;
2. reload, verify collapse preference persists;
3. expand sidebar, verify labels return and content remains healthy;
4. open top-right utility popover, switch light → dark → system and verify theme state/persistence;
5. keyboard open/close the utility popover and restore focus;
6. visit all nine views at 1366 and assert a common fluid main-content width formula;
7. verify collapsed sidebar nav controls have accessible names/tooltips;
8. verify no document overflow/overlap in expanded and collapsed states;
9. verify 390/coarse-pointer still satisfies the existing touch-target detector;
10. visual snapshots for dashboard/settings/reports in expanded and collapsed desktop states, light and dark where stable.

### 9.3 Regression rules

- do not remove any existing v105 matrix coverage;
- no `skip`, `only`, `force`, arbitrary sleeps or oversized timeouts;
- screenshots/diffs are artifacts on failure;
- Chromium remains PR visual gate; Firefox/WebKit remain cross-browser/scheduled according to repository policy.

## 10. Expected implementation files

In addition to the base v4 spec set, implementation is expected to touch:

- `frontend/public/hipico-control/assets/js/ui.js` — canonical icon registry and reusable icon-button/popover helpers if justified;
- `frontend/public/hipico-control/assets/js/app.js` — shell markup/actions and integration;
- `frontend/public/hipico-control/assets/css/app.css` — shell grid, fluid content, control geometry, header/sidebar states;
- `frontend/public/hipico-control/assets/js/theme-bootstrap.js` — only theme-authority work, not sidebar state;
- optional small `frontend/public/hipico-control/assets/js/shell-preferences.js` if extracting local shell preference ownership reduces `app.js` coupling without creating duplicate state;
- Hípico Playwright specs/support and focused Node regression tests;
- service worker shell revision after final asset set is stable.

Do not add MUI solely for icons or shell controls.

## 11. Revised acceptance criteria

The combined v4 + v4.1 redesign is accepted only when:

- [ ] all primary views share the same full-width/fluid application shell;
- [ ] sidebar collapses/expands on desktop and persists locally;
- [ ] collapsed sidebar releases width to the current view without navigation/data loss;
- [ ] global header exposes theme and settings/utilities consistently;
- [ ] button/icon geometry follows 32/36/38 desktop scale and >=44px touch scale;
- [ ] icon-only controls are centered and accessible;
- [ ] existing `ui.js` icon authority is extended rather than introducing a second icon library;
- [ ] legacy wordmark removal, typography, palette and dark-mode requirements from v4 remain intact;
- [ ] all existing v105 responsive/state/focus/reduced-motion coverage remains;
- [ ] new collapse/header/fluid-width Playwright tests pass on the exact candidate SHA;
- [ ] PWA shell cache revision delivers the new CSS/JS without deleting user data;
- [ ] diff review shows no accidental financial/auth/persistence business changes.
