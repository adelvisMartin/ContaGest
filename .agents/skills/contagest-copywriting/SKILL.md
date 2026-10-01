---
name: contagest-copywriting
description: Project-owned wrapper for pinned MarketingSkills copywriting guidance for product and interface copy without changing domain meaning.
contractVersion: 2
---

# ContaGest Copywriting

## Trigger
Product/interface copy such as labels, CTAs, onboarding, helper text, empty/error states, feature explanations and public-facing marketing copy for ContaGest or Control Hipico.

## Non-trigger
Do not use to reinterpret accounting, tax, legal, clinical, privacy, security, RBAC, subscription, audit or Control Hipico operational rules, or to invent product capabilities.

## Authority
Explicit owner instruction + `AGENTS.md`; project terminology and domain contracts; applicable legal/fiscal/clinical/security/product authorities; then the pinned Copywriting guidance. Copy quality never outranks semantic correctness.

## Source of truth
Implemented product behavior, canonical project terminology/domain contracts and the exact candidate UI/content artifact being changed.

## Graphify probes
May locate where a label/message/action is rendered and its owning workflow. Graph output cannot establish semantic correctness or implemented capability.

## Inputs
Exact candidate SHA or copy artifact, audience/context, current project terminology, intended action/outcome and regulated/domain constraints.

## Invariants
- Never rewrite regulated/accounting/security/tenant semantics for persuasion.
- Never invent compliance certifications, legal/tax guarantees, medical outcomes, pricing promises or unimplemented capabilities.
- Preserve canonical entity/action names unless the owning domain changes them.
- Control Hipico race/player/bet/result/source and SOURCE/LAB/permission semantics remain authoritative.
- Error/help text must not expose secrets, internal identifiers or sensitive data.
- Only the reviewed Copywriting subset is in scope; other MarketingSkills modules remain unintegrated.

## Workflow
1. Establish audience, action and real implemented/domain meaning.
2. Define the copy goal without changing behavior/promises.
3. Apply concise, specific project terminology.
4. Review accessibility, localization/context and regulated-domain accuracy.
5. When copy ships with code, validate the affected UI/workflow on the candidate SHA.

## Negative tests
Check for unsupported capability/compliance claims, misleading CTA/error text, hidden fees/permissions/risk, terminology drift, sensitive-data exposure and copy that changes fiscal/legal/clinical/security or Hípico meaning.

## Stop conditions
Stop when requested copy would make unsupported claims, obscure risk/permissions, alter regulated meaning, expose sensitive information or require an unreviewed external marketing module.

## Verification
Review semantics against source/contracts. If code changes, bind static/build/browser evidence as appropriate; copy review alone is not functional proof.

## Output schema
Report audience/context, original semantic intent, proposed/implemented copy, project terminology preserved, regulated/domain checks, verification status and residual ambiguity.

## References
`AGENTS.md`, project domain contracts, `contagest-erp-orchestrator`, pinned `marketing-copywriting` source in `agent-skills.lock.json`.
