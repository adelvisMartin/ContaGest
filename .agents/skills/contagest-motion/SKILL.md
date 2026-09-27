---
name: contagest-motion
description: Applies deliberate motion, timing and transitions to ContaGest without harming ERP productivity or accessibility.
contractVersion: 2
---

# ContaGest Motion

## Trigger
UI motion, transition, animation, overlay/drawer/modal timing or interaction-polish changes.

## Non-trigger
Do not add motion merely for decoration or before the underlying workflow is behaviorally stable.

## Authority
Accessibility, native browser/form behavior and canonical UI ownership outrank external motion references.

## Source of truth
Rendered browser behavior, canonical ContaGest styles/components and accessibility/runtime tests.

## Graphify probes
Optional for locating component/style owners; not needed for simple local motion changes and never proof of runtime behavior.

## Inputs
Affected component/route, interaction causality, focus owner, viewport/device, reduced-motion state and candidate SHA.

## Invariants
Motion explains hierarchy/state/causality; prefer transform/opacity; dense ERP actions stay fast; consistent easing/direction; never remount/move focused inputs due background changes; no global pointer cancellation; honor reduced motion; avoid autoplay decorative motion in accounting/login/medical/destructive flows.

## Workflow
Characterize interaction; identify one motion owner; implement minimal transform/opacity transition; verify enter/exit pair, focus/native behavior, responsive performance and reduced-motion fallback.

## Negative tests
Keyboard navigation, `prefers-reduced-motion`, focus retention, duplicate submit during transition, layout shift and mobile performance.

## Stop conditions
Focus loss, native-control cancellation, inaccessible reduced-motion state, duplicate action, material layout shift or motion that delays critical ERP work.

## Verification
Execute affected browser interaction with keyboard and reduced-motion coverage; source inspection alone is not runtime PASS.

## Output schema
Affected route/control; motion purpose; timings; accessibility checks; `STATUS`; evidence; residual risk.

## References
`AGENTS.md`, pinned `emil-motion`, `contagest-ui-audit`, `contagest-functional-module-audit`.
