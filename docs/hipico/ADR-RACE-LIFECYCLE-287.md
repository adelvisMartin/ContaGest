# ADR — Canonical race lifecycle (#287)

## Status
Accepted for stacked implementation. This lifecycle supersedes the legacy #277 race-state vocabulary only for the new canonical `/api/v1/hipico/*` product surface; legacy compatibility code remains unchanged until migration is proven.

## State machine
Primary path:

`DISCOVERED -> ANNOUNCED -> OPEN -> CLOSING -> CLOSED -> RUNNING -> PROVISIONAL_RESULT -> OFFICIAL_RESULT -> ARCHIVED`

Alternate states: `POSTPONED`, `CANCELLED`, `SUSPENDED`.

Closing a race means only that intake is closed. `CLOSED` has `resultStage=none` and has no ledger/settlement side effect. Arrival/result evidence first becomes provisional. `OFFICIAL_RESULT` requires explicit official evidence.

## Command contract
`POST /api/v1/hipico/races/:id/commands` requires:
- authenticated Hípico operator at the HTTP boundary;
- `requestId` for idempotency;
- `expectedState` for optimistic state validation;
- actor/correlation identity;
- bounded evidence/provenance;
- command payload.

PostgreSQL locks the race row, checks the exact request identity, appends an audit event and conditionally updates by `state_version`. Reusing a requestId with changed content fails with `RACE_COMMAND_IDEMPOTENCY_MISMATCH`.

## Evidence policy
An agent/system cannot OPEN from a single trusted/ambiguous observation. It requires at least two independent trusted/official evidence sources with sufficient confidence. An operator may make an explicit manual OPEN decision.

`MARK_OFFICIAL_RESULT` always requires at least one official evidence source. Provider/PDF/group text alone cannot auto-promote an arrival to official result.

## Persistence
Additive tables:
- `hipico_meetings`;
- `hipico_races`;
- `hipico_race_events` append-only command/audit evidence.

All rows are scoped by owner + group; meeting/race/event foreign keys preserve that scope. Direct anonymous/authenticated table writes are revoked and RLS select policies remain defense-in-depth.

## Query behavior
Natural query classification covers next race, active race, last result, schedule, scratches and status. Unknown or ambiguous context is surfaced explicitly rather than guessed. Scratch queries return unknown until a canonical provider/document source supplies scratch evidence.

## Rollback
Revert API/code before deployment. Additive data tables must not be dropped automatically after evidence exists; export/migrate first.
