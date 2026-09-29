# Control Hípico UI System v4.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the existing Control Hípico frontend shell and canonical design system into a compact, full-width, professional Equestrian Operations Console with consistent light/dark themes, standardized controls/icons, collapsible desktop navigation, a global header/menu, and enforceable Playwright visual regression gates.

**Architecture:** Keep the accepted vanilla JS/CSS PWA architecture. `assets/css/app.css` remains the sole style authority, `assets/js/ui.js` remains the sole icon/primitives registry, and `assets/js/app.js` composes the shell while a small presentation-preference module owns theme/sidebar persistence so business workspace state does not become UI authority. The implementation preserves financial, authorization, persistence, Supabase and WhatsApp contracts and changes only presentation/shell behavior plus QA delivery gates.

**Tech Stack:** HTML/CSS/ES modules, existing inline SVG icon registry, IndexedDB/localStorage presentation preferences, PWA Service Worker, Node 22, Playwright 1.63, GitHub Actions/GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-09-29-hipico-frontend-design-system-v4-design.md` + `docs/superpowers/specs/2026-09-29-hipico-frontend-design-system-v4.1-shell-amendment.md`

## Global Constraints

- Do not introduce React/MUI or another UI framework/icon package; extend the canonical SVG registry in `frontend/public/hipico-control/assets/js/ui.js`.
- `frontend/public/hipico-control/assets/css/app.css` is the only canonical stylesheet authority for Hípico.
- Light/dark/system theme is a device/user presentation preference stored under `hipico-control-theme`; business workspace sync must not overwrite it.
- Sidebar collapsed state is a device presentation preference and must not enter synced business workspace data.
- Desktop control heights: small 32px, default 36px, primary/high-emphasis max 38px; coarse-pointer/touch interactive targets >=44px.
- All main desktop views use a fluid full-width content shell; no view-specific centered `max-width` containers.
- Meaningful actions keep readable text; icon-only controls are limited to universally recognizable utility/navigation actions and require `aria-label` + tooltip/title.
- Preserve current 9-view QA catalog, 360/390/430/768/1366/1920/mobile-landscape coverage, loading/empty/error/offline/permission/recovery states, keyboard focus and reduced-motion coverage.
- Chromium is the PR visual gate; do not use `skip`, `only`, `force`, arbitrary sleeps, inflated timeouts, disabled browsers, or automatic snapshot regeneration in CI.
- Rotate the Hípico service-worker shell cache revision after frontend assets change and preserve PR #682 automatic one-time update behavior without deleting user data.
- Do not modify financial calculations, bet settlement, Supabase schema, authorization semantics, WhatsApp business parsing, or persistence contracts except presentation preference separation explicitly required by the spec.

## Review Focus

1. **Existing users with legacy `workspace.config.theme`:** first render must migrate/fallback safely without flashing the wrong theme, then device preference becomes authoritative. Covered in Task 2 tests.
2. **Sidebar state across reload and all views:** collapse must persist locally, expand content immediately, preserve navigation/tooltips/ARIA, and never affect mobile navigation. Covered in Task 3 Playwright tests.
3. **Icon-only utilities and keyboard users:** every icon-only action must have accessible name, visible focus, tooltip/title, centered SVG, and the same workflow marker as the replaced text button. Covered in Task 4 tests.
4. **Long labels/large values/full-width layouts:** no clipped/overlapping controls at the existing viewport matrix, especially reports/settings/dashboard and 360px/mobile landscape. Covered in Tasks 4–6 browser tests.
5. **PWA users with cached v3/v29 assets:** shell update must replace CSS/JS/branding through the existing auto-updater without clearing IndexedDB/localStorage business data. Covered in Task 7 regression tests.

---

### Task 1: Lock v4.1 design-system contracts with failing tests

**Files:**
- Create: `tests/hipico_ui_system_v41_contract.test.mjs`
- Modify: none initially
- Test: `tests/hipico_ui_system_v41_contract.test.mjs`

**Interfaces:**
- Consumes: current repository source files as text.
- Produces: authoritative static contract assertions that later tasks must satisfy.

- [ ] **Step 1: Write failing structural tests** asserting:
  - legacy `logo-control-hipico.png` is not referenced by `index.html`, `app.js`, or `sw.js`;
  - `app.css` contains semantic typography/spacing/control tokens and no generic `button, input, select, textarea { font-size: 1rem; }` rule;
  - `.content` has no global centered `max-width` cap;
  - collapsed sidebar token/class/state exists;
  - theme allowed values are `system/light/dark` and app rendering does not read `workspace.config.theme` as primary authority;
  - icon-only utility helper/contract exists with accessible label support;
  - service-worker cache revision is newer than `shell-r29-auto-update-reload`.

- [ ] **Step 2: Run the new contract test and verify RED**

Run: `node --test tests/hipico_ui_system_v41_contract.test.mjs`

Expected: FAIL on legacy branding, density/full-width/sidebar/theme contracts.

- [ ] **Step 3: Commit test-only RED baseline**

```bash
git add tests/hipico_ui_system_v41_contract.test.mjs
git commit -m "test(hipico): lock ui system v4.1 contracts"
```

---

### Task 2: Canonicalize tokens, palette, branding and presentation preferences

**Files:**
- Modify: `frontend/public/hipico-control/assets/css/app.css`
- Modify: `frontend/public/hipico-control/assets/js/theme-bootstrap.js`
- Create: `frontend/public/hipico-control/assets/js/presentation-preferences.js`
- Modify: `frontend/public/hipico-control/assets/js/app.js`
- Modify: `frontend/public/hipico-control/index.html`
- Conditional delete: `frontend/public/hipico-control/logo-control-hipico.png`
- Test: `tests/hipico_ui_system_v41_contract.test.mjs`
- Create: `tests/hipico_presentation_preferences_v41.test.mjs`

**Interfaces:**
- Produces: `getThemePreference()`, `setThemePreference(theme)`, `getSidebarCollapsed()`, `setSidebarCollapsed(boolean)`, `migrateLegacyTheme(workspaceTheme)` from `presentation-preferences.js`.
- `app.js` consumes these functions; no business module depends on them.

- [ ] **Step 1: Write failing preference unit tests** for valid theme normalization, localStorage fallback, one-time legacy workspace migration, invalid-value recovery to `system`, and sidebar boolean persistence.

- [ ] **Step 2: Run preference tests and verify RED**

Run: `node --test tests/hipico_presentation_preferences_v41.test.mjs`

Expected: FAIL because module/functions do not yet exist.

- [ ] **Step 3: Implement presentation preference module and update theme bootstrap** so pre-paint theme and runtime updates share the same key/normalization contract.

- [ ] **Step 4: Replace CSS root tokens/palette/type scale/density** with v4 values; set desktop body 13px, touch body 14px, tabular numeric figures, compact radii/elevation, new green/brass light and charcoal/green dark themes.

- [ ] **Step 5: Replace legacy rendered branding** with compact vector mark + text lockup in boot/app/auth surfaces; update `brandMarkup()` so no wordmark PNG is selected.

- [ ] **Step 6: Remove the PNG only if repository search proves no remaining runtime consumer**; otherwise keep it as non-authoritative and document the remaining consumer in the PR.

- [ ] **Step 7: Run focused tests and verify GREEN**

Run:
```bash
node --test tests/hipico_presentation_preferences_v41.test.mjs tests/hipico_ui_system_v41_contract.test.mjs
node --check frontend/public/hipico-control/assets/js/presentation-preferences.js
node --check frontend/public/hipico-control/assets/js/theme-bootstrap.js
node --check frontend/public/hipico-control/assets/js/app.js
```

Expected: preference tests PASS; contract failures remaining only for shell/header/icon/PWA tasks not yet implemented.

- [ ] **Step 8: Commit**

```bash
git add frontend/public/hipico-control tests/hipico_presentation_preferences_v41.test.mjs tests/hipico_ui_system_v41_contract.test.mjs
git commit -m "feat(hipico): canonicalize v4 theme and branding"
```

---

### Task 3: Implement full-width shell, collapsible sidebar and global header/menu

**Files:**
- Modify: `frontend/public/hipico-control/assets/css/app.css`
- Modify: `frontend/public/hipico-control/assets/js/app.js`
- Modify: `frontend/public/hipico-control/assets/js/ui.js`
- Test: `tests/hipico_ui_system_v41_contract.test.mjs`
- Modify/Create: `qa/hipico-visual-functional-v105.spec.mjs` or successor `qa/hipico-visual-functional-v106.spec.mjs`

**Interfaces:**
- Consumes: presentation preference API from Task 2.
- Produces: shell DOM contract with `[data-shell]`, sidebar collapse action `toggle-sidebar`, global utility menu action/state, and accessible header controls.

- [ ] **Step 1: Add failing Playwright cases** for desktop 1366:
  - `.content` spans available main width without centered cap;
  - clicking `Colapsar barra lateral` changes sidebar from 224px class/state to 66px and increases main content width;
  - collapsed state survives reload;
  - navigation still changes views while collapsed;
  - mobile 390 does not render desktop collapse control or inherit collapsed desktop layout;
  - global header exposes theme/settings/help menu with accessible names.

- [ ] **Step 2: Run the focused Playwright cases and verify RED**

Run: `npx playwright test qa/hipico-visual-functional-v106.spec.mjs --project=chromium --grep "shell|sidebar|global header" --workers=1`

Expected: FAIL before shell implementation.

- [ ] **Step 3: Implement shell markup/state** in `app.js`: 224px desktop sidebar, 66px collapsed class, bottom collapse control, persisted state, full-width main content, no duplicated desktop quick-navigation strip.

- [ ] **Step 4: Implement global header** with current view title/context, active group/status, primary capture action, theme utility, and a compact overflow/settings menu for Configuration, Help and presentation utilities.

- [ ] **Step 5: Extend canonical icon registry** only with missing utilities required by the new shell (e.g. panel-left/panel-right/more/theme-system) and keep all SVG alignment in `ui.js`/CSS.

- [ ] **Step 6: Implement keyboard/menu behavior**: Escape closes utility menu, focus-visible remains explicit, icon-only controls have `aria-label` + `title`, menu items are real buttons with workflow markers.

- [ ] **Step 7: Run focused shell tests and static contracts**

Run:
```bash
npx playwright test qa/hipico-visual-functional-v106.spec.mjs --project=chromium --grep "shell|sidebar|global header" --workers=1
node --test tests/hipico_ui_system_v41_contract.test.mjs
```

Expected: PASS for shell/header contracts; only later visual/PWA assertions may remain.

- [ ] **Step 8: Commit**

```bash
git add frontend/public/hipico-control/assets/css/app.css frontend/public/hipico-control/assets/js/app.js frontend/public/hipico-control/assets/js/ui.js qa tests/hipico_ui_system_v41_contract.test.mjs
git commit -m "feat(hipico): add full-width collapsible operations shell"
```

---

### Task 4: Standardize controls and replace utility text buttons with canonical icons

**Files:**
- Modify: `frontend/public/hipico-control/assets/css/app.css`
- Modify: `frontend/public/hipico-control/assets/js/ui.js`
- Modify: `frontend/public/hipico-control/assets/js/app.js`
- Modify: `qa/support/hipico-layout-detector-v105.mjs` only if needed to assert new icon contracts without weakening existing checks
- Modify: `qa/hipico-visual-functional-v106.spec.mjs`
- Create: `tests/hipico_icon_action_contract_v41.test.mjs`

**Interfaces:**
- Consumes: `icon(name)` / `ui.button(...)` canonical registry.
- Produces: `ui.iconButton(iconName, { action, label, title, variant, attrs })` or equivalent canonical helper used by product markup.

- [ ] **Step 1: Write failing icon/control contract tests** asserting icon-only buttons require label/action, rendered SVG is centered, default desktop heights map to 32/36/38px scale, and coarse pointer CSS restores >=44px.

- [ ] **Step 2: Run RED contract tests**

Run: `node --test tests/hipico_icon_action_contract_v41.test.mjs`

- [ ] **Step 3: Add canonical `ui.iconButton` helper** and extend icon registry only where required.

- [ ] **Step 4: Normalize Button/IconButton/Input/Select/DateButton/Tabs/Badge/Card dimensions** and vertical/horizontal centering in CSS.

- [ ] **Step 5: Replace utility actions with icons where semantics are unambiguous**: theme, settings/menu, help, copy, close, collapse/expand, navigation arrows, refresh where context supplies a label. Keep text on primary/business actions such as Nueva carrera, Captura rápida, Cerrar jornada, Procesar resultados, Guardar, Importar.

- [ ] **Step 6: Add Playwright accessibility/layout assertions** ensuring every visible icon-only button has an accessible name, focus ring, no icon-label overlap, and no touch target below threshold on touch viewports.

- [ ] **Step 7: Run tests**

Run:
```bash
node --test tests/hipico_icon_action_contract_v41.test.mjs
npx playwright test qa/hipico-visual-functional-v106.spec.mjs --project=chromium --grep "accessibility|icon|touch|keyboard" --workers=1
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/public/hipico-control qa tests/hipico_icon_action_contract_v41.test.mjs
git commit -m "refactor(hipico): standardize controls and utility icons"
```

---

### Task 5: Harmonize all Hípico views with the v4.1 density/full-width system

**Files:**
- Modify: `frontend/public/hipico-control/assets/css/app.css`
- Modify: `frontend/public/hipico-control/assets/js/app.js`
- Modify: `qa/hipico-visual-functional-v106.spec.mjs`
- Modify: `qa/support/hipico-visual-catalog-v105.mjs` only if successor naming/theme fixtures are needed

**Interfaces:**
- Consumes: shell/control primitives from Tasks 2–4.
- Produces: consistent page composition across dashboard, race, WhatsApp, advanced, participants, history, reports, POLLA and settings.

- [ ] **Step 1: Add/extend browser assertions** for all nine views at 1366 ensuring main content uses available width, page heads/actions align consistently, and no per-view max-width regression exists.

- [ ] **Step 2: Run all nine desktop view checks and verify any current RED cases are recorded** before CSS/markup fixes.

- [ ] **Step 3: Refine dashboard**: compact group hero, KPI density, Command Center/error state, action hierarchy; remove large legacy wordmark surface.

- [ ] **Step 4: Refine race/capture and advanced**: consistent action clusters, compact filters/date controls, aligned buttons/icons, long race names without wrap-induced control growth.

- [ ] **Step 5: Refine reports/closures**: full-width summary/validation composition, compact tabs and export actions, tabular financial values, no centered narrow canvas.

- [ ] **Step 6: Refine settings/participants/history/POLLA/WhatsApp** to the same header/card/action density without ad-hoc overrides.

- [ ] **Step 7: Verify responsive matrix remains healthy**

Run: `npx playwright test qa/hipico-visual-functional-v106.spec.mjs --project=chromium --workers=1`

Expected: all existing functional/layout/state tests PASS with no overflow/overlap regressions.

- [ ] **Step 8: Commit**

```bash
git add frontend/public/hipico-control/assets/css/app.css frontend/public/hipico-control/assets/js/app.js qa
git commit -m "feat(hipico): harmonize full-width operational views"
```

---

### Task 6: Add deterministic light/dark Playwright visual regression gates

**Files:**
- Create: `qa/hipico-ui-v41-visual.spec.mjs`
- Create: Playwright snapshot assets under the test's snapshot directory after deterministic local generation
- Modify: `playwright.config.*` only if existing snapshot settings cannot satisfy deterministic output
- Modify: `package.json` to add a focused v4.1 visual command if needed

**Interfaces:**
- Consumes: deterministic fixture helpers from existing Hípico QA support.
- Produces: screenshot baseline contract for dashboard/race/settings/auth at 390 and 1366 in light/dark.

- [ ] **Step 1: Write visual test cases** using `expect(page).toHaveScreenshot()` with fixed fixture data, animations disabled/reduced, stable theme, stable viewport and masking only for unavoidable dynamic timestamps.

- [ ] **Step 2: Run without snapshots to verify expected RED/missing-baseline behavior**

Run: `npx playwright test qa/hipico-ui-v41-visual.spec.mjs --project=chromium --workers=1`

- [ ] **Step 3: Generate snapshots locally from the exact candidate implementation** using Playwright's explicit update mode, review each generated image manually against the v4.1 design, and reject/regenerate only for intentional code changes.

- [ ] **Step 4: Re-run without update mode**

Expected: PASS with zero unexpected pixel diffs.

- [ ] **Step 5: Commit tests + reviewed snapshot baselines**

```bash
git add qa package.json
git commit -m "test(hipico): gate v4.1 light and dark visual baselines"
```

---

### Task 7: Align PWA delivery and CI gates with the redesigned shell

**Files:**
- Modify: `frontend/public/hipico-control/sw.js`
- Modify: `frontend/public/hipico-control/manifest.webmanifest`
- Modify: `frontend/public/hipico-control/index.html` if theme-color/brand references remain
- Modify: `.github/workflows/hipico-operations.yml` and/or existing Hípico PR workflow only if necessary to run the focused Chromium gate and upload visual artifacts
- Modify: `tests/hipico_ui_system_v41_contract.test.mjs`
- Modify: existing PWA regression test(s) from PR #682 or add `tests/hipico_pwa_ui_v41_delivery.test.mjs`

**Interfaces:**
- Consumes: final shell assets and PR #682 updater behavior.
- Produces: new shell cache revision containing v4.1 assets and CI command for Chromium visual gate.

- [ ] **Step 1: Write failing PWA delivery assertions** for new cache revision, inclusion of changed shell assets, continued `SKIP_WAITING`/controller-change updater contract, and absence of cache/data-clearing behavior.

- [ ] **Step 2: Run RED PWA test** before cache revision update.

- [ ] **Step 3: Rotate service-worker cache** and update shell asset list/manifest theme colors to v4.1 values while preserving offline fallback behavior.

- [ ] **Step 4: Wire focused Chromium visual command into existing PR gate** without removing any existing Hípico operations checks; upload Playwright report/screenshots/diffs on failure if the workflow already supports artifacts.

- [ ] **Step 5: Run local/static validation**

Run:
```bash
node --test tests/hipico_pwa_ui_v41_delivery.test.mjs tests/hipico_ui_system_v41_contract.test.mjs
node --check frontend/public/hipico-control/sw.js
node --test tests/github_pages_deploy_contract.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/public/hipico-control .github/workflows tests
git commit -m "ci(hipico): ship and gate ui system v4.1"
```

---

### Task 8: Exact-SHA verification, diff review, PR and merge readiness

**Files:**
- No planned product changes; only fixes discovered by evidence are allowed.
- Evidence/artifacts are generated by existing scripts/workflows, not hand-authored as PASS claims.

**Interfaces:**
- Consumes: completed branch candidate SHA.
- Produces: verified PR candidate with explicit VERIFIED/NOT VERIFIED/BLOCKED status.

- [ ] **Step 1: Rebase/update branch only if `main` advanced**, then record the new exact candidate SHA. If code changes due to conflict resolution, re-run all relevant verification against the new SHA.

- [ ] **Step 2: Run repository validation proportional to scope**

Run at minimum:
```bash
npm ci
node --test tests/hipico_ui_system_v41_contract.test.mjs tests/hipico_presentation_preferences_v41.test.mjs tests/hipico_icon_action_contract_v41.test.mjs tests/hipico_pwa_ui_v41_delivery.test.mjs
npm run test:hipico:visual-contract
npx playwright test qa/hipico-visual-functional-v106.spec.mjs --project=chromium --workers=1
npx playwright test qa/hipico-ui-v41-visual.spec.mjs --project=chromium --workers=1
npm run build:frontend
npm run test:hipico
```

Also run `npm run lint` / exact local gate if repository time/resource constraints permit; report anything not executed as `NOT VERIFIED`, not PASS.

- [ ] **Step 3: Review final diff** against baseline `3295bdeb7add7b0962f549887287606f7448993d`; confirm no financial/auth/persistence/WhatsApp business logic changed unintentionally, no secrets/assets duplication, no dead CSS/JS authority, and no legacy wordmark runtime references.

- [ ] **Step 4: Create PR** with baseline/final SHA, root causes, solution map, acceptance checklist, commands/results, visual evidence, PWA delivery notes, security/non-functional impact, and explicit infrastructure blockers.

- [ ] **Step 5: Inspect exact-PR CI for the candidate SHA**. For every failed job, read only that run's jobs/logs/artifacts, document test/line/expected/received/root cause, make the minimum fix, push a new SHA and repeat verification.

- [ ] **Step 6: Merge only after code-level gates are green or external infrastructure is clearly separated as `BLOCKED_INFRASTRUCTURE` under the project's local-first policy**. Never label queued/unexecuted remote checks PASS.

- [ ] **Step 7: After merge, verify `main` merge SHA and GitHub Pages deployment/live asset revision** before declaring the redesign live. If deployment remains queued/blocked, report `PARTIAL / BLOCKED_INFRASTRUCTURE` and keep monitoring separately.
