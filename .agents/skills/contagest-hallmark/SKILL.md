---
name: contagest-hallmark
description: Hallmark UI audit for ContaGest/Control Hípico, advisory only under canonical functional, visual and accessibility contracts.
contractVersion: 2
---

# Hallmark · source-grounded design review

## Trigger
Explicit `hallmark-audit` for critique or audit of an existing UI route.

## Non-trigger
Never auto-redesign business screens, invent brand themes, change copy/data or introduce an alternate design authority.

## Authority
`AGENTS.md`, the six canonical ContaGest CSS owners, Hípico domain rules, accessibility, security and working UI actions outrank Hallmark.

## Source of truth
Actual route/component code, stable UI state, rendered light/dark browser behavior and pinned `hallmark` documentation in `agent-skills.lock.json`.

## Graphify probes
Optional navigation only, not proof of business or browser behavior.

## Inputs
Route, visual owner, current screenshots, candidate SHA, functional baseline, theme/mobile/focus evidence.

## Invariants
Preserve UI→API→persisted response, auth/tenant, labels, native controls, empty/loading/error/success states, focus order, reduced motion, no document overflow and no invented metrics.

## Workflow
1. Read `contagest-ui-audit` and `contagest-functional-module-audit`.
2. Materialize pinned Markdown with `npm run skills:sync`, read `.agents/vendor/hallmark/skills/hallmark/SKILL.md` and its `references/patterns.md`, `interaction-and-states.md`, `responsive.md`.
3. Rank verifiable UI problems; reject recommendations that conflict with project contracts. Implement only authorized minimal corrections in canonical visual owners.
4. Verify actual browser flow, keyboard, focus, reduced motion, contrast, light/dark and 360/390/430/768/1024/1440 layouts.

## Negative tests
Missing focus, non-functional actions, duplicate submits, invented figures, overflow, inaccessible motion, external scripts and unapproved alternate CSS.

## Stop conditions
Any conflict with existing behavior, security, canonical visual ownership or missing exact-SHA runtime evidence.

## Verification
`npm run test:skills:ui` checks admission/routing/workflows. Real UI changes still need Playwright and functional QA on the same SHA; source inspection is not runtime PASS.

## Output schema
Route; current issue; proposed/final change; visual owner; accepted/rejected reference; SHA; executed gates/status; risks.

## References
`AGENTS.md`, `contagest-ui-audit`, `contagest-functional-module-audit`, `contagest-motion`, `docs/QA_AUTOMATIZADO_CONTAGEST_HIPICO.md`.

Only upstream Markdown references are pinned. Hallmark's scripts, hooks, CLI, installs and external API generation remain intentionally disabled.
