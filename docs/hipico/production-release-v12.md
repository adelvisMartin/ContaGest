# Control Hípico — Production Release v12

## Autoridad e invariantes

Este bloque no agrega funcionalidades de producto. Congela y valida un candidato ya construido.

- SOURCE WhatsApp real permanece `READ_ONLY` durante QA y promoción.
- LAB es el único destino autorizado de escritura durante QA.
- `financialAuthority=false` y ningún LLM puede escribir DB, liquidar dinero o conceder autoridad.
- PostgreSQL servidor conserva autoridad; IndexedDB es proyección/offline/outbox.
- Un gate sólo es `PASS` cuando la evidencia corresponde al SHA candidato exacto.
- Jobs sin runner, `steps=[]`, sin logs o sin evidencia ejecutada son `BLOCKED`/`NOT_EXECUTED`, nunca `PASS`.

## Gates requeridos

`exact_sha`, `typecheck`, `unit_contracts`, `postgres16`, `backend_build`, `frontend_build`, `chromium_responsive_wcag`, `bridge`, `documents_pdf`, `providers`, `lifecycle_multigroup_replay`, `appsec_ssrf_rbac_secrets`, `pwa_offline`, `android_bridge_parity`, `performance`, `golden_corpus`, `observability`.

Cada registro de evidencia debe declarar el SHA ejecutado. `scripts/hipico-release-manifest-v12.mjs` normaliza el conjunto, genera una firma reproducible y deja `releaseEligible=false` si falta un gate, no pasó o pertenece a otro SHA.

## Rollout progresivo

La única secuencia ascendente permitida es:

`SHADOW → ASSISTED → AUTOMATIC_LOW_RISK → AUTOMATIC`

No se permiten saltos. Cada promoción requiere nuevamente los gates aplicables y revisión de métricas. El rollback puede volver desde cualquier estado a `SHADOW` inmediatamente.

## Kill switch y rollback

1. Cambiar la automatización afectada a `SHADOW` mediante el control canónico existente; no crear una segunda bandera de autoridad.
2. Mantener SOURCE `READ_ONLY`; no habilitar escritura para compensar una falla.
3. Detener workers/outbound sólo mediante los controles canónicos ya existentes si el incidente afecta envío.
4. Preservar outbox, receipts, reconciliation, audit y observabilidad. No borrar ni reescribir evidencia.
5. Registrar actor, motivo, candidate SHA, grupo/scope y hora del rollback.
6. Reconciliar estados ambiguos antes de reintentar; no reenviar a ciegas.
7. La recuperación inicia otra vez en `SHADOW` y asciende únicamente por la secuencia definida.

## Smoke final

El release no se considera ejecutado por crear el manifest. Antes de producción deben existir pruebas ejecutadas del mismo SHA para backend, PWA, Bridge y Android/paridad; smoke SOURCE sólo lectura; smoke LAB controlado; seguridad/RBAC/SSRF; replay/dedupe; receipts/reconciliation; y performance. Cualquier evidencia faltante conserva el release bloqueado.
