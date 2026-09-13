# ADR — Canonical Hípico API and domain boundary (#283)

## Status
Accepted and integrated. Production promotion remains gated by #290 exact-SHA evidence.

## Decision
1. `/api/v1/hipico/*` is the canonical product API.
2. `/api/v1/hipico-bot/*` remains a compatibility/integration boundary for webhook, WhatsApp Web Bridge and legacy operator adapters.
3. PostgreSQL is authoritative. Browser/IndexedDB state is projection, offline cache or outbox only.
4. Serverless handlers validate transport/authentication and delegate; they do not own classification, race state, financial state or canonical persistence.
5. External racing providers are enrichment-only and always expose `financialAuthority:false`.
6. Agent/model output is untrusted candidate data and never a direct database actor.

## Canonical surface
System endpoints are mounted directly under the canonical prefix and require the Hípico operator boundary:
- `GET /api/v1/hipico/version`
- `GET /api/v1/hipico/status`
- `GET /api/v1/hipico/readiness`

The same namespace owns Command Center/read models plus documents, providers, meetings/races and agent automation. `/api/v1/hipico-bot/*` must not become a second product-domain implementation.

## Error contract
Canonical product errors use a bounded envelope:

```json
{
  "ok": false,
  "code": "RACE_CONTEXT_AMBIGUOUS",
  "message": "...",
  "requestId": "...",
  "retryable": false
}
```

## Release invariant
The #290 release guard fails closed if the canonical mounts disappear, if browser bundles contain operator/bridge secrets, or if the real PostgreSQL/document/race/agent stack is not present. Every release artifact is bound to the candidate SHA.

## Rollback
Compatibility adapters may remain while a canonical module is rolled back, but no rollback may silently restore serverless business authority or a memory database fallback.
