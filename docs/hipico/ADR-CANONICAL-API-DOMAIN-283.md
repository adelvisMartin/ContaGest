# ADR — Canonical Hípico API and domain boundary (#283)

## Status
Accepted. Restored on top of the post-#304 baseline after the original #292 merge stopped being an ancestor of `main`.

## Context
Control Hípico exposes integration/operator capabilities under `/api/v1/hipico-bot/*`, while the long-term product contract lives under `/api/v1/hipico/*`. Product rules duplicated between backend, Bridge and serverless runtimes create drift risk as documents, providers, race lifecycle and agents evolve.

## Decision
1. `/api/v1/hipico/*` is the canonical product API.
2. `/api/v1/hipico-bot/*` remains a compatibility/integration boundary for Bridge, webhook and existing operator contracts during migration.
3. Canonical deterministic primitives live in framework-independent `backend/src/modules/hipico/**`. Express, Vercel, Supabase and browser/Bridge code are adapters or infrastructure and do not define those rules.
4. Race-context normalization/key generation has one implementation in the canonical domain. The legacy `hipico-bot/hipico-race-context-key.ts` module is a compatibility re-export only.
5. Serverless classification/business persistence must delegate to the canonical backend/application layer; it must not evolve as a second domain implementation.
6. PostgreSQL on the server remains authoritative. Client/IndexedDB state is projection/offline/outbox only.
7. External racing providers remain enrichment-only unless a future explicit contract promotes authority; financial authority defaults to `false`.

## First canonical system surface
- `GET /api/v1/hipico/system/version`
- `GET /api/v1/hipico/system/status`
- `GET /api/v1/hipico/system/readiness`

The status model reports only explicit `ready`, `degraded`, `unavailable` or `not_configured` states. Configuration alone is not treated as proof that Bridge, channel or provider connectivity is healthy; configured-but-unprobed integrations are `degraded`.

## Error contract
Canonical product errors use the stable envelope:

```json
{
  "ok": false,
  "code": "RACE_CONTEXT_AMBIGUOUS",
  "message": "...",
  "requestId": "...",
  "retryable": false
}
```

No secret/config value is part of the version, status or readiness payload.

## Security and authority invariants
- Tenant/owner scope remains in the application/persistence layers; this system API performs no tenant mutation.
- LLM/provider payloads are evidence/enrichment, never domain or financial authority.
- The system surface is read-only and adds no monetary mutation.
- `/api/v1/hipico-bot/*` is preserved; no destructive rename or Bridge/webhook removal occurs here.

## Consequences
- Existing integrations continue to work while canonical resources evolve.
- New product modules have a stable namespace and error/version contracts.
- Deterministic race identity cannot drift between canonical and compatibility consumers.
- Split-brain removal can proceed incrementally behind explicit contract tests.

## Rollback
Remove the canonical `/api/v1/hipico/system` mount and `backend/src/modules/hipico/**`, then restore the compatibility race-context implementation. No database migration is introduced by this ADR.
