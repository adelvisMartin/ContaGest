# #756 · Drill-down paginado de cohortes FIFO de inventario

## API y semántica

`GET /api/v1/reports/inventory/ageing?productId=<UUID>&includeCohorts=true&cohortTake=25&cohortSkip=0` (compatible con `bucketDays=7,30,90`).

El endpoint existente mantiene `requireTenant`, `reports.view`, filtros de `InventoryMovement.tenantId` y `Product.tenantId`, aislamiento `Prisma.TransactionIsolationLevel.RepeatableRead` y límite máximo de 5000 movimientos. Calcula toda la historia física FIFO y reconcilia primero contra `Product.stock`. Sólo entonces, opcionalmente, se proyectan los movimientos de entrada o ajustes positivos que aún conservan unidades en el modelo FIFO.

- `includeCohorts=true` activa `stockAgeing.cohortDrilldown`. Sin él, o con `includeCohorts=false`, la respuesta existente es idéntica. No se admiten `cohortTake/cohortSkip` sin optar explícitamente por el detalle.
- `cohortTake` entero 1–100 (por defecto 25), `cohortSkip` entero 0–5000 (por defecto 0). Únicamente cadenas decimales sin espacios, fracciones, signos, ceros a la izquierda o notación exponencial; parámetros ambiguos/arrays y keys adicionales se rechazan con 400 `AGEING_COHORT_QUERY_INVALID` **antes de consultar la DB**.
- El detalle conserva FIFO cronológico de supervivientes: `sourceMovementId`, `estimatedReceivedAt`, `ageDays`, `fixedBucket` (0-30, 31-90, 91-180, 181+) y `remainingQuantityExact`. Los buckets personalizados siguen disponibles independientemente en `customBuckets`, pero el campo `fixedBucket` indica el contrato de intervalos fijos, no el personalizado.
- La paginación reporta `totalCohorts`, `totalQuantityExact` del inventario entero **reconciliado**, `pageQuantityExact` exclusivamente de la página, `hasMore`, `nextSkip` y `REQUEST_SNAPSHOT_ONLY`. Las páginas son snapshots separados y podrían variar por nuevos movimientos; no constituyen un cursor persistente.
- El cálculo exige IDs únicos y ordenados, cantidades positivas expresadas en BigInt milésimas, timestamps válidos y `sum(remaining cohorts) === reconciled stock`, incluso si `cohortSkip` supera el total. Las incoherencias se rechazan fail-closed; `TypeError` del proyector se transforma en 409 `AGEING_COHORT_RECONCILIATION_INVALID`. El guard del algoritmo físico previo para historia incompleta o stock no conciliado permanece intacto.
- **PROVENIENCIA:** `RECONCILED_FIFO_ESTIMATE_NOT_PHYSICAL_LOT_OR_LOCATION`. La asignación a lotes, FEFO real, balances por almacén, valorización y reservas físicas pertenecen a #755. `physicalLotAllocationVerified=false` en cada fila. Ningún dato se crea o actualiza; no se generan compras ni balances alternativos.

## Evidencia disponible

- Helper puro `backend/src/modules/reports/fifo-cohort-drilldown.ts`: Git blob `8c86429a0cfebf055a8baf8390705db5ee9fe1cd` idéntico al archivo local que compiló usando TypeScript 5.8.3 `tsc --noEmit --target es2022 --module nodenext --moduleResolution nodenext --skipLibCheck`: **PASS**.
- Nueva suite `tests/fifo_cohort_drilldown_v756.test.mjs`: Git blob `4e6cceae6ee4e1753e39880739ee07afa235cfa7` idéntico a la copia realmente ejecutada con Node.js v22.16.0 y `--experimental-strip-types --test`: **15/15 PASS**, pruebas de query fail-closed, límites 100/5000, buckets, paginación exacta, grandes BigInt, orden/duplicados, fechas e inventario vacío o inconsistente.
- La suite se registra en `backend/package.json` `test:reports`. La conexión a `calculateStockAgeing` y al router se inspecciona en el SHA de la rama (evidencia SOURCE_ONLY, no ejecución HTTP).
- **NOT_EXECUTED:** suite completa del monorepo, instalación `npm ci`, typecheck/build global con todas las dependencias, PostgreSQL17 con tenants A/B, HTTP 400/401/403/409 y Playwright. El entorno no tiene checkout íntegro del backend. Los GitHub Actions `queued` o `skipped` no se consideran PASS. No se modifica ni desactiva ningún workflow/check.

## Dependencias y rollback

Esta es una entrega incremental y reversible de la capa de **drill-down FIFO reconciliado**, no el DoD global de #756. Siguen pendientes políticas persistentes por almacén/location, stock y FEFO físicos de #755, outbox y QA multiempresa/DB/E2E. Revertir este PR elimina helper/ruta/proyección/test/docs sin cambiar datos ni esquema. SOURCE_REUSE=NONE.
