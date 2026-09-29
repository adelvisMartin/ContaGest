# Control Hípico UI System v4.1 Implementation Plan

> Implementation authority: `docs/superpowers/specs/2026-09-29-hipico-frontend-design-system-v4-design.md` plus `docs/superpowers/specs/2026-09-29-hipico-frontend-design-system-v4.1-shell-amendment.md`.

## Delivery state — 2026-09-29

Implementation completed on `feat/hipico-ui-system-v4` and reconciled with current `main` before merge review.

Delivered scope:
- canonical typography, density, spacing, radii and semantic palette for Control Hípico;
- light/dark/system presentation authority with persisted local preference and no theme flash;
- full-width desktop workspace across primary views;
- collapsible desktop sidebar (224px expanded / 66px collapsed) with persisted state;
- global operations header with quick actions, theme and configuration/help access;
- canonical SVG icon actions without introducing a parallel MUI/icon authority;
- legacy horse wordmark removed from rendered shell authority;
- desktop controls normalized to the v4 compact scale while touch controls preserve 44px targets;
- Playwright shell contracts for full-width layout, sidebar behavior/persistence, theme menu, branding, density, touch targets and exact-SHA screenshot evidence;
- PWA shell/cache revision updated so v4 CSS/JS assets are available offline;
- Hípico workflow updated to include the v4.1 contracts and browser suite.

Verification policy:
- repository local-first policy applies while GitHub-hosted runners remain queued without an assigned runner;
- queued or unexecuted remote checks are `BLOCKED_INFRASTRUCTURE` / `NOT_EXECUTED`, never PASS;
- merge review must use the exact final branch SHA, inspect the source/diff, confirm no unresolved conflict with current `main`, and preserve the existing Hípico functional/data contracts.

## Implementation tasks

### 1. Canonical tokens and density
1. Keep the shared semantic-token authority as the source of common primitives.
2. Layer the Hípico v4 semantic aliases without creating a second global design-system authority.
3. Keep `app.css` as the stable entry point, with compatibility rules isolated from the v4 layer.
4. Enforce compact desktop controls and 44px coarse-pointer targets.

### 2. Theme and branding
1. Resolve theme from one persisted presentation preference (`system`, `light`, `dark`).
2. Apply theme before app paint to avoid a visible flash.
3. Expose theme switching in the global shell/menu.
4. Stop rendering `logo-control-hipico.png` in the operational shell; use the compact canonical brand lockup.

### 3. Full-width shell and navigation
1. Remove centered/max-width constraints from primary operational content.
2. Implement desktop sidebar expanded/collapsed widths of 224px/66px.
3. Persist collapse state locally and restore it after reload.
4. Keep mobile navigation independent of desktop collapse state.
5. Add a global header with current context, quick capture and options access.

### 4. Icon actions and component consistency
1. Reuse/extend the existing canonical SVG registry rather than adding a parallel icon library.
2. Use icon-only controls only for recognizable utility actions and always preserve accessible labels/tooltips.
3. Keep high-consequence or ambiguous actions as icon + text.
4. Center icon and label geometry vertically and horizontally through the canonical button primitives.

### 5. View harmonization
Apply the shell/tokens consistently to dashboard, capture, WhatsApp, advanced bets, participants, history, reports/closures, POLLA and settings without changing business rules, balances, Supabase contracts, WhatsApp behavior or IndexedDB data ownership.

### 6. Playwright / QA
Required v4.1 contracts cover:
- fluid full-width content across the primary view catalog;
- sidebar collapse width, main-content expansion and persistence;
- collapsed-navigation operability;
- global options/theme behavior and persistence;
- absence of the legacy rendered wordmark;
- desktop density bounds;
- 44px touch targets;
- mobile navigation independence;
- exact-SHA light/dark screenshots for representative desktop/mobile views.

Existing anti-overlap, keyboard/focus, responsive and state-matrix coverage remains authoritative and must not be weakened with `skip`, `only`, forced interaction, arbitrary sleeps or snapshot fabrication.

### 7. PWA and CI
1. Cache all v4 shell CSS/JS required offline.
2. Rotate the shell revision when presentation assets change.
3. Run v4.1 static contracts before browser regression in the Hípico workflow.
4. Upload exact-SHA browser evidence when runners are available.

### 8. Merge gate
Before merge:
1. reconcile branch with the latest `main`;
2. confirm PR is conflict-free/mergeable;
3. review final diff/scope;
4. inspect exact-SHA workflow state;
5. classify runnerless queued checks as infrastructure-blocked rather than PASS;
6. merge under the repository local-first policy only when there is no known code-level blocker.
