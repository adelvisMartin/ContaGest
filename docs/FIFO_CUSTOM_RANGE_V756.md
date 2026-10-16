# #756 — Intervalos FIFO personalizados en el detalle de movimientos sobrevivientes

## Función y consulta

`GET /api/v1/reports/inventory/ageing?productId=<UUID>&bucketDays=7,30,90&includeCohorts=true&cohortRange=2&cohortTake=25&cohortSkip=0`

Se permite seleccionar uno de los **cuatro intervalos configurables** previamente definidos por `bucketDays` para filtrar las cohortes FIFO sobrevivientes. `cohortRange` es un índice (cadena exacta `0`, `1`, `2` o `3`) y requiere conjuntamente `includeCohorts=true` y `bucketDays` validado con 3 enteros crecientes entre 1 y 3650. Es **mutuamente excluyente** con `cohortBucket` (filtro fijo).

Para `bucketDays=7,30,90` los intervalos se definen como 0–7 días (`cohortRange=0`), 8–30 (`1`), 31–90 (`2`) y 91+ (`3`). Se utilizan los mismos límites incluyentes que `stockAgeing.customBuckets.ranges`. Parámetros inválidos, omitidos, arrays, índices fuera de rango, filtros simultáneos, no opt-in o `bucketDays` incompatible se rechazan **antes de consultar DB** con HTTP 400 `AGEING_COHORT_QUERY_INVALID` o `AGEING_BUCKET_QUERY_INVALID`.

## Aislamiento y exactitud

- La ruta conserva `requireTenant` y `reports.view`, tenant del contexto autenticado en las consultas de `Product` e `InventoryMovement`, `RepeatableRead`, orden estable por fecha/ID y límite 5000 movimientos. **No hay nuevo SQL**.
- FIFO reconstruye y reconcilia **todo** el historial contra `Product.stock` antes de aplicar cualquiera de los filtros de cohortes. Nunca se considera completo un historial divergente sólo porque un subconjunto cuadre.
- `totalCohorts` y `totalQuantityExact` representan el stock **global reconciliado**; `filter.type=CUSTOM_CONFIGURED_RANGE`, `rangeIndex`, `cutoffsDays`, `fromDay`, `toDay`, `matchingCohorts` y `matchingQuantityExact` describen sólo el intervalo elegido; `rows`, `pageQuantityExact` y `pagination` pertenecen sólo a la página filtrada, con sus flags `hasMore/nextSkip` calculados sobre el subconjunto. Los campos de resumen fijos y personalizados no cambian.
- El cálculo sigue en milésimas `BigInt`, sin pérdida por `Number`. Un intervalo sin coincidencias presenta 0 sólo para su subtotal, no como stock global cero.
- **Sin `cohortRange` el contrato existente se conserva**: `includeCohorts` omitido/false no añade detalle; el filtro fijo `cohortBucket` sigue siendo compatible y el drill-down sin filtro no recibe campo extra. `fixedBucket` en cada fila continúa indicando el intervalo fijo, aunque el filtro utilizado sea personalizado.
- El resultado identifica expresamente `RECONCILED_FIFO_ESTIMATE_NOT_PHYSICAL_LOT_OR_LOCATION` y `physicalLotAllocationVerified=false`; no representa ubicación física, lotes ni FEFO (#755). No autoriza órdenes, escribe stock o asientos, ni migra datos.

## Evidencia de esta integración

- Helper exacto `backend/src/modules/reports/fifo-cohort-drilldown.ts` con **Git blob `9fe3fb9baab4bb51979f5b99ca0785b5e47e55e0`** idéntico a copia local comprobada mediante `git hash-object`; compilación TypeScript v5.8.3 `tsc --noEmit --target es2022 --module nodenext --moduleResolution nodenext --skipLibCheck`: **PASS**.
- Test nuevo `tests/fifo_custom_range_v756.test.mjs`, **Git blob `627a50af6ab29e8938a5734b02c775884529e7ae`** idéntico al archivo ejecutado (Node v22.16.0). **13/13 casos PASS**: 4 índices, fronteras, exclusión de filtros simultáneos, petición sin autorización opt-in, descuadre de ledger en página vacía, total global/filtrado/página y precisión exacta.
- Regresiones existentes ejecutadas sobre este mismo helper: `tests/fifo_cohort_drilldown_v756.test.mjs` **15/15 PASS**, `tests/fifo_bucket_filter_v756.test.mjs` **12/12 PASS**, nuevo test **13/13 PASS**, total **40/40 Node tests PASS**. Todas son pruebas puras focalizadas, **no HTTP**.
- Añadida suite nueva a `backend/package.json` `test:reports`. Revisión de predicados SOURCE_ONLY de la ruta/módulo contra SHA actual de rama, no prueba HTTP/DB.
- `npm ci`, compilación total del backend, PostgreSQL17 tenant A/B, prueba HTTP 400/401/403/409, browser/Playwright y CI GitHub: **NOT_EXECUTED** en este entorno de desarrollo remoto sin monorepo completo. `queued`/`skipped` no equivalen a PASS. No se modificó `.github/workflows`, required checks ni branch protection.

## Backlog y reversión

Incremento de #756 sobre lectura/drill-down; la política persistente por producto/almacén, stock físico por lote/FEFO #755, outbox/alertas y QA real siguen pendientes. Mantener #756 **OPEN** hasta cumplir DoD. Cambio de cinco archivos, sólo lectura, sin DDL o datos a restaurar; revertir el squash para rollback. `SOURCE_REUSE=NONE`.
