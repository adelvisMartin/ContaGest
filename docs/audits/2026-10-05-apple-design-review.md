# ContaGest · Apple Design Review · 2026-10-05

Candidate branch: `feat/agent-ticket-automation-skills`

Source-review SHA at audit start: `b2474151e2db5237af9ace275fda41ddc9119b75`

## Scope

This is a source-grounded review using the project-owned `contagest-apple-design` wrapper. The pinned upstream source is advisory only. `AGENTS.md`, the ContaGest visual benchmark, canonical components/styles, functional workflows and project accessibility/domain rules remain authoritative.

The ERP is classified as a **utility/productivity surface**, not a flagship marketing surface. Therefore the review favors clarity, hierarchy, state completeness, touch/focus behavior, perceived performance and restraint. Cinematic scrollytelling, global glass, Apple branding/assets and OS-specific imitation are explicitly out of scope.

## Overall assessment

ContaGest has a comparatively strong visual-governance foundation: one declared CSS authority, semantic tokens, light/dark geometry parity, 4/8-point spacing, explicit mobile breakpoints, 44px touch enforcement, visible focus, reduced-motion handling, route cataloging and dedicated static/function/browser gates.

The main weakness is not visual taste. It is **contract drift between routing/catalog/UI primitives and newly added screens**, which can create interfaces that look consistent while silently missing validation or QA coverage.

## Findings

### P1 · QA route matrix is stale: 59 registry routes vs 58 visual-catalog routes

`frontend/src/data/pageRegistry.js` contains `sedes`, while `qa/support/module-visual-catalog.mjs` does not. Current source therefore has 59 registered routes but the canonical visual catalog still covers 58.

Impact:
- `sedes` is outside the intended 58-view visual/function audit matrix;
- route/catalog parity is false;
- a newly added operational route can miss browser coverage while documentation still claims 58 canonical routes.

Recommendation: add `sedes` to the catalog with the correct family/priority, update the documented route count, and run the affected/full route matrix.

### P1 · `BusinessLocationsPage` requests field behavior that the canonical primitives do not implement

The page calls:
- `Field(... disabled:Boolean(selected))` for the stable location code;
- `Select(... required:true)` for timezone.

The canonical `Field` and `Select` signatures in `frontend/src/components/ui/kit.js` do not accept those properties. As a result, the intended disabled/required behavior is not emitted by those helpers.

Impact:
- edit mode can expose a supposedly stable code as editable in the rendered control;
- timezone requiredness can be weaker than the page source implies;
- static audits may see `required:true` in source and overestimate actual rendered validation.

Recommendation: extend the canonical primitives with explicit `disabled`, `required`, `aria-*`/validation-state support and add regression tests at the primitive + page level.

### P2 · Technical identifier leaks into the user-facing `sedes` form

`BusinessLocationsPage` exposes `AddressGeocode ID` with a UUID-oriented placeholder. This conflicts with the project rule that technical IDs are not human labels when a display identity can exist and with the Apple review principle of deferring implementation detail from the primary task.

Recommendation: replace the raw ID field with an address/search/selector workflow that stores the ID internally. If no human representation exists yet, mark it as an admin-only technical fallback rather than normal operational UI.

### P2 · Canonical state primitives are incomplete

The canonical kits expose strong page/header/button/table/field/empty-state primitives, but there is no equally explicit shared primitive contract for:
- loading/skeleton/progressive loading;
- recoverable error state;
- success/confirmation state;
- disabled state with an explanatory reason.

The function audit detects `Loading`, `Toast`, `catch` and validation signals, which is useful, but signal presence does not guarantee consistent state UX.

Recommendation: add canonical state primitives/contracts and then migrate only where current routes duplicate or omit those behaviors. Do not create a second design system.

### P2 · Typography is controlled but not strongly user-scalable by design token

The canonical visual system uses a disciplined scale, but much of it is fixed in `px`, including small 8–12px metadata, often with `!important`. Browser zoom still scales pixels, so this is not automatically a WCAG failure, but the system lacks a clear project-level equivalent of Dynamic Type/user text scaling.

Recommendation: verify 200% zoom/text enlargement on critical routes and consider rem/clamp-based semantic typography where it can be introduced without reducing ERP density or breaking monetary/document layouts.

### P3 · Motion does not need to become more “Apple-like”

ContaGest uses short utility transitions and globally honors `prefers-reduced-motion`. The pinned Apple source prefers spring/interruptible motion, but the project is an operational ERP and explicitly prioritizes density and predictability.

Recommendation: keep current restraint. Use spring/interruptible feedback only when it improves a concrete interaction; do not add cinematic motion or scroll-progress effects to operational routes.

## Strong alignment already present

- Semantic visual tokens for surface/text/border/brand/status instead of page-local color ownership.
- 4px/8px spacing scale and compact information hierarchy.
- Light/dark use the same geometry.
- Operational routes explicitly forbid gradients/glass/decorative blobs.
- Safe-area variables are present in the shell contract.
- At <=1023px shell interaction controls are raised to the shared 44px touch token; at <=760px operational inputs/buttons receive the same minimum touch height.
- Visible `:focus-visible`, forced-colors support and `prefers-reduced-motion` handling exist in the canonical visual layer.
- Sidebar navigation is mode-scoped and prioritizes a small set of primary routes rather than exposing the whole ERP at once.
- The QA architecture is unusually explicit: route catalog, visual static audit, function audit, a11y/contrast browser tests and a 58-view browser runner.

## Apple guidance intentionally rejected for ContaGest

The following upstream ideas are **not** project requirements:
- global Liquid Glass / translucent cards;
- Apple branding, assets or SF Symbols as a design dependency;
- defaulting to the Apple system font stack over the current canonical typography decision;
- flagship scrollytelling/pinned cinematic scenes in ERP routes;
- inferred/speculative Apple backend architecture;
- replacing dense ERP tables/forms with marketing-style minimal surfaces.

## Recommended follow-up order

1. Fix `sedes` route/catalog parity and restore complete QA coverage.
2. Fix canonical `Field`/`Select` prop contracts and add regression tests for disabled/required behavior.
3. Remove/replace raw `AddressGeocode ID` from the normal operational form.
4. Define one canonical state contract for loading/error/success/disabled-reason and audit adoption by critical routes.
5. Execute `audit:visual:strict`, `audit:functions:strict`, `test:visual`, a11y/contrast and the full browser route matrix on the final candidate SHA.
6. Only after those are green, use Apple/Impeccable/UI-UX-Pro-Max for lower-priority visual polish.

## Evidence status

- `SOURCE_REVIEW`: VERIFIED for the cited candidate source and pinned Apple-design material.
- `LOCAL_STATIC`: NOT_EXECUTED as a repository command in this runtime; source contracts were inspected through GitHub.
- `LOCAL_BUILD`: NOT_EXECUTED.
- `LOCAL_BROWSER_E2E`: NOT_EXECUTED.
- `REMOTE_CI`: NOT_EXECUTED for this branch at audit time.

No browser/build/CI PASS is claimed by this report.
