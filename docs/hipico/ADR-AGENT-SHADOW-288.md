# ADR — Agent/Shadow and promotion policy (#288)

## Status
Accepted for stacked implementation on top of the canonical data/lifecycle layer. SOURCE defaults to **SHADOW** and no model output can directly mutate business or monetary state.

## Pipeline
Deterministic parser first → optional structured candidate generator → schema/bounds validation → per-tool argument validation → policy gate → read-only query or Command API proposal.

The optional model is a candidate generator, never a database actor. Its output is untrusted data. It receives no SQL, shell, admin, secrets, arbitrary-URL, ledger or settlement capability.

Allowed tools are exactly:
- `queryRaceStatus`
- `queryNextRace`
- `queryLastResult`
- `querySchedule`
- `queryScratches`
- `proposeRaceCommand`

Query tools accept only bounded, tool-specific arguments and require `risk=safe`. `proposeRaceCommand` accepts only known lifecycle intents, requires `risk=review`, and is a proposal only; authentication, state transition, evidence and idempotency remain in the canonical Command API/lifecycle layer.

## Automation states
`DISABLED → SHADOW → ASSISTED → AUTOMATIC_LOW_RISK → AUTOMATIC`.

Upward promotion is **adjacent-only**. A group cannot skip SHADOW or ASSISTED by preloading metrics. Downgrade/same-state remains allowed.

Promotion gates:
- DISABLED → SHADOW: safe default.
- SHADOW → ASSISTED: ≥200 reviewed, ≥98% accuracy, zero high-risk false positives, zero unauthorized actions.
- ASSISTED → AUTOMATIC_LOW_RISK: ≥500 reviewed, ≥99% accuracy, ≤0.5% conflict rate, zero high-risk/unauthorized errors.
- AUTOMATIC_LOW_RISK → AUTOMATIC: explicit owner approval, ≥1000 reviewed, ≥99.5% accuracy, ≤0.2% conflict rate, zero high-risk/unauthorized errors.

The pinned SOURCE group defaults to SHADOW; other unknown groups default DISABLED.

## Effects policy
SHADOW and ASSISTED never auto-act. Automatic modes may only mark `risk=safe` candidates eligible. `review` and `monetary` candidates never auto-act, including in AUTOMATIC.

The evaluation API returns `actions: []`, `financialAuthority: false` and `directEffectsApplied: false`. This ticket does not add a direct executor.

## Audit identity and concurrency
Operator identity is derived server-side from the authenticated operator token using `operatorActorRef()`. Client payloads cannot provide `operatorId`, `updatedBy` or `reviewedBy` because request schemas are strict.

Promotion and review use a PostgreSQL advisory transaction lock scoped to `ownerId + groupKey + groupId`; affected rows are additionally read `FOR UPDATE`. Promotion metrics are recalculated inside the lock. An evaluation is single-review: a second review fails with `HIPICO_AGENT_EVALUATION_ALREADY_REVIEWED` rather than rewriting evidence.

## Evidence
`hipico_agent_evaluations` persists only bounded evidence metadata: message hash, expected/predicted/actual intent, confidence, risk, selected tool, canAct, model/parser version, match result, high-risk false-positive, unauthorized-action and conflict flags. Raw chat text is not required in the long-lived evaluation row.

Evidence input is bounded and rejects secret-shaped top-level fields. Database tables have RLS enabled; `anon` and `authenticated` receive no mutation grants. The agent schema has no FK or permission path to ledger/settlement tables.

The versioned golden corpus covers lifecycle signals, monetary offers, confirmations, balances, results, day close, natural queries, spam, prompt injection, credential/tool-injection language and media references.

## Rollback
Downgrade groups to SHADOW/DISABLED before reverting code. Evaluation rows are audit evidence and must not be deleted by application rollback.
