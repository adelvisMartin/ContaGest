# Control Hípico — Implementation Handoff del EPIC #102

## Propósito

Este documento marca la frontera entre **implementación** y **verificación** del roadmap de Control Hípico. No es una certificación de producción ni sustituye el QA físico, soak o la revisión de compliance.

Base inventariada: `main@47cb6e7465fed59d47c66c5ec79f1af75ca03ea7`.

## Estado de la fase de implementación

El código integrado en `main` ya contiene las foundations y wiring correspondientes a #103–#118, #121 y #150–#154: QA SHA-bound, Design System, matriz visual, modularización frontend, state machines, ledger exacto, corpus, SOURCE/LAB safety, shadow evaluation, spool v2 live/replay, observabilidad, AppSec, offline/PWA, autoridad backend, backup/restore, release identity, conversation engine, LAB simulator, response safety/handoff, conversational AppSec, compliance transport y promotion gate.

La fuente de verdad machine-readable es:

`ops/roadmap/hipico-implementation-handoff-v102.json`

El test `tests/hipico_epic_102_implementation_handoff.test.mjs` falla si desaparece una pieza crítica del inventario o si el handoff intenta representar implementación como release verificado.

## Lo que deliberadamente NO se declara

- `verified=false`.
- `releaseReady=false`.
- `productionWriteAllowed=false`.
- SOURCE permanece `READ_ONLY`.
- La decisión de compliance para escritura automatizada del flujo productivo permanece `NO_GO`.
- El EPIC #102 no se cierra desde este handoff.

## Siguiente fase: QA

### #119 Physical QA

El harness ya está implementado (`scripts/hipico-physical-qa-v119.mjs` + catálogo versionado), pero falta ejecutar la matriz física real sobre el candidate SHA: PWA/browser, PWA instalada, APK Android, lifecycle, offline/reconnect, SOURCE/LAB, sesiones y evidencia sanitizada.

### #120 Capacity & Soak

El harness/policy ya está implementado (`backend/scripts/hipico-soak-v120.ts` + `hipico-soak-policy.ts`), pero falta ejecutar al menos 24 h y preferiblemente 48–72 h para RC, con restart/reconnect y medición de memoria, backlog, latencia y duplicados.

## Regla de promoción

El código de #121 debe seguir fallando cerrado. Ningún porcentaje de parser, build, unit test o merge autoriza producción por sí mismo. Para cualquier cambio futuro de modo se requieren las evidencias definidas por el promotion gate y una decisión de compliance vigente.

## Secuencia operativa desde aquí

1. congelar un candidate SHA;
2. ejecutar QA automatizable/local sobre ese SHA;
3. ejecutar #119 Physical QA;
4. ejecutar #120 soak 24–72 h;
5. reconciliar findings y crear PRs correctivos independientes si aparecen defectos;
6. repetir sólo los gates afectados y la regresión correspondiente;
7. evaluar #121 sin modificar la decisión externa de #154 por inferencia técnica.

## Rollback

Este handoff sólo añade inventario, test contractual y documentación. Revertirlo no cambia runtime, base de datos, saldos, sesiones, transporte WhatsApp ni PWA/APK.
