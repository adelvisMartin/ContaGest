# ADR — Canonical Hípico API and domain boundary (#283)

## Status
Accepted for staged implementation. Merge remains blocked by the release evidence of PR #278.

## Context
Control Hípico currently exposes integration/operator capabilities under `/api/v1/hipico-bot/*`, while serverless handlers under `frontend/api/hipico/**` also classify and persist operational events. Keeping product rules in both runtimes creates drift risk as documents, providers, race lifecycle and agents are added.

## Decision
1. `/api/v1/hipico/*` is the canonical product API.
2. `/api/v1/hipico-bot/*` remains a compatibility/integration boundary for Bridge, webhook and existing operator contracts during migration.
3. Canonical domain logic is framework-independent. Express, Vercel, Supabase and Playwright are adapters/infra and do not define business rules.
4. Serverless business classification/persistence must progressively delegate to the canonical backend/application layer; it must not evolve as a second domain implementation.
5. PostgreSQL on the server remains authoritative. Client/IndexedDB state is projection/offline/outbox only.
6. External racing providers remain enrichment-only unless a future explicit contract promotes authority; financial authority defaults to false.

## First API surface
- `GET /api/v1/hipico/system/version`
- `GET /api/v1/hipico/system/status`
- `GET /api/v1/hipico/system/readiness`

The status model reports explicit `ready`, `degraded`, `unavailable` or `not_configured` states. Missing document/agent engines are not presented as PASS.

## Error contract
Canonical product errors use:

```json
{
  "ok": false,
  "code": "RACE_CONTEXT_AMBIGUOUS",
  "message": "...",
  "requestId": "...",
  "retryable": false
}
```

## Consequences
- Existing integrations keep working during migration.
- New product modules have a stable canonical namespace.
- Split-brain removal can happen incrementally without a destructive cutover.
- Compatibility adapters need explicit contract tests until removed.

## Rollback
Remove the canonical `/api/v1/hipico/system` mount and the new `backend/src/modules/hipico/**` module. No database migration is introduced by this ADR/PR.
