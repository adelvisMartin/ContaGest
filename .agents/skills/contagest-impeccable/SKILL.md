---
name: contagest-impeccable
description: Project-owned wrapper for pinned Impeccable UI critique and polish guidance after functionality and geometry are stable.
contractVersion: 2
---

# ContaGest Impeccable

## Trigger
Deliberate UI critique, polish, responsive refinement, visual hierarchy and UX-writing refinement after the affected workflow and core geometry are stable.

## Non-trigger
Broken workflows, missing persistence, unresolved accessibility defects, early architecture work or any request whose primary goal is not UI polish.

## Authority
Explicit owner instruction + `AGENTS.md`; canonical project UI/functionality sources; `contagest-ui-audit` and `contagest-functional-module-audit`; then the pinned Impeccable reference.

## Source of truth
Exact candidate source, canonical visual owner/tokens/components and executed functional/browser evidence for the affected workflow.

## Graphify probes
May locate neighboring UI components and shared primitives only. Graph/navigation output cannot establish polish quality or functional correctness.

## Inputs
Exact candidate SHA, stable route/component, known functional workflow, current canonical styles/tokens and the specific polish objective.

## Invariants
- Impeccable never becomes a parallel design-system authority.
- It never replaces functional QA, persistence evidence, accessibility or domain validation.
- Preserve canonical light/dark geometry, complete labels, touch/focus behavior and project operational density.
- Control Hipico workflow, SOURCE/LAB, permissions and operational semantics always win.
- Never hide defects with truncation, animation or decorative state.
- Upstream commands/scripts are not implicitly executable.

## Workflow
1. Verify workflow and geometry stability.
2. Define one concrete usability/visual objective.
3. Apply only recommendations compatible with canonical components/tokens.
4. Review responsive, keyboard, focus, contrast, reduced-motion and relevant loading/error/empty states.
5. Bind evidence to the candidate SHA.

## Negative tests
Check that polish does not hide labels/errors/actions, break focus/keyboard/touch, introduce overlap/overflow, alter domain meaning, create another style owner or mask a failed workflow.

## Stop conditions
Stop when functionality/geometry is unstable, a second design authority would be introduced, domain semantics would change, upstream execution is required or mandatory risk skills would be displaced.

## Verification
Use source/static/build/browser evidence proportional to the change. A polished screenshot or subjective critique is never a functional PASS.

## Output schema
Report polish objective, affected routes/components, canonical owners reused, recommendations applied/rejected, verification status and residual risk.

## References
`AGENTS.md`, `contagest-ui-audit`, `contagest-functional-module-audit`, pinned `impeccable` source in `agent-skills.lock.json`.
