# ContaGest UX Theme, State & Accessibility Contract v1

Issue: #645.

## Authority

`frontend/src/design-system/uxContract.v1.js` is the executable authority for theme preference resolution, required UI states, accessibility expectations and QA failure codes. Component tests and browser QA consume that contract; they must not maintain competing state/theme lists.

The semantic color authority remains `frontend/src/design-system/semanticTokens.v1.js` from #631. This contract does not define a second palette or theme provider.

## Theme contract

Allowed persisted preferences are `light`, `dark`, and `system`. Unknown values normalize to `light`. `system` resolves from `(prefers-color-scheme: dark)` through the shared `resolveThemeMode()` function. Store persistence remains scoped by tenant and user; no new cross-tenant preference store is introduced.

DOM theme application, MUI islands and React/Cg surfaces use the same resolver. Semantic colors, borders, focus and feedback come from the canonical tokens.

## UI state matrix

| Surface kind | Required states when applicable |
| --- | --- |
| async-surface | idle, loading, empty, no-results, success, warning, error, permission-denied, offline-stale, retry-recovery |
| form | idle, success, warning, error, disabled, readOnly, permission-denied, offline-stale, saving-submitting, retry-recovery |
| overlay | idle, disabled, saving-submitting, error |
| data | idle, loading, empty, no-results, error, permission-denied, offline-stale, retry-recovery |
| action | idle, disabled, saving-submitting, success, warning, error |

A state that genuinely does not apply is recorded as `NOT_APPLICABLE` with a reason. An omitted state without a reason is `MISSING_UI_STATE`.

## Accessibility contract

- Controls have programmatic names; icon-only controls require an accessible label.
- Keyboard-only paths remain complete and tab order follows visual/task order.
- Focus is visibly rendered from the semantic focus token.
- Dialogs/overlays keep focus trap and focus restoration through MUI/native overlay semantics; Escape closes unless an in-progress destructive/save contract explicitly blocks closure.
- Field errors and helper text are referenced by the owning input. No dangling `aria-describedby` IDs.
- Feedback is never encoded by color alone.
- Reduced-motion collapses non-essential animation/transition duration without removing state changes.
- Content must reflow at 200% zoom without horizontal page overflow for the tested pilot widths.
- Body/control text contrast is WCAG 2.2 AA where applicable.
- Touch controls in the mobile contract target at least 44 px.
- Data tables expose headers; interactive rows preserve keyboard activation semantics.

## Canonical state components

`frontend/src/components/vnext/states.js` owns the reusable state representation:

`CgUiState`, `CgLoadingState`, `CgEmptyState`, `CgNoResultsState`, `CgSuccessState`, `CgWarningState`, `CgErrorState`, `CgPermissionState`, `CgOfflineState`, `CgSavingState`, and `CgRetryState`.

Data components delegate no-results/retry presentation to these primitives rather than maintaining a parallel state vocabulary.

## Do / don't

Do consume semantic tokens and `UX_CONTRACT_V1`; use the canonical state components; give errors stable IDs; leave authorization/business rules outside presentation components; and record browser/runtime limitations separately from code quality.

Don't hardcode a route-local palette, create another theme resolver, remove focus outlines, use sleeps/force/skips to obtain green QA, encode state only by color, or call an unexecuted browser/provider check PASS.

## Browser pilot

`scripts/ux-contract-browser-v645.mjs` runs the deterministic contract against `frontend/public/ux-contract-v645.html` in local headless Chromium across light/dark/system and desktop/mobile widths, including a 200% zoom profile and a reduced-motion profile. It validates visible focus, Escape close/focus restoration, contrast, state representation, touch target and page overflow.

If Chromium is absent the runner exits with `BLOCKED_BROWSER_RUNTIME`; that is not PASS. The same requirements are intended for consumption by #640's full-route matrix.

## QA failure taxonomy

The machine-readable contract includes:

`THEME_AUTHORITY_DUPLICATE`, `MISSING_UI_STATE`, `FOCUS_NOT_VISIBLE`, `FOCUS_TRAP_BROKEN`, `KEYBOARD_PATH_BLOCKED`, `ACCESSIBLE_NAME_MISSING`, `CONTRAST_BELOW_CONTRACT`, `ZOOM_REFLOW_FAILURE`, `REDUCED_MOTION_IGNORED`, `ERROR_NOT_ASSOCIATED`, `TOUCH_TARGET_BELOW_CONTRACT`, and `STATE_ONLY_BY_COLOR`.
