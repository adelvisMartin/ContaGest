# #756 · Evidencia de ventas facturadas opcional en candidatos de reposición

## Contrato y compatibilidad

Rutas sin cambios: `GET /api/v1/reports/inventory/reorder?take=500&skip=0&onlyNeedsReorder=true`.

**Nuevo opt-in:** `GET /api/v1/reports/inventory/reorder?onlyNeedsReorder=true&includeSalesEvidence=true&salesWindowDays=90`.

- `includeSalesEvidence` sólo admite `true` o `false` exactos; por defecto `false`. Si es `false`, está prohibido enviar `salesWindowDays`. No se ejecuta consulta de facturas en modo predeterminado y la respuesta mantiene su objeto `planning` previo.
- `salesWindowDays` acepta 1–365 días completos (default 90 cuando se habilita). No admite arreglos, ceros, decimales, exponentes ni valores ambiguos. Los filtros de catálogo `take/skip/onlyNeedsReorder` conservan la validación existente.
- La búsqueda paginada de `Product`, su conteo activo y la agregación de `SalesInvoiceLine.quantity` se ejecutan dentro de la misma transacción `Prisma.TransactionIsolationLevel.RepeatableRead`. Sólo se consultan facturas para **productos que requieren reposición dentro de la página actual**. Las páginas posteriores son peticiones distintas sin snapshot persistente.
- Doble aislamiento: `Product.tenantId` y `SalesInvoice.tenantId` deben coincidir con el tenant autenticado; el router exige `requireTenant` y `reports.view`. El cliente nunca elige el tenant. Se consideran exclusivamente `SalesInvoice.status` = `issued`, `paid` o `overdue`, con `issueDate` dentro de la ventana; borradores y facturas canceladas no participan.
- La respuesta, sólo si se solicita, incluye `planning.salesEvidence`: versión `reorder-invoiced-evidence-v1`, origen, ventana, período/snapshot, cantidad exacta `grossInvoicedUnitsExact` por candidato, cantidad de líneas `invoiceLineCount` y `evidenceAvailable`. Productos sin registros facturados obtienen `0.000` y `evidenceAvailable=false`, lo que **NO** demuestra cero demanda.
- No se suman importes ni tasas de cambio: son unidades del mismo producto, con cadenas decimales de tres posiciones basadas en `BigInt` (sin floating-point). El indicador es **volumen bruto facturado**, no neto de notas de crédito, ventas perdidas, salida física ni forecast. No modifica `minShortfallExact`, políticas de reposición, inventario, pedidos, fiscalidad ni reservas; `purchaseOrderCreated=false`, `demandForecast=false`, `creditNoteNetting=false`.
- El límite de página existente (máximo 1000 productos) acota el tamaño del `groupBy`; no se generan N consultas por producto. Cuando no hay candidatos no se consulta `SalesInvoiceLine`. Se usa `cache-control: no-store`.

## Evidencia exact-SHA y límites

- `backend/src/modules/reports/reorder-sales-evidence.ts`: Git blob `52370ba29c2139aa7d06d34861fb87e490dc2c18`. Copia local SHA-identical; TypeScript 5.8.3 `tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --skipLibCheck`: **PASS**.
- `tests/reorder_sales_evidence_v756.test.mjs`: Git blob `e65d95e3c77f19ce2271759d2004d60957b95a31`. Node 22.16.0: **14/14 PASS** sobre el archivo idéntico; ya añadido a `backend/package.json` `test:reports`.
- Inspección de fuente de `reports.routes.ts` para ruta real, tenant, permisos, estado de factura, período, groupBy, snapshot, ausencia de mutaciones y opt-in. Esa inspección **no sustituye** una ejecución HTTP.
- **NOT_EXECUTED / BLOCKED_INFRASTRUCTURE:** `npm ci`, typecheck/build completo, suite monorepo, PostgreSQL17 tenant A/B, EXPLAIN/performance, HTTP 400/401/403/404, navegador y E2E: no checkout íntegro ni dependencias backend en sandbox. Los GitHub Actions en cola/omitidos no son PASS.

## Pendientes del ticket

#756 sigue abierto por política persistente por producto/location, safety stock, lead time, #755 balances físicos por lotes/FEFO, devoluciones y notas de crédito netas, outbox y QA integrada. Este incremento es opcional y sólo informativo; no declara completado el DoD.

**Rollback:** revertir los cinco archivos nuevos/modificados del incremento. Sin DDL, sin nuevos datos ni operaciones financieras. SOURCE_REUSE=NONE.
