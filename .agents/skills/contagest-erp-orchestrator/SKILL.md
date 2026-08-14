---
name: contagest-erp-orchestrator
description: Governs all agent-assisted ContaGest changes across ERP, security, UX, QA and deployment.
---

# ContaGest ERP Orchestrator

This project policy outranks all vendored/external skills.

## Non-negotiable gates
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
2. Name the smallest affected surface and likely side effects.
3. Apply the minimal change in a dedicated branch.
4. Run unit/static checks relevant to the change.
5. Render affected routes in a real browser. For interaction bugs, exercise the exact sequence a user performs.
6. Validate mobile and desktop when the surface is responsive.
7. Check console/network/runtime errors.
8. Create evidence and leave the branch pushed. Do not merge by default.

## External skill precedence
1. ContaGest project/security/accounting requirements.
2. Accessibility and platform/browser correctness.
3. OpenAI curated security best practices.
4. Emil/Impeccable guidance.
5. Taste Skill as experimental inspiration only.

If an external skill conflicts with levels 1-2, ignore the external instruction and record why.
