# Platform Observability v1

Issue: #549

## Authority

`backend/src/shared/observability/logger.ts` remains the single structured logging authority. The platform context in `context.ts` adds vendor-neutral W3C propagation; it does not introduce a second logger and does not authorize business operations.

## Context fields

Every instrumented request/operation may carry:

- `correlationId`: stable cross-boundary support identity, never a raw user/JID identifier;
- `traceId`: 32-hex W3C trace identity;
- `spanId`: 16-hex operation identity;
- `requestId`: HTTP request identity where present;
- `service`, `version`, `commitSha`, `environment`: deployment metadata from the canonical logger;
- `operation`, `outcome`, `durationMs`: bounded operational fields;
- pseudonymized scope references when tenant/group correlation is required.

HTTP accepts a valid `traceparent` and safe `x-correlation-id`, creates a new server span, and returns both headers. Invalid/untrusted identifiers are replaced rather than echoed.

Hípico uses its existing staged observation model (`INBOUND` through `RECONCILIATION_HANDOFF`) and existing sanitized `correlationId`/candidate SHA. WhatsApp/JID/message contents remain excluded from telemetry metadata by default. Support identities are hashed/pseudonymized, not used as metric labels.

## Propagation

HTTP → application/service → DB/job/outbox/provider boundaries must pass the `TelemetryContext` explicitly or derive a child span with `childTelemetryContext`. Outbound HTTP/provider adapters use `propagationHeaders` after their existing authorization/SSRF checks. A telemetry exporter/collector failure is fail-open for business processing and must never change domain policy.

## Redaction/cardinality

Authorization, cookies, passwords, secrets, tokens, API keys, prompts, bodies, payloads and message content are excluded from telemetry attributes. Route templates, bounded-context names, operation names, outcome/status classes and provider names are acceptable low-cardinality labels. Tenant/user/JID/message IDs are forbidden as metric labels unless a documented exception exists; logs/traces use pseudonymized references instead.

## RED/USE and SLI baseline

No SLO percentage is hard-coded before measurements exist. For each critical bounded context, collect a versioned baseline window first:

| Context | RED/USE measurements | Initial SLI definition | SLO state |
|---|---|---|---|
| HTTP/API | request rate, error rate, route-template latency | successful non-5xx requests / eligible requests; p50/p95/p99 latency | `BASELINE_REQUIRED` |
| Hípico autonomous runtime | decisions, downgrades, duplicate prevention, latency | allowed successful outcomes without duplicate effect / eligible LAB events | `BASELINE_REQUIRED` |
| Outbox/reconciliation | queue depth, oldest age, sent/ambiguous/dead-letter rate | terminally reconciled messages / eligible messages; age distribution | `BASELINE_REQUIRED` |
| Providers/tools | call rate, timeout/429/5xx, latency, fallback | successful or safely downgraded calls / eligible calls | `BASELINE_REQUIRED` |
| DB/jobs | throughput, error rate, saturation/queue time | successful bounded operations / eligible operations | `BASELINE_REQUIRED` |

After a representative baseline is recorded, a separate reviewed change may define an SLO and error budget. The SLO record must include baseline dates, sample count, candidate/service versions, exclusion rules, chosen target and rationale. Promotion/release policy consumes that versioned SLO; it must not invent an aspirational target.

## Alert/runbook contract

Every alert must reference: affected SLI, impact, threshold derived from baseline/SLO, evaluation window, owner, first diagnostic query/dashboard, safe mitigation and escalation. Minimum operational signals are 5xx/error rate, high route latency, saturation/queue depth, oldest outbox age, failed/ambiguous reconciliation, dead-letter growth and autonomous-runtime downgrade growth. Alerts without a runbook are not production-ready.

## Exporter behavior

OpenTelemetry-compatible exporters may be connected behind the vendor-neutral context. Export is best-effort: collector outage returns telemetry failure to the instrumentation layer only and never fails a request, modifies a Risk/Promotion decision or grants authority.

GitHub Actions for the current operational batch remains `NOT VERIFIED / NON-BLOCKING`; observability correctness is not inferred from Actions status.
