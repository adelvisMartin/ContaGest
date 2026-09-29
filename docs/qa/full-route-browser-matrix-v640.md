# Full Route Browser Matrix v640

Issue: #640.

## Authority

The route list is not duplicated. `qa/support/module-visual-catalog.mjs` remains the canonical 58-route source and `qa/support/full-route-browser-contract-v640.mjs` derives the browser contract from it.

The matrix defines the transversal requirements consumed by the runner: responsive widths 360/390/430/768/1024/1366/1440/1920, light/dark/system, normal/reduced motion, zoom 100/200, keyboard/focus, deep-link/refresh, long text/Unicode, async states where applicable, and no overflow/overlap/clipping/occlusion or console/page errors.

## Profiles

- `npm run qa:browser:routes:affected`: Chromium, routes inferred from changed page files or supplied through `CG_AFFECTED_ROUTES`.
- `npm run qa:browser:routes:full`: full Chromium gate for all 58 routes.
- `npm run qa:browser:routes:firefox`: full Firefox advisory profile.
- `npm run qa:browser:routes:webkit`: full WebKit Safari + iPhone advisory profile.
- `npm run verify:local -- --profile ui-routes --expected-sha <sha>`: #630 integration, frontend build followed by the full Chromium route matrix.

`CG_BASE_REF` defaults to `main`. Shared shell/component/design-system/QA changes intentionally expand `affected` to all 58 routes; page-local changes resolve through `PAGE_REGISTRY`. If no deterministic route can be inferred, affected mode fails safe to critical routes rather than doing nothing.

## Reuse instead of duplication

Chromium full delegates the established `erp-browser-58x5-v251.mjs` campaign and then executes the existing WCAG and contrast specs. Affected and advisory-browser modes reuse `exhaustive-route-v164.spec.mjs`, `erp-visual-overlap-v6175.spec.mjs`, `accessibility-wcag22-v99.spec.mjs`, and `contrast-v15.spec.mjs` with route/browser selection. No new browser spec duplicates those contracts.

## Evidence

Every invocation writes a machine-readable manifest under `artifacts/browser-matrix/` with mode, browser, selected routes and per-group PASS/FAIL/BLOCKED status. Playwright itself retains traces/screenshots/video on failure according to the existing root config.

A provider job that receives no runner/steps is `BLOCKED_INFRASTRUCTURE/NOT_EXECUTED`, never PASS. Firefox/WebKit are advisory unless a ticket explicitly promotes them to a required gate.

## Prohibited shortcuts

The v640 runner contains no `waitForTimeout`, forced interaction, or skip-to-green behavior. Fixtures and real runtime behavior remain owned by the existing browser suites; this ticket only consolidates route selection, profiles and evidence.
