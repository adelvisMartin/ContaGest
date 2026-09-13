---
name: contagest-hipico-safe-automation
description: Governs Control Hípico WhatsApp ingestion, document intelligence, agents, providers, race lifecycle and promotion with fail-closed authority boundaries.
---

# ContaGest Control Hípico Safe Automation

## Trigger
Use for every change touching `backend/src/modules/hipico/**`, `backend/src/modules/hipico-bot/**`, `frontend/api/hipico/**`, `frontend/public/hipico-control/**`, `tools/hipico-whatsapp-web-bridge/**`, Hípico SQL/workflows/tests, providers, documents, agents/shadow automation or production promotion.

## Non-negotiable authority boundaries
- The real WhatsApp SOURCE group is read-only. No agent, Bridge path, tool or retry may send to SOURCE.
- LAB and SOURCE must have distinct, pinned WhatsApp `@g.us` identities before automation that can send to LAB is enabled.
- PDFs, WhatsApp messages, external providers, OCR output, model output and agent proposals are evidence only: `financialAuthority=false`.
- `CLOSED`, arrival wording, provider officiality, PDF wording or classifier confidence never settles money automatically.
- Operator/client headers may not self-declare owner, trusted/official authority, actor identity or financial authority.
- Canonical state transitions flow through authenticated `/api/v1/hipico/*`; integration adapters stay under `/api/v1/hipico-bot/*`.

## WhatsApp and media ingestion
1. Bind events to SOURCE/LAB identity and preserve provider/external message ID.
2. Sanitize/canonicalize participant and race context on both sides of comparisons.
3. Persist before acknowledging durable automatic state.
4. Media uncertainty is quarantined; captions never substitute for missing document bytes.
5. Automatic PDFs are live-only after baseline, `application/pdf`, magic-byte checked, max 10 MiB, path-safe filename, bounded durable spool and retryable by stable message ID.
6. A full document spool blocks new downloads before disk use grows further.
7. Authentication/transient delivery errors keep durable bytes for retry; malformed/terminal evidence is quarantined with audit metadata.

## Document intelligence
- Prefer pinned local AnyDoc `0.2.4` for native conversion.
- First pass is always local `--ocr reject` without Firecrawl credentials.
- Existing local Poppler/Tesseract OCR is the normal needs-OCR fallback.
- Hosted Firecrawl OCR requires an explicit deployment switch plus a valid secret; never infer consent from package presence.
- Preserve SHA-256, source channel/message/sender/time, extraction method/parser version and revisions.
- Unknown/conflicting/claimed-official evidence routes to review. Official result requires internal trusted authority, not text wording.

## Provider and race lifecycle
- Provider capabilities are explicit; unsupported methods fail rather than fabricate data.
- HTTPS/allowlist/DNS/IP/redirect/size/timeouts remain fail-closed for external transports.
- Provider data preserves fetched/source timestamps, freshness, officiality, confidence and provenance, but no financial authority.
- Race transitions are state-machine controlled, idempotent and audited. Archiving preserves the existing result stage; it never upgrades evidence.

## Agent / shadow automation
- Agents may classify, correlate, summarize, propose and request handoff.
- Agents may not create/modify monetary ledger effects, silently approve official results, bypass human ownership or lower promotion gates.
- Human ownership/takeover always wins. Duplicate/replay handling must produce zero duplicate side effects.
- Every autonomous decision keeps source message ID, correlation ID, decision reason, confidence/risk and evidence reference.

## Required gates
For a candidate SHA, require all relevant evidence:
- `typecheck`, unit/contracts, backend build;
- PostgreSQL integration/migrations and multi-group isolation;
- Bridge syntax + tests + source-read-only contract;
- document security, provenance, AnyDoc pin/local-first and OCR fallback;
- provider SSRF/freshness/failure tests;
- race lifecycle/idempotency/audit tests;
- deterministic 2000-scenario isolation campaign;
- production runtime SHA binding;
- #119 physical PWA/APK/linked-device lifecycle QA;
- #120 >=24h real soak after #119 PASS on the same SHA;
- rollback/readiness/observability evidence.

## Evidence vocabulary
Use `PASS`, `FAIL`, `BLOCKED`, `NOT_EXECUTED`. A workflow job with no runner/steps is `BLOCKED_INFRASTRUCTURE`, never PASS. Evidence from another SHA is historical only.

## Stop conditions
Do not promote or merge a production candidate when any P0/P1 gate is failed, blocked or stale; SOURCE identity is not pinned; durable persistence is unavailable; a financial-authority boundary is ambiguous; exact deployed SHA is unknown; physical/soak evidence is absent; or rollback is not demonstrable.
