---
name: contagest-copywriting
description: Project-owned wrapper for pinned MarketingSkills copywriting guidance for product and interface copy without changing domain meaning.
contractVersion: 3
---

# ContaGest Copywriting

## Trigger
Use for product/interface copy such as labels, CTA text, onboarding, helper text, empty/error states, feature explanations and public-facing marketing copy for ContaGest or Control Hipico.

## Authority
Explicit owner instruction + `AGENTS.md`; project terminology and domain contracts; applicable legal/fiscal/clinical/security/product authorities; then the pinned Copywriting guidance. Copy quality never outranks semantic correctness.

## Inputs
Exact candidate SHA or copy artifact, audience/context, current project terminology, intended action/outcome and any regulated/domain constraints.

## Invariants
- Never rewrite accounting, tax, legal, clinical, privacy, security, tenant/RBAC, subscription or audit semantics for persuasion.
- Never invent compliance certifications, tax/legal guarantees, medical outcomes, pricing promises or capabilities the product does not implement.
- Preserve human-readable operational meaning and existing canonical entity/action names unless the owning domain explicitly changes them.
- Control Hipico race/player/bet/result/source terminology and permission/SOURCE-LAB semantics remain authoritative.
- Error/help text must not expose secrets, internal identifiers or sensitive data.

## External reference policy
Use only `skills/copywriting/SKILL.md` from the `marketing-copywriting` source pinned in `agent-skills.lock.json`. Other MarketingSkills modules, scripts and tools are outside this wrapper unless separately reviewed and integrated.

## Workflow
1. Establish the real audience, action and current product/domain meaning.
2. Identify copy goals without changing behavior or promises.
3. Apply concise, specific language using project terminology.
4. Review for accessibility, localization/context and regulated-domain accuracy.
5. When copy ships with code, validate the affected UI/workflow on the candidate SHA; copy review alone is not functional evidence.

## Stop conditions
Stop when the requested copy would make unsupported claims, obscure risk/fees/permissions, change regulated meaning, expose sensitive information or require an unreviewed external marketing module.

## References
`AGENTS.md`, project domain contracts, `contagest-erp-orchestrator`, pinned source `marketing-copywriting` in `agent-skills.lock.json`.
