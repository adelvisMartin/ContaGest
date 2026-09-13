# ADR — Agent/Shadow and promotion policy (#288)

## Status
Accepted and integrated. Shadow is the safe default and production promotion remains gated by #290 exact-SHA evidence.

## Architecture
Pipeline: deterministic parser first -> optional structured candidate generator -> schema/bounds validation -> safe-tool allowlist -> domain/policy gate -> read-only query or race-command proposal.

A model is a candidate generator, never a database actor. Its output is untrusted data. SQL, shell/admin execution, credentials, arbitrary URLs and monetary tools are outside the agent tool surface.

Allowed tools remain:
- `queryRaceStatus`
- `queryNextRace`
- `queryLastResult`
- `querySchedule`
- `queryScratches`
- `proposeRaceCommand`

`proposeRaceCommand` is a proposal only; lifecycle validation, operator authorization and idempotency remain in #287.

## Automation modes
`DISABLED -> SHADOW -> ASSISTED -> AUTOMATIC_LOW_RISK -> AUTOMATIC`.

Promotion is metric-gated. SHADOW->ASSISTED requires >=200 reviewed, >=98% accuracy, zero high-risk false positives and zero unauthorized actions. AUTOMATIC_LOW_RISK requires >=500 reviewed, >=99% accuracy, <=0.5% conflict rate and zero high-risk/unauthorized errors. AUTOMATIC additionally requires explicit owner approval, >=1000 reviewed, >=99.5% accuracy and <=0.2% conflict rate.

Downgrade is always allowed. SHADOW and ASSISTED never auto-act. Automatic modes may auto-act only `risk=safe`; `review` and `monetary` candidates never auto-act.

## Golden corpus and evaluation evidence
`qa/fixtures/hipico-agent-golden-v1.json` is a versioned deterministic corpus exercised by `agent-golden.test.ts`. It covers lifecycle signals, monetary offers, confirmations, balances, results, natural queries, ambiguous text and prompt-injection strings. Tests assert that Shadow never acts and unsafe candidates remain non-automatic even in AUTOMATIC mode.

`hipico_agent_evaluations` stores bounded reviewed evidence used by promotion metrics. The durable record uses hashes/labels and does not require retaining unrestricted raw conversation text.

## Security
Prompt/message text is data only. Tool arguments containing SQL/shell/exec/spawn/password/token/secret indicators are rejected. Agent writes to financial authority are not available.

## Rollback
Downgrade groups to SHADOW/DISABLED before reverting code. Evaluation rows are evidence and must not be dropped automatically.
