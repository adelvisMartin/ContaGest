# #113 acceptance matrix

| Criterion | Repository evidence | Status |
| --- | --- | --- |
| Failure exposes cause + correlation ID | `observability.mjs`, `diagnostic-status.mjs` | IMPLEMENTED |
| Support bundle omits WhatsApp secrets/unneeded PII | central redaction + explicit allow-list + tests | IMPLEMENTED |
| Health distinguishes live/readiness/degraded | `classifyHealth`, `healthcheck.mjs` | IMPLEMENTED |
| Old backlog/LAB stop becomes measurable warning | backlog age + health reasons | IMPLEMENTED |
| Logs do not grow without bound | bounded rotation primitive | IMPLEMENTED; runtime soak proof pending #120 |

CI/runtime PASS is not asserted until the candidate SHA actually receives runners and soak evidence.
