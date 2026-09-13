# ADR — Canonical race lifecycle (#287)

## Status
Accepted and integrated with #290 PostgreSQL/release gates.

## Physical race lifecycle
Primary path:

`DISCOVERED -> ANNOUNCED -> OPEN -> CLOSING -> CLOSED -> RUNNING -> PROVISIONAL_RESULT -> OFFICIAL_RESULT -> ARCHIVED`

Alternate states are `POSTPONED`, `CANCELLED` and `SUSPENDED`.

This state machine represents the observable/operational life of a physical race. `CLOSED` means intake is closed. It has no settlement side effect and must never be interpreted as `SETTLED`.

## Financial/operational domain distinction
The canonical event-stream aggregate under `hipico_domain_*` separately models post-result financial/operational progression such as result received, settlement-ready, settlement recorded, balance confirmation and publication. The two layers are complementary:

- `hipico_races` answers what happened to the race itself;
- `hipico_domain_aggregates/events` controls operator-confirmed operational/financial progression;
- closing or receiving a result never grants automatic financial authority.

## Command contract
`POST /api/v1/hipico/races/:id/commands` requires the Hípico operator boundary plus `requestId`, `expectedState`, actor/correlation identity, bounded evidence and a bounded payload. PostgreSQL locks the race row and appends an audit event before any conditional state update.

Reusing the same `requestId` with different input fails closed with `RACE_COMMAND_IDEMPOTENCY_MISMATCH`. An exact replay returns the persisted transition without changing state or appending another event.

## Evidence policy
An agent/system cannot OPEN from one observation. It requires corroborated trusted/official evidence. An operator may make an explicit manual decision.

`MARK_OFFICIAL_RESULT` always requires official evidence. Provider, PDF or group text alone cannot turn a provisional observation into an official result.

## Persistence and isolation
Additive tables:
- `hipico_meetings`;
- `hipico_races`;
- `hipico_race_events`.

All records are scoped by owner + group and use RLS/privilege denial as defense in depth. #290's isolated PostgreSQL E2E must create these tables and prove that direct authenticated writes are denied.

## Rollback
Revert API/code before deployment. Do not automatically drop evidence tables after data exists; export/migrate evidence explicitly.
