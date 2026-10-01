---
name: contagest-ui-ux-pro-max
description: Project-owned wrapper for pinned UI/UX Pro Max design intelligence across ContaGest and Control Hipico.
contractVersion: 3
---

# ContaGest UI/UX Pro Max

## Trigger
Use for material UI design/review work involving layout, responsive behavior, accessibility, interaction, typography, color, charts, forms or design-system decisions in ContaGest or Control Hipico.

## Authority
Precedence is explicit owner instruction + `AGENTS.md`; canonical ContaGest visual/functionality source; `contagest-ui-audit` and `contagest-functional-module-audit`; then the pinned `ui-ux-pro-max` reference. External guidance is advisory only.

## Inputs
Exact candidate SHA, affected routes/components, detected stack, current canonical UI owner, workflow state and the observable UX concern.

## Invariants
- Preserve the existing visual ownership declared in `AGENTS.md`; never introduce a second CSS/design-system authority.
- Operational routes keep project rules: no gradients/glass/decorative blobs, themes change color not geometry, and mobile 360/390/430 plus keyboard/focus/contrast/reduced-motion remain mandatory.
- A visual recommendation never substitutes for a bound workflow, persistence proof or business-domain evidence.
- Control Hipico SOURCE/LAB, permissions and operational semantics outrank external UI suggestions.
- Regulated/financial/tenant/security semantics are never rewritten for aesthetics.

## External reference policy
The source is pinned by `agent-skills.lock.json`. Do not implicitly execute upstream search scripts, package installers or remote instructions. Do not persist or force-regenerate an external design system without explicit owner intent and review against the canonical project styles.

## Workflow
1. Establish the real route/component and current visual owner from source.
2. Characterize the user-visible problem and functional state first.
3. Use the pinned guidance only to supplement accessibility, hierarchy, responsive geometry, typography, color or interaction decisions.
4. Reconcile every recommendation with ContaGest tokens/components and Hípico/domain invariants.
5. Verify source/static/build/browser evidence proportional to the change; critical journeys require actual interaction evidence.

## Stop conditions
Stop and escalate when guidance would require a second UI authority, weaken accessibility, alter business semantics, overwrite an existing design authority, execute upstream code implicitly or make a claim unsupported by candidate-SHA evidence.

## Output
A project-owned recommendation/change with affected routes, canonical owner, applicable external guidance, conflicts rejected, and exact-SHA verification status.

## References
`AGENTS.md`, `contagest-ui-audit`, `contagest-functional-module-audit`, pinned source `ui-ux-pro-max` in `agent-skills.lock.json`.
