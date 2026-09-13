# Control Hípico #284 — Messaging adapters consolidation + Windows CLI

## Objective

Restore #284 on top of the reconciled canonical-domain baseline without reintroducing a second business-logic authority. WhatsApp/Bridge/serverless remain transport adapters; canonical classification, deduplication, persistence and state decisions live in the backend.

## Architecture

### Messaging boundary

`backend/src/modules/hipico/messaging-channel.ts` exposes a transport-only `MessagingChannel` contract: `connect`, `disconnect`, `status`, `receive`, `send`. Messages use the canonical `HipicoNormalizedMessage` contract from #283 instead of a second local message schema.

`TestChannelAdapter` is deterministic, group-allowlisted when configured, deduplicates `(channel, groupId, externalMessageId)`, preserves `historySync`/`mediaKind`, and does not send as a side effect of receive/inject.

Browser/DOM/session selectors remain inside the existing WhatsApp Web Bridge tooling. No classifier, settlement, financial authority or state transition belongs to a channel adapter.

### Serverless compatibility adapter

`frontend/api/hipico/group-bridge-ingest.js` keeps only bounded transport validation, secret authentication, SOURCE/LAB pinning and canonical-envelope normalization. It delegates accepted events to the canonical backend `/api/v1/hipico-bot/bridge/events` through `canonical-backend.js`.

The backend remains authoritative for replay identity, dedupe, canonical shadow persistence, classifier/AppSec, handoff, response planning and history-sync policy. Serverless must not call Supabase or own a classifier for Bridge ingestion.

The proxy fails closed: production requires HTTPS; base URLs may not contain credentials/query/hash/path; only `/api/v1/hipico/*` or `/api/v1/hipico-bot/*` paths are accepted; redirects are rejected; timeout and response size are bounded; only required response headers are relayed.

### Windows CLI

One CLI at `tools/hipico-cli/hipico.mjs` provides `status`, `doctor`, `health`, `version`, `bridge status`, `channel status`, `groups`, `messages tail`, `events tail`, `trace <correlationId>` and stable `--json` output.

It maps only to routes that exist in the current backend. Operator endpoints receive `x-hipico-operator-token`; Bridge health receives `x-hipico-bridge-token`. Secrets are never emitted in text/JSON output. Credentials are refused over remote plain HTTP; localhost HTTP remains allowed for development.

Where the backend does not yet expose a dedicated resource, the CLI uses an existing bounded read surface instead of inventing an endpoint: message/event tail uses the operational events read; `trace` filters a bounded event window by safe correlation/request identifiers. `groups` reports configured channel/readiness summaries without exposing raw secret values.

PowerShell and CMD launchers call the same CLI entry point. Installation/update remains separate from daily start.

## Security invariants

- SOURCE remains read-only; no code path may send WhatsApp messages to SOURCE.
- LAB send remains explicit and separately gated.
- `historySync=true` is replay/evidence only and cannot generate an automatic send or domain mutation duplicate.
- SOURCE/LAB identities are distinct and pinned.
- Adapter/serverless code has no financial authority and no settlement mutation.
- Internal tokens are strong secrets, transmitted only in headers and never serialized to CLI output/logs.
- Remote CLI base URL must be HTTPS; redirects are rejected.
- Serverless canonical proxy is path-allowlisted, response-size bounded and timeout bounded.
- Existing `/api/v1/hipico-bot/*` compatibility contracts remain available while `/api/v1/hipico/*` is canonical.

## Testing and evidence

Unit/contracts must cover deterministic adapter receive/dedupe/history replay, canonical serverless delegation, absence of serverless classification/Supabase persistence, strict proxy policy, CLI command mapping/redaction/transport policy and launcher parity.

Required final-candidate evidence: source contracts, backend typecheck, Hípico tests, build, Bridge contracts and runtime/build evidence on the exact SHA. GitHub runner failures before checkout are reported as infrastructure blockers, never PASS. Physical WhatsApp/Windows validation remains separate when the environment is unavailable.

## Non-goals

No PDF parsing, provider expansion, UI redesign, automatic monetary actions, E2E encryption bypass, traffic interception or production SOURCE automation.