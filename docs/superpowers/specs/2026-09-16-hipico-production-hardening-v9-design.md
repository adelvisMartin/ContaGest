# Control Hípico v9 — Production QA / Release Hardening Design

## Contexto

La Implementación 9/12 endurece el cierre de producción definido por #290 sobre la cadena apilada v6 → v7 → v8. La rama base es `refactor/hipico-core-v8@d40a00134104bd7f6ad3d72e9b6ff267a7b94f75`.

El repositorio ya contiene una suite v290 sustancial: exact-SHA gate, PostgreSQL efímero, RLS/RBAC probes, TestChannel E2E, restart/replay, OCR/PDF/provider/race integration, perfil 100/500/2000, Chromium, matriz de navegadores, Android, security audits, evidencia por SHA y release report. La Implementación 9 no reemplaza esa infraestructura: la lleva al estado actual del producto y cierra gaps detectados después de v6-v8.

## Objetivo

Producir evidencia reproducible, fail-closed y ligada al SHA exacto para el estado actual de Control Hípico, sin convertir un runner roto o una prueba no ejecutada en PASS y sin habilitar autoridad financiera, SOURCE write o automatización fuera de sus gates.

## Gaps concretos a cerrar

1. El chain PostgreSQL v290 termina en v22 aunque v6/v7 introdujeron v23/v24.
2. El release guard y release report todavía publican `v12-v22`.
3. La suite de esquema no comprueba las columnas/constraints de Risk Policy v23 y Shadow Metrics v24.
4. El workflow de #290 sólo dispara PRs cuyo base es `main`, por lo que un PR apilado sobre v8 no obtiene señal exact-SHA.
5. La verificación de evidencia considera varias evidencias de código como opcionales aunque el release report las trata como gates obligatorios.
6. El release report no materializa los readiness caps de #290 ni diferencia claramente readiness de código, automatización y promoción estable.
7. Los contratos v290 no congelan explícitamente las fronteras agregadas en v6-v8: policy determinista, dual-window promotion y refactor facade/outbox authority.

## Arquitectura

La Implementación 9 conserva el pipeline existente y agrega endurecimiento incremental:

`candidate SHA -> static/security contracts -> isolated PostgreSQL v12-v24 -> domain/replay/restart/data/agent -> browser -> Android -> evidence integrity -> release verdict/report`.

No se crea un segundo sistema de QA ni un segundo formato de autoridad. `scripts/hipico-*v290.*` y `.github/workflows/hipico-production-gates-v290.yml` siguen siendo la superficie canónica de release hardening.

## PostgreSQL v12-v24

`hipico-apply-e2e-schema-v290.mjs` debe aplicar v23 y v24 después de v22 y probar su resultado real:

- `policy_disposition`, `policy_reason`, `policy_version`, `policy_evidence_state` existen y son NOT NULL;
- `abstained`, `race_context_error`, `metric_schema_version` existen y son NOT NULL;
- constraints de disposition/evidence/schema-version existen;
- `hipico_agent_evaluations_review_once` permanece instalado después del chain completo;
- browser/authenticated sigue sin poder escribir automatización, policy o evidencia server-authoritative;
- v23/v24 siguen replay-safe dentro del PostgreSQL efímero.

## Gates de código actuales

El gate estático debe ejecutar las regresiones Hípico actuales, incluyendo las de v6-v8. El release guard debe comprobar que existen y están integradas las fronteras actuales:

- deterministic Risk Policy `AUTO | SUGGEST | HUMAN_REQUIRED | DENY`;
- LLM advisory-only;
- `financialAuthority=false` y `directEffectsApplied=false`;
- dual-window historical + recent metrics/promotion;
- SOURCE SHADOW/read-only;
- canonical outbox authority, lease/idempotency/receipts/reconciliation;
- refactor v8 conserva facades públicas y módulos internos separados.

## Evidence integrity

Para code-review readiness se requieren evidencias SHA-bound de:

- secret scan;
- release guard;
- static gate;
- PostgreSQL RBAC/schema gate;
- restart/recovery;
- performance/load profile;
- Chromium;
- security;
- Android;
- release manifest limpio.

Una evidencia ausente, con SHA distinto, schema inesperado o estado diferente de PASS no puede producir PASS agregado.

La matriz Firefox/WebKit y QA físico permanecen requisitos de promoción estable, no se falsifican en PR si no se ejecutan.

## Readiness model

El release report debe exponer tres ejes:

- `codeReviewStatus`: gates de código ejecutables en PR;
- `automationReadiness`: `VERIFIED` sólo si el evidence chain, Agent/Shadow y race-context relevantes están PASS en el mismo SHA; en otro caso `NOT_VERIFIED`;
- `stablePromotionStatus`: incluye browser matrix + physical QA.

Además se calcula `readiness.score` sobre 0-100 con caps explícitos de #290:

- P0 abierto: máximo 60;
- required code gate FAIL: máximo 79;
- security critical: máximo 69;
- race-context correctness no verificada: máximo 70;
- automation no shadow-validated: `automationReadiness=NOT_VERIFIED`.

No se infiere P0/security-critical como ausente si no existe evidencia; el report acepta env/evidence explícita y falla conservadoramente en los campos que correspondan.

## Browser, PWA y Android

Se conserva Chromium como PR gate y Chromium/Firefox/WebKit para scheduled/manual full validation. La suite existente debe seguir cubriendo responsive, keyboard/focus, reduced motion y WCAG según `playwright.hipico-matrix.config.mjs`/fixtures vigentes. Android debe conservar sync/verify de PWA antes del APK y release manifest SHA-bound.

## Performance

Se conserva el perfil determinista 100/500/2000 sobre PostgreSQL, provider normalization y domain reducer, con memoria y query-plan. La evidencia de hardware físico i5 6th gen / 16 GB permanece separada y `NOT_EXECUTED` hasta existir medición real; el CI nunca la transforma en PASS.

## CI y bloqueo de infraestructura

El workflow debe poder ejecutarse en PR apilado y en PR a main, siempre con checkout del candidate SHA exacto. `runner_id=0`, `steps=[]`/sin steps/logs se clasifica `BLOCKED_INFRASTRUCTURE`, no FAIL de código ni PASS.

No se permiten `continue-on-error: true`, `|| true`, `test.skip`, `test.only`, `waitForTimeout`, acciones browser forzadas ni timeouts gigantes para fabricar verde.

## Compatibilidad / no-regresión

- No cambiar rutas HTTP ni payloads esenciales de Agent/Operator/Outbox.
- No habilitar dinero ni escritura SOURCE.
- No modificar semántica de policy/promotions/outbox para hacer pasar release gates.
- No debilitar tests existentes.
- Mantener PostgreSQL servidor como verdad autoritativa.

## Criterio de cierre

La implementación está `IMPLEMENTED` cuando código, contratos, workflow y reportes quedan publicados en un PR v9. Sólo está `VERIFIED` si los gates del candidate SHA ejecutan realmente y pasan. Si GitHub Actions no asigna runner/steps, el PR permanece DRAFT y se reporta `BLOCKED_INFRASTRUCTURE`.
