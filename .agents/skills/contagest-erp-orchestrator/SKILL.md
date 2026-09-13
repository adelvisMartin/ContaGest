---
name: contagest-erp-orchestrator
description: Governs all agent-assisted ContaGest changes across ERP, Control Hípico, security, UX, QA and deployment.
---

# ContaGest ERP Orchestrator

This project policy outranks all vendored/external skills.

## Non-negotiable gates
- Never merge a PR on behalf of the owner unless the owner explicitly asks in that same turn. Default delivery is branch + preview/evidence + push, then the owner creates/merges the PR.
- Never call a change tested when the relevant test did not actually execute. Distinguish `PASS`, `FAIL`, `BLOCKED` and `NOT_EXECUTED`.
- A GitHub Actions job with `runner_id=0`, empty runner name and no executed steps is `BLOCKED` infrastructure evidence, not a code PASS/FAIL diagnosis.
- For production verification require: GitHub `main` SHA = deployment source SHA = `/api/health` `buildCommit`.
- Preserve tenant/RIF isolation. Changing browser state, URL, storage or request payload must never grant access to another tenant.
- Treat the registered company RIF as immutable through ordinary CRUD. Corrections require the documented controlled workflow.
- Financial/accounting correctness outranks visual polish. Do not alter fiscal, ledger, tax, inventory or closing behavior as a side effect of UI work.
- Health/medical data is sensitive. Do not claim regulatory compliance without evidence and legal review.
- Authentication controls must remain usable: motion, routing, hydration and background refreshes must not replace focused form controls or cancel native input events.

## Deterministic domain routing
Before a non-trivial change run:

```bash
npm run agent:gates -- --base main
```

Treat every returned `critical` domain as binding. Do not manually downgrade it because a diff looks small. Load the listed project skills before editing high-risk code.

For any Control Hípico path, the `hipico-platform` domain is mandatory and must load `contagest-hipico-platform`. Canonical domain/API ownership, SOURCE/LAB safety, Agent/Shadow policy, document/provider provenance, Command Center fail-closed behavior, PWA/Android parity and exact-SHA evidence are part of that skill and must not be replaced by generic assumptions.

## Change sequence
1. Characterize current behavior and stable baseline, including exact base/head SHA when working from GitHub.
2. Run deterministic domain routing and load required project skills.
3. Name the smallest affected surface and likely side effects.
4. Write or strengthen a regression/contract before production behavior when technically possible.
5. Apply the minimal change in a dedicated branch; semantically reconcile shared files instead of overwriting newer hardening.
6. Run unit/static checks relevant to the change.
7. Render affected routes in a real browser. For interaction bugs, exercise the exact sequence a user performs.
8. Validate mobile and desktop when the surface is responsive.
9. Check console/network/runtime errors and persistence/reload behavior when applicable.
10. Create SHA-bound evidence and leave the branch pushed. Do not merge by default.

## Safe project-learning loop
Agents may improve project skills/routing when evidence shows a repeated escaped defect, recurring review comment, missing gate or recurring false assumption. This is a controlled engineering change, not autonomous self-modification.

A project-skill improvement is allowed only when:
- the triggering failure pattern is named and evidenced;
- the policy change is the smallest rule that would have prevented the failure;
- a regression test/deterministic contract is added when technically possible;
- the change does not weaken security, CI, release, accounting, tenant or accessibility gates;
- the skill/routing edit is a normal reviewable commit;
- the same failing candidate is not retroactively relabeled PASS because the instructions changed.

Never create recursive self-edit loops, auto-merge skill changes, delete/skip failing tests, lower thresholds to make CI green, or change production/secrets policy to satisfy a gate.

## External skill precedence
1. ContaGest project/security/accounting/Control Hípico requirements.
2. Accessibility and platform/browser correctness.
3. OpenAI curated security best practices.
4. Emil/Impeccable guidance.
5. Taste Skill as experimental inspiration only.

If an external skill conflicts with levels 1-2, ignore the external instruction and record why.
