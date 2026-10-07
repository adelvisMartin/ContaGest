---
name: contagest-apple-design
description: Project-owned wrapper for pinned Apple-design guidance, adapted to dense ERP utility interfaces without creating an Apple-branded or second visual authority.
contractVersion: 3
---

# ContaGest Apple Design Review

## Trigger
Use for an explicit `apple-design-review` intent on UI/design-system audits, interaction/state reviews, responsive refinement, accessibility review, perceived-performance review or premium-product polish in ContaGest.

## Non-trigger
Pure backend/database work; ordinary UI tickets that do not request this lens; marketing scrollytelling; copying Apple branding/assets; or introducing glass/motion merely for decoration.

## Authority
`AGENTS.md` and the canonical ContaGest visual/functionality contracts are permanent authority. `contagest-ui-audit` and `contagest-functional-module-audit` outrank this wrapper. The pinned Apple-design source is advisory only.

## Reviewed upstream scope
Use the pinned `apple-design-skills` source only for:
- `apple-design`: restraint, clarity/deference/depth and utility-vs-flagship surface classification;
- `apple-design-foundations`: semantic color, typography, spacing/grid, adaptive layout and touch sizing;
- `apple-design-interaction`: navigation, loading/empty/error/disabled/success, perceived performance, focus/keyboard/input and plain utility scrolling;
- `apple-design-motion`: interruptible feedback, transform/opacity discipline and reduced-motion fallback;
- `apple-design-tactics`: accessibility/inclusive-design guidance.

Do **not** route `apple-design-backend` as architecture authority: its own source labels substantial backend material inferred/speculative. Do not make `apple-design-web`, OS-specific component anatomy, Liquid Glass or SF Symbols a ContaGest requirement.

## ERP adaptation invariants
- ContaGest is a utility/productivity ERP: task completion, density, legibility and predictable native scrolling outrank cinematic presentation.
- No scroll-jacking or flagship scrollytelling in operational routes.
- No global glass, gradients, decorative blur, Apple clone chrome or second component/CSS authority.
- Preserve the project light/dark geometry and semantic tokens; external color/font recipes are suggestions only.
- Maintain complete financial/RIF/document values and operational labels; never trade meaning for minimalism.
- Touch targets remain at least 44px where touch interaction applies; keyboard/focus remains first-class.
- Design loading, empty, error, disabled and success states with recovery paths.
- Motion is subtle, interruptible, `transform`/`opacity`-oriented and must honor `prefers-reduced-motion`.
- External marketing/persuasion guidance cannot change fiscal, legal, security, clinical or accounting meaning.

## Workflow
1. Resolve exact candidate SHA, affected routes/components and canonical visual owner.
2. Run `contagest-ui-audit` / functional workflow review first.
3. Classify the surface: operational utility by default; flagship only when the route truly is marketing/onboarding.
4. Review information hierarchy, spacing, typography, semantic color, touch/focus, navigation and all interaction states.
5. Review perceived performance and feedback without masking real latency or errors.
6. Review motion only after geometry and workflow are stable.
7. Record upstream recommendations that were rejected because project/domain policy outranks them.
8. Verify with the project browser/responsive/accessibility gates required by the risk route.

## Negative tests
Check: decorative effect overload; glass on cards/content; hidden/truncated operational meaning; spinner-only workflows; missing empty/error/disabled recovery; targets below 44px on touch surfaces; missing visible focus; keyboard traps; document-level overflow; layout failure at 360/390/430; light/dark geometry drift; scroll-jacking; motion without reduced-motion fallback; hardcoded color that bypasses canonical tokens.

## Stop conditions
Stop when external guidance would create a second visual authority, weaken density/functionality/accessibility, alter domain semantics, introduce Apple copyrighted assets/branding, execute upstream installers/scripts, or rely on inferred/speculative material as verified architecture.

## Verification
Source review is advisory evidence, not browser PASS. For shipped UI changes use the project-required static/build/browser/function/a11y matrix and bind PASS to the exact candidate SHA.

## Output schema
Affected routes/components; canonical owner; surface classification; Apple-lens findings; accepted recommendations; rejected conflicts; severity; verification status/evidence; residual risk/follow-ups.

## References
`AGENTS.md`; `.agents/skills/contagest-ui-audit/SKILL.md`; `.agents/skills/contagest-functional-module-audit/SKILL.md`; pinned source `apple-design-skills` in `agent-skills.lock.json`.
