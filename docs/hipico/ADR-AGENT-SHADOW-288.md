# ADR — Agent/Shadow and promotion policy (#288)

## Status
Accepted for stacked implementation. Default SOURCE mode is SHADOW and no model output can directly mutate business state.

## Architecture
Pipeline: deterministic parser first -> optional structured candidate generator -> schema/bounds validation -> safe-tool allowlist -> domain/policy gate -> Command API or read-only query.

The optional model is a candidate generator, never a database actor. Its output is treated as untrusted data. It cannot receive SQL, shell, admin, secrets, arbitrary URLs or monetary tools.

Allowed tools are exactly:
- `queryRaceStatus`
- `queryNextRace`
- `queryLastResult`
- `querySchedule`
- `queryScratches`
- `proposeRaceCommand`

`proposeRaceCommand` is a proposal only; lifecycle validation/auth/idempotency remain in #287.

## Automation modes
`DISABLED -> SHADOW -> ASSISTED -> AUTOMATIC_LOW_RISK -> AUTOMATIC`.

Promotion is metric-gated. SHADOW->ASSISTED requires >=200 reviewed, >=98% accuracy, zero high-risk false positives and zero unauthorized actions. AUTOMATIC_LOW_RISK requires >=500 reviewed, >=99% accuracy, <=0.5% conflict rate and zero high-risk/unauthorized errors. AUTOMATIC additionally requires explicit owner approval, >=1000 reviewed, >=99.5% accuracy and <=0.2% conflict rate.

Downgrade is always allowed. The pinned SOURCE group defaults to SHADOW; all other unknown groups default DISABLED.

## Action policy
SHADOW and ASSISTED never auto-act. Automatic modes may auto-act only `risk=safe` candidates. `review` and `monetary` candidates never auto-act even in AUTOMATIC.

## Evaluation evidence
`hipico_agent_evaluations` persists message hash, expected/predicted/actual intent, confidence, risk, selected bounded tool, canAct, model/parser version, match review, high-risk false positive, unauthorized-action and conflict flags. Promotion metrics derive from persisted reviewed rows.

The versioned golden corpus covers lifecycle signals, monetary offers, confirmations, balances, results, day close, natural queries, spam, prompt injection and media references.

## Security
Prompt text is data only. Tool arguments containing SQL/shell/exec/spawn/password/token/secret indicators are rejected. No raw message is required in long-lived evaluation storage; the corpus/evaluation stores hashes and reviewed labels.

## Rollback
Downgrade all groups to SHADOW/DISABLED before reverting code. Evaluation tables are evidence and must not be dropped automatically.
