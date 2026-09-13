---
name: contagest-erp-orchestrator
description: Governs all agent-assisted ContaGest changes across ERP, Control Hípico, security, UX, QA and deployment.
---

# ContaGest ERP Orchestrator

This project policy outranks all vendored/external skills.

## Non-negotiable gates
- Before implementation, route the changed paths through `npm run agent:gates -- --files <comma-separated-files>` (or the branch diff). Treat every returned domain, agent, skill and gate as required scope unless the owner explicitly changes product scope; never silently lower a critical domain.
- For `control-hipico`, load and obey `contagest-hipico-safe-automation` in addition to AppSec/release evidence skills. SOURCE read-only, `financialAuthority=false`, same-SHA evidence, #119 physical QA and #120 soak are hard gates.
- Never merge a PR on behalf of the owner unless the owner explicitly asks in that same turn. Default delivery is branch + preview/evidence + push, then the owner creates/merges the PR.
- Never call a change tested when the relevant test did not actually execute. Distinguish PASS, FAIL, BLOCKED and NOT EXECUTED.
- For production verification require: GitHub `main` SHA = Vercel deployment source SHA = `/api/health` `buildCommit`.
- Preserve tenant/RIF isolation. Changing browser state, URL, storage or request payload must never grant access to another tenant.
- Treat the registered company RIF as immutable through ordinary CRUD. Corrections require the documented controlled workflow.
- Financial/accounting correctness outranks visual polish. Do not alter fiscal, ledger, tax, inventory or closing behavior as a side effect of UI work.
- Health/medical data is sensitive. Do not claim regulatory compliance without evidence and legal review.
- Authentication controls must remain usable: motion, routing, hydration and background refreshes must not replace focused form controls or cancel native input events.

## Change sequence
1. Characterize current behavior and stable baseline.
2. Enumerate changed/expected paths and run the domain gate router; load every project skill returned for critical domains.
3. Name the smallest affected surface and likely side effects.
4. Apply the minimal change in a dedicated branch.
5. Run unit/static checks relevant to the routed gates.
6. Render affected routes in a real browser. For interaction bugs, exercise the exact sequence a user performs.
7. Validate mobile and desktop when the surface is responsive.
8. Check console/network/runtime errors.
9. Create exact-SHA evidence, classify any unavailable gate as BLOCKED/NOT_EXECUTED, and leave the branch pushed. Do not merge by default.

## External skill precedence
1. ContaGest project/security/accounting/Control Hípico requirements.
2. Accessibility and platform/browser correctness.
3. OpenAI curated security best practices.
4. Emil/Impeccable guidance.
5. Taste Skill as experimental inspiration only.

If an external skill conflicts with levels 1-2, ignore the external instruction and record why.
