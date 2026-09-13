# ADR — Messaging boundary and serverless delegation (#284)

## Status
Accepted and integrated. Production promotion remains gated by #290 exact-SHA evidence.

## Decision
WhatsApp Web, Meta and future messaging channels are adapters. They authenticate and validate transport input, preserve source identity/provenance and delegate to the backend; they do not own classification, race state, financial state or canonical persistence.

`frontend/api/hipico/group-bridge-ingest.js` and `frontend/api/hipico/whatsapp-webhook.js` remain compatibility/serverless ingress adapters. The backend is the product authority and `/api/v1/hipico/*` is the canonical product facade; `/api/v1/hipico-bot/*` remains the compatibility/integration namespace for Bridge/webhook contracts.

The deterministic test channel used by #290 lives beside the canonical backend integration code under `backend/src/modules/hipico-bot/hipico-test-channel.ts`. Its purpose is reproducible E2E application flow, not a second domain implementation.

## Security invariants
- Channel/group/source identities remain explicit and bounded.
- Bridge/operator tokens stay server-side and are never accepted in browser bundles.
- Meta signatures and verify tokens are checked by the backend transport boundary.
- Serverless delegation fails closed when the canonical backend cannot be resolved.
- Proxies permit only expected Hípico API paths, require HTTPS for remote origins, use bounded timeout/response size and reject redirects.
- No channel adapter writes balances, settlements, race authority or business events independently.
- History/replay input is explicit; duplicate messages must remain idempotent and must not create duplicate outbox responses.

## Operational CLI
Local CMD/PowerShell access is implemented through `tools/hipico-cli/hipico.mjs`, `HIPICO.cmd` and `HIPICO.ps1`. It calls the current canonical API, reads secrets only from environment variables and forbids remote clear-text HTTP.

## Rollback
Compatibility adapters may be rolled back independently only if they continue delegating to a single backend authority. Do not restore serverless classification or direct business persistence.
