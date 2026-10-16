# #756 — Delimitar errores FIFO esperados frente a fallos inesperados del servidor

## Diagnóstico

En `GET /api/v1/reports/inventory/ageing`, el `try/catch` abarca la transacción Prisma completa, incluidas lectura por tenant, movimientos, cálculo FIFO y proyecciones. La cláusula anterior `if (error instanceof TypeError)` trataba **cualquier** TypeError —incluidos fallos de programación o integración ajenos a FIFO— como `HTTP 409 AGEING_COHORT_RECONCILIATION_INVALID`. Eso ocultaba el origen del defecto con un conflicto falso de inventario.

## Corrección, sin cambiar el contrato funcional

- `FifoCohortError extends TypeError` identifica **únicamente** los errores esperados del módulo `fifo-cohort-drilldown.ts`: `FIFO_COHORT_QUERY_INVALID`, `FIFO_COHORT_QUANTITY_INVALID`, `FIFO_COHORT_INPUT_INVALID`, `FIFO_COHORT_INVALID` y `FIFO_COHORT_RECONCILIATION_FAILED`. Cada error conserva su `code` y su texto anterior para compatibilidad con consumidores puros de `TypeError`.
- El parser de opciones continúa traduciendo entradas inválidas a HTTP 400 **antes** de consultar DB. El error `StockAgeingError` de reconstrucción física sigue correspondiendo a HTTP 409 con su código original.
- La ruta de ageing ahora traduce **sólo** `FifoCohortError` al HTTP 409 `AGEING_COHORT_RECONCILIATION_INVALID`. Los TypeError ajenos al módulo no se ocultan: se delegan al manejador general sin fingir una incoherencia de inventario. No se exponen detalles internos de errores al consumidor; el contrato general del middleware sigue siendo responsable del 500 seguro.
- Se preservan `requireTenant`, `reports.view`, predicates `tenantId` de Producto y movimientos, `Prisma.TransactionIsolationLevel.RepeatableRead`, el límite de 5000 movimientos, cálculos BigInt milésimas, filtros FIFO fijos y personalizados, metadatos paginados y atribución `NOT_PHYSICAL_LOT_OR_LOCATION`.
- No se agrega SQL, DDL, escritura de inventario, migración, orden de compra ni efecto financiero.

## Evidencia ejecutada en el candidato

- Módulo `backend/src/modules/reports/fifo-cohort-drilldown.ts`: Git blob **`ecd9b4bbb836d4fa2ca3f0a9ce4e017ad63a1b3d`** verificado idéntico a espejo local por `git hash-object`. TypeScript 5.8.3, `tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --skipLibCheck`: **PASS**.
- Test `tests/fifo_ageing_error_boundary_v756.test.mjs`: Git blob **`2070646d7a83822ee7a1abc13fa030682a827a37`** idéntico byte a byte al archivo ejecutado. Node 22.16.0: **5/5 PASS** (pruebas funcionales filtradas por nombre). La sexta prueba, que inspecciona físicamente el router, **NO FUE EJECUTADA** localmente por falta del archivo `reports.routes.ts` íntegro en el espejo. Una primera ejecución sin filtro reportó ENOENT para ella; **no** corresponde a un fallo funcional demostrado del repositorio.
- Sobre `reports.routes.ts` y el módulo obtenidos **directamente de GitHub en la rama** se verificaron **16/16 predicados SOURCE_ONLY**, incluido el mismo contrato que busca la sexta prueba: import tipado, clasificación 409 limitada, tenant, RBAC, snapshot, sólo lectura, test runner incluido y coincidencia de blobs. Inspección estática **no** equivale a HTTP.
- El nuevo test está incluido en `backend/package.json` `test:reports`. No se ejecutaron `npm ci`, suite completa `npm run test:reports`, TypeScript/backend global, PostgreSQL17 con tenants A/B, HTTP 400/401/403/409, Playwright/E2E ni Docker; estado **NOT_EXECUTED/BLOCKED**. GitHub Actions `queued/skipped` tampoco constituye PASS. No se deshabilitó ningún check/workflow/protección.

## Backlog y rollback

Este cambio corrige una clasificación incorrecta de errores del reporte FIFO ya implementado. No cierra el issue #756; continúan pendientes política persistente por producto/location, autoridad de lotes/FEFO físico de #755, alertas/outbox y pruebas de integración multiempresa/QA. Reversión: revertir el squash de los cinco archivos; sin datos ni migraciones para restaurar. SOURCE_REUSE=NONE.
