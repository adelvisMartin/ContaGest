# ADR — Messaging boundary and serverless delegation (#284)

## Status
Accepted for stacked implementation after #283. Merge remains gated by #278/#283 release evidence.

## Decision
WhatsApp Web, Meta and future channels are adapters. They may authenticate/validate transport input, normalize it and relay it, but they do not own classification, race state, financial state or persistence rules.

`frontend/api/hipico/group-bridge-ingest.js` and `frontend/api/hipico/whatsapp-webhook.js` become compatibility adapters that delegate to the staged backend `/api/v1/hipico-bot/*`. Backend remains the current canonical processor while the product API moves to `/api/v1/hipico/*`.

A framework-free `MessagingChannel` contract and `TestChannelAdapter` are added for deterministic application/E2E work. History-sync is represented explicitly on normalized messages; automatic response suppression remains a backend/domain policy.

## Security invariants
- SOURCE/LAB IDs and channel keys remain pinned.
- Bridge token stays server-only and at least 32 bytes.
- Meta raw signature and verify token are checked by the canonical backend with HMAC/timing-safe comparison.
- Serverless adapters fail closed if the canonical backend cannot be resolved.
- Compatibility proxy only permits `/api/v1/hipico*` paths, uses HTTPS in production, bounded timeout/response size and no redirects.
- No adapter writes money or business events directly.

## Rollback
Revert this PR to restore the prior serverless handlers. No DB migration is introduced.
