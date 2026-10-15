# #756 — Invariantes derivadas de reposición (consistencia fail-closed)

## Defecto y objetivo

`inspectReorderStockRows` ya verificaba que `Product.stock - Product.reserved = availableExact` y segregaba existencias/reservas negativas, exceso de reservas y mínimos negativos. Sin embargo, la fila podía contener `shortfallExact`, `status` o `needsReorder` contradictorios aunque los saldos cuadra­ran. De esa forma, un cambio defectuoso en el servicio `buildInventoryStockHealth` podría ocultar candidatos de reposición o exponer sugerencias con déficits erróneos.

## Nuevas comprobaciones exactas

Para cada fila cuyo stock, reservas y mínimo son físicamente coherentes:

- `expectedShortfall = max(minStock - available, 0)`; el faltante serializado debe coincidir en **milésimas BigInt exactas**, sin redondear con JS Number. En caso contrario: `REORDER_SHORTFALL_MISMATCH`.
- Estado esperado con precedencia idéntica a `buildInventoryStockHealth`: `available <= 0 => out_of_stock`; `available < minStock => below_minimum`; `minStock > 0 && available === minStock => at_minimum`; en otro caso `healthy`. Si no coincide: `REORDER_STATUS_MISMATCH`.
- Bandera derivada esperada `needsReorder = minStock > 0 && available <= minStock`. Si no coincide: `REORDER_FLAG_MISMATCH`.
- El preflight `prepareReorderStockPage` **rechaza toda la página** ante incoherencia derivada, antes de devolver `salesCandidateIds`; el router existente convierte `TypeError` en HTTP 409 `REORDER_STOCK_PROJECTION_CONFLICT` dentro de `RepeatableRead` y antes de consultar `SalesInvoiceLine`. Sin cambios SQL.
- Productos con saldos físicamente inconsistentes mantienen su tratamiento previo: `planning.stockExceptions` y exclusión de candidatos comerciales; **no se interrumpen sólo porque su estado derivado carezca de sentido**. Sigue siendo necesaria conciliación manual.

Se corrigieron 7 fixtures de `tests/replenishment_candidates_v756.test.mjs` que cambiaban etiquetas sin ajustar los valores que las justifican. El contrato de usuario no cambia para filas producidas correctamente por el servicio canónico: `rows`, `summary`, `planning.reorderCandidates`, excepciones, paginación y ventas opcionales mantienen sus campos y cantidades. No se escriben saldos, reservas, facturas ni órdenes, y no hay DDL.

## Evidencia SHA y ejecución

- Helper `backend/src/modules/reports/replenishment-candidates.ts`: blob SHA `a27446c3789ea2f856e0acae7721c12f34c0f20a`; copia local byte-identical, TypeScript 5.8.3 `tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --skipLibCheck`: **PASS**.
- Nueva suite `tests/reorder_derived_invariants_v756.test.mjs`: blob SHA `db54c4847881209c6679f5f9783c4b8df55a00c2`, copia local byte-identical: Node.js 22.16.0 **12/12 PASS**. Casos de faltante sobre/subestimado, estado incompatible, bandera falsa/verdadera errónea, límite del mínimo, mínimo deshabilitado, Decimal(18,3) extremo, excepción y aborto del lote.
- Regresiones focalizadas adicionales contra el mismo helper exacto: `tests/reorder_stock_exceptions_v756.test.mjs` 11/11 PASS (blob previo `0ad45b458abff61f8de300b9f4427fa5b8d0e501`), 10/10 casos de preflight ejecutados desde la **copia histórica** `6e6c9785860980931f0f78b3feb3e1e992639cd5` con la prueba de inspección de router excluida por falta de checkout completo, y 7/7 casos heredados **equivalentes** adaptados localmente, no el archivo remoto formal. No atribuir a la suite oficial del monorepo resultados que provienen de este espejo.
- `backend/package.json` incorpora la nueva suite a `test:reports`. El test formal del router, `npm ci`, typecheck/build global, PostgreSQL17 multiempresa tenant A/B, HTTP 400/401/403/409, navegadores y Playwright: **NOT_EXECUTED/BLOCKED** por checkout completo/dependencias de backend inaccesibles. GitHub Actions `queued/skipped` no implica PASS.
- Inspección source-only del router exacto: `requireTenant`, `reports.view`, predicates `tenantId`, preflight antes de aggregate, `RepeatableRead`, respuesta de conflicto 409, cero escrituras y auto-purchases.

## Backlog y reversión

Este PR reduce riesgo de candidaturas inconsistentes, pero **#756 sigue OPEN**: políticas persistentes por producto/almacén, stock real por lote/FEFO #755, outbox, indicadores verdaderamente netos y QA PostgreSQL. No eliminar su trabajo pendiente del backlog por un incremento parcial. Revertir los cinco archivos del PR para rollback, sin migraciones ni datos que restaurar. `SOURCE_REUSE=NONE`. No se modifican checks, workflows ni branch protection.
