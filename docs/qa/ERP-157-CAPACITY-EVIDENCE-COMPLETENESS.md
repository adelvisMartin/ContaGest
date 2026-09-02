# ERP #157 — contrato completo de evidencia de capacidad

## Hallazgo

La primera versión de la policy/gate medía latencias agregadas y perfiles frontend, pero no convertía en campos obligatorios varias dimensiones expresas del issue: workload por tipo de usuario, 1×/3× del pico, query/N+1/slow-query, saturación del pool, deadlocks, aislamiento cross-tenant, procesos pesados y escenarios de degradación.

## Policy v2

La evidencia ahora debe declarar:

- perfiles `finance-admin`, `operations-clerk`, `read-only-analyst`;
- pico concurrente observado/declarado por QA (no se inventa en la policy);
- cargas 1× y 3× medidas;
- fixtures sintéticos o sanitizados;
- frontend: startup, cambio de ruta, save, import 1k, tablas 100/1k/10k, heap y long tasks;
- backend: p50/p95/p99, throughput, error rate, DB query p95, pool saturation, slow queries, N+1, deadlocks y cross-tenant leaks;
- import/export/report: success, controlled error y cancelación o contrato explícito de no cancelabilidad;
- slow DB, pool saturation, external timeout, memory pressure, large payload y multi-user concurrency;
- al menos una referencia de profiling evidence.

## Semántica de verdad

Un valor ausente o una dimensión no medida deja el verdict en `NOT_EXECUTED`. Una métrica observada que viola budget produce `FAIL`. Sólo una evidencia completa dentro de los budgets provisionales puede producir `MEASURED_PROVISIONAL` mientras `targetsAreProvisionalUntilMeasured=true`.

La policy no inventa cuántos usuarios constituyen el pico real: ese número debe salir del workload observado/esperado del deployment objetivo y quedar registrado en el artifact del candidate SHA.

## Privacidad

`environment.sanitizedFixtures` debe ser `true`. PII real no es requisito ni se permite como condición para completar el gate.
