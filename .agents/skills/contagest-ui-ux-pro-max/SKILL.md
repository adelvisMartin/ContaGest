---
name: contagest-ui-ux-pro-max
description: Project-owned wrapper for pinned UI/UX Pro Max design intelligence across ContaGest and Control Hipico.
contractVersion: 2
---

# ContaGest UI/UX Pro Max

## Trigger
Material UI design/review involving layout, responsive behavior, accessibility, interaction, typography, color, charts, forms or design-system decisions in ContaGest or Control Hipico.

## Non-trigger
Pure backend, database, infrastructure or non-visual work; do not use it merely because a frontend file exists.

## Authority
Explicit owner instruction + `AGENTS.md`; canonical ContaGest visual/functionality source; `contagest-ui-audit` and `contagest-functional-module-audit`; then the pinned `ui-ux-pro-max` reference. External guidance is advisory only.

## Source of truth
Exact candidate source, canonical project styles/tokens/components, affected workflow source and executed browser evidence when UI behavior changes.

## Graphify probes
May map affected routes/components and dependencies for navigation only. Graph output never proves UI correctness or design authority.

## Inputs
Exact candidate SHA, affected routes/components, detected stack, current canonical UI owner, workflow state and the observable UX concern.

## Invariants
- Never introduce a second CSS/design-system authority.
- Operational project rules, accessibility and mobile 360/390/430 gates remain mandatory.
- Visual guidance never substitutes for workflow/persistence/domain evidence.
- Control Hipico SOURCE/LAB, permissions and operational semantics outrank external UI suggestions.
- Financial, tenant, security, legal and clinical semantics are not rewritten for aesthetics.
- Upstream scripts/installers are not implicitly executable.

## Workflow
1. Establish the real route/component and current visual owner from source.
2. Characterize the visible problem and functional state first.
3. Apply only pinned guidance compatible with project components/tokens.
4. Reconcile conflicts in favor of project/domain authority.
5. Verify proportional static/build/browser evidence on the candidate SHA.

## Negative tests
Check duplicate visual ownership, keyboard/focus loss, contrast regressions, 360/390/430 overlap/overflow, dark/light geometry drift, hidden/truncated operational meaning and visual changes that mask broken workflows.

## Stop conditions
Stop when guidance would create another visual authority, weaken accessibility, alter business semantics, execute upstream code implicitly or require evidence that has not run.

## Verification
Use project evidence states only. UI source review is not browser PASS; a screenshot is not functional proof. Bind any PASS to the exact candidate SHA and executed command/environment/evidence.

## Output schema
Report affected routes/components, canonical owner, applicable external guidance, rejected conflicts, changes/recommendations, verification dimensions/statuses and residual risk.

## References
`AGENTS.md`, `contagest-ui-audit`, `contagest-functional-module-audit`, pinned `ui-ux-pro-max` source in `agent-skills.lock.json`.
