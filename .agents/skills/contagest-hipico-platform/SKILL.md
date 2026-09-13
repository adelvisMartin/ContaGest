---
name: contagest-hipico-platform
description: Governs Control Hípico domain/API, WhatsApp/Bridge adapters, document intelligence, providers, Agent/Shadow automation, Command Center, PWA/Android parity and SHA-bound release evidence.
---

# ContaGest Control Hípico Platform

Use this skill for every change under `backend/src/modules/hipico*`, `frontend/api/hipico`, `frontend/public/hipico-control`, `android/hipico-control-*`, Hípico SQL/QA/workflows or related provider/Bridge code.

## Architecture authority

- `/api/v1/hipico/*` is the canonical business/domain API.
- `/api/v1/hipico-bot/*` is an integration/adaptor boundary. Do not add a second business brain there.
- Serverless/frontend API handlers are BFF/proxy boundaries only; they must not reimplement canonical lifecycle, classification, accounting or persistence rules.
- Current `main` is merge authority. Historical PR branches are evidence/input, never replacement truth when current hardening differs.
- Shared files are reconciled semantically; do not overwrite newer auth/path/rate-limit/PWA/security work with older stacked-branch copies.

## SOURCE / LAB safety

- SOURCE is read-only ingestion/observation. No automated reply, lifecycle mutation, settlement, ledger effect or provider-side write may originate from SOURCE.
- LAB is the only automation/simulation target until an explicit production policy says otherwise.
- `SHADOW` and `ASSISTED` never execute tool effects.
- `AUTOMATIC_LOW_RISK`/`AUTOMATIC` may only execute allowlisted read-only tools with bounded arguments and high confidence unless a separately reviewed policy explicitly expands that set.
- Agent/model/provider/document output is evidence, never financial authority.
- API responses and receipts for automation must preserve `financialAuthority=false` and `directEffectsApplied=false` unless an explicit future ticket, schema and review changes the contract.
- Client fields never grant actor, owner, tenant or automation authority. Identity/approval must be derived server-side from authenticated/configured state.

## Agent promotion and evaluation

- Upward automation promotion is adjacent-only.
- Promotions require measured gates; final automatic promotion requires server-controlled owner approval.
- Promotions and reviews are serialized and auditable; replay-sensitive mutations require idempotency.
- Evaluation evidence is bounded, secret-safe and immutable after review where the schema requires it.
- Reject unknown tool argument keys, SQL/shell/process primitives, secret-like keys, unbounded payloads and unsafe model schemas.
- A generated/model candidate cannot bypass deterministic safety policy.

## Documents and providers

- PDF/OCR/provider extraction is provenance-bearing evidence. Preserve source hash/document identity, extractor/provider identity, confidence and review state.
- Hosted OCR/model/provider use must be explicit and secret-safe; local-first behavior must not silently turn into external data transfer.
- Provider failure/degradation must be observable and must not become a healthy zero/empty result.
- Do not give providers direct ledger/settlement authority.

## Command Center

- The Command Center is an observable operational surface, not a mutation bypass.
- Backend/read failures render `unavailable`/degraded state; never translate a failed read into healthy `0`, empty array or `ready`.
- Bridge `degraded`/stale is distinct from `not_configured`.
- Browser code never receives server operator/service-role tokens.
- Preserve loading, empty, error, offline, stale and success states.
- Preserve keyboard/focus/ARIA/contrast/reduced-motion support and usable geometry at 360/390/430/768/1024/1440.
- The document must not own horizontal overflow.

## PWA / Android parity

- Service worker may cache the static shell, never authenticated API/auth responses.
- Any new runtime asset added to the web shell must be included in parity validation and Android sync/hash checks when Android embeds the PWA.
- Theme bootstrap must run early enough to avoid theme flash and must preserve `system`, `light`, `dark` behavior without changing geometry.

## Required evidence

For any Hípico candidate, route through `npm run agent:gates -- --base main` and require, when applicable:

```text
hipico-tests
canonical-contracts
source-read-only
agent-safety
db-integration
migration-rls
browser-360-390-430-768-1440
offline-pwa
android-parity
exact-sha
```

Use only `PASS`, `FAIL`, `BLOCKED`, `NOT_EXECUTED`. A runner with `runner_id=0`, empty runner name and zero steps is `BLOCKED`, not a code failure and never PASS.

## Safe continuous-improvement loop

After a Hípico task, perform a short retrospective only when there is concrete evidence of a repeated failure, missing gate, recurring review comment or escaped regression.

A skill/agent improvement may be proposed or committed only when all are true:
1. the failure pattern is named with evidence;
2. the change is the smallest policy/routing improvement that would have prevented it;
3. a regression test or deterministic contract is added when technically possible;
4. security, CI, release, accounting and tenant gates are not weakened;
5. the skill change is in a reviewable commit and is not used retroactively to declare the same failing candidate PASS.

Never create recursive self-edit loops, auto-merge skill changes, silently lower thresholds, delete tests, convert failures to skips, or modify secrets/production policy to make a gate green.

## Stop conditions

Stop and report `BLOCKED`/`FAIL` instead of improvising when:
- canonical and adapter ownership conflict is unresolved;
- SOURCE write capability appears;
- actor/owner authority comes from the browser/request body;
- financial authority is inferred from an agent/provider/document;
- migration/RLS evidence is missing for new persistence;
- browser/runtime verification is required but did not execute;
- exact candidate SHA cannot be tied to evidence.
