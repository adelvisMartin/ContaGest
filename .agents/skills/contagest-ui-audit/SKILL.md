---
name: contagest-ui-audit
description: Senior ERP product-design, source-ownership, contrast, responsive and route-by-route audit for the canonical ContaGest visual contract.
contractVersion: 2
---

# ContaGest UI Audit

## Trigger
UI/design-system, route composition, responsive, contrast/accessibility, overflow, visual ownership or browser-state changes.

## Non-trigger
Do not replace functional/API/security verification with screenshots or add a second visual authority to patch cascade symptoms.

## Authority
Canonical project visual benchmark/styles plus accessibility/browser correctness outrank Dribbble/external inspiration. External references supply patterns, never copied brand/assets.

## Source of truth
`docs/design-system/ERP_VISUAL_BENCHMARK_V15.md`, `qa/support/module-visual-catalog.mjs`, canonical CSS/component owners and rendered browser evidence.

## Graphify probes
Use to locate route/component/style/service ownership when the real owner is unclear. It cannot prove rendered geometry or interaction.

## Inputs
Affected routes, primary task/action, CSS/component owners, viewport/theme/state matrix, role/license and candidate SHA.

## Invariants
One canonical visual owner; no page-local alternate design systems; light/dark share geometry/information order; monetary/document values remain complete; mobile document does not horizontally overflow; primary actions remain first-viewport usable; UUIDs are not human labels; focused/native controls remain usable; calendar/table/tab may own local overflow.

## Workflow
1. Find real visual owner before editing.
2. Define information architecture/primary action.
3. Verify desktop 1440/1024, tablet 768 and mobile 430/390/360.
4. Verify empty/one/many, loading/error/disabled, long content, keyboard/focus/contrast/reduced motion.
5. Execute the primary workflow; beautiful dead forms fail.
6. Remove superseded style/markup and rerun source/browser gates.
Route families retain their documented composition: compact dashboard metrics; dense finance workbenches; dedicated settings workspace; calendar/list-first health; member/routine-first gym; visible cart/order state for POS/delivery.

## Negative tests
Document overflow, clipping/occlusion, long monetary/RIF/name content, keyboard/focus loss, reduced motion, mobile touch targets, duplicate headers/owners, raw UUID labels and permission/error states.

## Stop conditions
Second visual authority, document-level overflow, inaccessible contrast/focus, hidden primary action, dead primary workflow or UI change that alters financial/security semantics.

## Verification
Run `npm run audit:visual:strict`, `npm run audit:functions:strict`, `npm run test:visual` and routed browser visual/functional/a11y gates. Only `PASS|FAIL|BLOCKED|NOT_EXECUTED`.

## Output schema
Routes; primary task/action; viewports/themes/states; source owner; source/browser gate results; defects/severity; evidence; rollback.

## References
`AGENTS.md`, `docs/design-system/ERP_VISUAL_BENCHMARK_V15.md`, `contagest-functional-module-audit`, `contagest-motion`.
