# #756 — Filtro por intervalo en detalle de cohortes FIFO reconciliadas

## Consulta y compatibilidad

`GET /api/v1/reports/inventory/ageing?productId=<UUID>&includeCohorts=true&cohortBucket=day181Plus&cohortTake=25&cohortSkip=0`

El parámetro **opcional** `cohortBucket` filtra las cohortes FIFO supervivientes de la consulta de ageing existente por uno de los cuatro buckets físicos **estimados** del contrato:

- `day0to30` (0–30 días, inclusive);
- `day31to90` (31–90 días);
- `day91to180` (91–180 días);
- `day181Plus` (181 días o más).

El filtro sólo está permitido con `includeCohorts=true`; las solicitudes sin filtro o con `includeCohorts=false` mantienen la respuesta anterior exactamente (sin campo `filter`). La validación rechaza valores desconocidos, arrays, booleanos, mayúsculas diferentes, espacios, `null` y parámetros de filtro sin opt-in; la ruta existente devuelve HTTP 400 `AGEING_COHORT_QUERY_INVALID` ANTES de consultar PostgreSQL.

## Autoridad y orden de la operación

El endpoint original lee `Product` e `InventoryMovement` filtrando `tenantId` del contexto autenticado bajo `requireTenant`, `reports.view` y `Prisma.TransactionIsolationLevel.RepeatableRead`; carga un máximo de 5000 movimientos para reconstruir el historial completo. Primero se reconcilia la suma física FIFO de **todas** las cohortes contra `Product.stock`, rechazando cualquier historial incompleto o divergente. Sólo después se aplica el filtro a las entradas aún supervivientes.

- `stockAgeing.cohortDrilldown.totalCohorts` y `totalQuantityExact` siempre describen el stock completo previamente reconciliado.
- Con filtro se incorpora `filter.fixedBucket`, `filter.matchingCohorts` y `filter.matchingQuantityExact`, representando exclusivamente el intervalo solicitado.
- `rows` y `pageQuantityExact` pertenecen sólo a la **página filtrada**; `pagination.hasMore` y `nextSkip` avanzan en ese subconjunto (hasta 100 por página, offset máximo 5000), no en el catálogo completo.
- Si no hay cohortes en el intervalo, `rows=[]` y cantidades filtradas y paginadas `0.000`, pero `totalQuantityExact` conserva el stock completo; no hay un falso balance cero.
- Se conservan el informe de buckets fijos, los buckets personalizados `bucketDays`, la fecha de snapshot, la trazabilidad del movimiento de entrada y la interpretación `RECONCILED_FIFO_ESTIMATE_NOT_PHYSICAL_LOT_OR_LOCATION`. No se admite concluir saldo o asignación física de lote ni FEFO; eso permanece en #755.
- Los cálculos usan `BigInt` en milésimas exactas y no realizan nuevas consultas SQL, actualizaciones de inventario, compras o escrituras contables. No hay migración. Cada página es un snapshot de una solicitud, no cursor durable entre peticiones.

## Evidencia exacta ejecutada

- `backend/src/modules/reports/fifo-cohort-drilldown.ts`, Git blob **`de0b718d2ec89f68adcd3cf8b036fb8d17ae5686`**, verificado idéntico a copia ejecutada (`git hash-object`). Compilación aislada `tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --skipLibCheck`, TS 5.8.3: **PASS**.
- `tests/fifo_bucket_filter_v756.test.mjs`, Git blob **`6939a871f1b4c4e6b72bc85c14e2078ee4c7f95c`**, verificado idéntico a copia ejecutada. `node --experimental-strip-types --test` con Node v22.16.0: **12/12 PASS**, incluidas frontera de buckets, paginación de subconjunto, rechazo sin opt-in, total conciliado, conjuntos vacíos, BigInt grandes, invalidación de filtro desconocido y contrato sin filtro.
- La nueva suite está añadida a `backend/package.json` `test:reports`. Revisión estática del router de la rama: parámetro admitido y pasado al parser **antes** de la transacción, filtros por tenant y guardas. Esta revisión de fuentes **no** reemplaza pruebas HTTP.
- **NOT_EXECUTED/BLOCKED:** `npm ci`, full backend/monorepo build y typecheck, PostgreSQL 17 multiempresa, HTTP 400/401/403/409, Playwright/E2E, carga de 5000 movimientos y CI de GitHub con proveedor. `queued/skipped` no equivale a PASS. No se desactivaron checks, workflows ni branch protection.

## Backlog y reversión

Incremento relacionado con el criterio de aceptación drill-down de #756. **No cierra #756**: políticas persistentes por producto/location, lotes/FEFO físicos de #755, outbox/alertas y QA integral siguen pendientes. Se puede revertir el squash de los 5 archivos sin restaurar esquema ni datos. `SOURCE_REUSE=NONE`.
