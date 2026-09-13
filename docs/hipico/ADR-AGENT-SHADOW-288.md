# ADR — Agent/Shadow and promotion policy (#288)

## Status
Accepted for integration on top of the canonical Hípico lifecycle layer. SOURCE defaults to **SHADOW** and no model output can directly mutate business or monetary state.

## Pipeline
Deterministic parser first → optional structured candidate generator → schema/bounds validation → per-tool argument validation → policy gate → read-only query eligibility or Command API proposal.

The optional model is a candidate generator, never a database actor. Its output is untrusted data. It receives no SQL, shell, admin, secrets, arbitrary-URL, ledger or settlement capability.

Allowed tools are exactly:
- `queryRaceStatus`
- `queryNextRace`
- `queryLastResult`
- `querySchedule`
- `queryScratches`
- `proposeRaceCommand`

Query tools accept only bounded, tool-specific arguments and require `risk=safe`. Automatic eligibility additionally requires confidence `>= 0.95` and a read-only query tool. `proposeRaceCommand` is always review-only and never auto-executes.

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
SHADOW and ASSISTED never auto-act. Automatic modes may only mark high-confidence read-only query candidates eligible. `review` and `monetary` candidates never auto-act, including in AUTOMATIC.

The evaluation API returns `actions: []`, `financialAuthority: false` and `directEffectsApplied: false`. This integration does not add a direct executor.

## Audit identity, idempotency and concurrency
Operator identity is derived server-side from the authenticated operator token using `operatorActorRef()`. Client payloads cannot provide `operatorId`, `updatedBy` or `reviewedBy` because request schemas are strict.

Mode changes require an `Idempotency-Key`. Accepted transitions are recorded in `hipico_automation_transition_events` with previous/target state, actor, owner approval, decision and metrics. Reusing the same key with a different transition fails with `HIPICO_AUTOMATION_IDEMPOTENCY_MISMATCH`; an exact replay returns the original transition instead of writing a second event.

Promotion and review use a PostgreSQL advisory transaction lock scoped to `ownerId + groupKey + groupId`; affected rows are additionally read `FOR UPDATE`. Promotion metrics are recalculated inside the lock. An evaluation is single-review: a second review fails with `HIPICO_AGENT_EVALUATION_ALREADY_REVIEWED` rather than rewriting evidence.

## Evidence
`hipico_agent_evaluations` persists only bounded evidence metadata: message hash, expected/predicted/actual intent, confidence, risk, selected tool, canAct, model/parser version, match result, high-risk false-positive, unauthorized-action and conflict flags. Raw chat text is not required in the long-lived evaluation row.

Evidence input is bounded and rejects secret-shaped top-level fields. Database tables have RLS enabled; `anon` and `authenticated` receive no mutation grants. The agent schema has no FK or permission path to ledger/settlement tables.

The versioned golden corpus covers lifecycle signals, monetary offers, confirmations, balances, results, day close, natural queries, spam, prompt injection, credential/tool-injection language and media references.

## Rollback
Downgrade groups to SHADOW/DISABLED before reverting code. Evaluation and transition rows are audit evidence and must not be deleted by application rollback.
