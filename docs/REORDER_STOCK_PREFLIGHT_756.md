# #756 — Validación de stock antes de consultar ventas de reposición

## Incidencia corregida

El endpoint `GET /api/v1/reports/inventory/reorder` derivaba inicialmente los candidatos para el `groupBy` comercial dentro de `prisma.$transaction` con una llamada a `deriveReorderCandidates(products.map(buildInventoryStockHealth))`. El nuevo comprobador de stock introducido en #1075 se ejecutaba **después** de esa transacción y su `try/catch`. Un `TypeError` generado antes de realizar el `groupBy` podía abandonar la ruta sin convertirse en el `HTTP 409 REORDER_STOCK_PROJECTION_CONFLICT` prometido.

## Contrato tras la corrección

1. La ruta conserva `requireTenant`, `reports.view`, `where.tenantId=ctx.tenantId`, `active:true`, paginación `take/skip` y transacción `Prisma.TransactionIsolationLevel.RepeatableRead`.
2. Dentro de esa **misma transacción y antes de cualquier SQL de facturas**, el catálogo de la página se transforma en `buildInventoryStockHealth` y pasa por `prepareReorderStockPage`, que ejecuta `inspectReorderStockRows` una vez para todo el conjunto, separa excepciones, obtiene candidatos seguros y construye sus `salesCandidateIds`.
3. Si alguna disponibilidad no reconcilia con `stock-reserved`, una cantidad no es canónica o el dato es inválido, el `TypeError` se transforma a `HTTP 409 REORDER_STOCK_PROJECTION_CONFLICT` **antes del groupBy**. No se emite una consulta de ventas ni una recomendación parcial en esa solicitud.
4. Si hay stock negativo, reservas negativas, reservas excesivas o mínimo negativo pero las cantidades tienen aritmética coherente, esos productos continúan visibles en `rows`, `summary` y `planning.stockExceptions`, **sin entrar** en `planning.reorderCandidates`, `salesCandidateIds` ni la métrica comercial opcional.
5. `salesInvoiceLine.groupBy` sólo se ejecuta si `includeSalesEvidence=true` y hay candidatos seguros. Conserva `SalesInvoice.tenantId` del servidor, estatus emitido/pagado/vencido y ventana temporal. Los resultados del catálogo, excepciones y ventas proceden del mismo snapshot de una solicitud, no constituyen un cursor durable entre páginas.
6. `planning.reorderCandidates`, `planning.stockExceptions`, paginación, filtro opcional de ventas, `leadTimeReview` y metadatos conservan su esquema. No hay modificación de inventario, facturas, reservas, aprobaciones, pedidos ni migraciones. Ningún caso autoriza compras automáticas.

## Evidencia ejecutada y límites

- Archivo `backend/src/modules/reports/replenishment-candidates.ts`: **blob Git exacto** `d0b9cc87319a082ff065f8b12d7e21fb909a6a0c`; TypeScript 5.8.3 en modo `--noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --skipLibCheck`: **PASS**.
- `tests/reorder_stock_preflight_v756.test.mjs`: **blob Git exacto** `6e6c9785860980931f0f78b3feb3e1e992639cd5`. Test runner Node.js 22.16.0: **28/28 pruebas funcionales ejecutadas PASS**, entre casos de la nueva suite y los escenarios preexistentes de integridad y candidatos, mediante un espejo local que importa el helper exacto. Se excluyeron de ese recuento los casos que leen el router completo, no montado en el entorno local.
- La prueba número 11 de la nueva suite inspecciona el orden del código real en `reports.routes.ts` y está añadida al comando formal `backend/package.json` `test:reports`. Se inspeccionan por separado los predicados críticos directamente en la fuente GitHub de la rama; **no es prueba HTTP ejecutada**.
- `npm ci`, typecheck completo, PostgreSQL17 con tenants A/B, HTTP 400/401/403/409, browser/Playwright, concurrencia y despliegue: **NOT_EXECUTED/BLOCKED** por falta de checkout completo con dependencias. GitHub Actions QUEUED/SKIPPED nunca se denominan PASS.

## Backlog

#756 permanece abierto hasta políticas persistentes por almacén, FEFO físico/lotes #755, gestión de alertas/outbox, QA PostgreSQL y pruebas end-to-end; este cambio corrige el orden y error mapping de una función ya implementada y **no constituye el DoD global**.

**Rollback:** revertir los cuatro archivos del PR: helper, router, prueba y scripts, más este documento (cinco archivos). No hay DDL ni datos que restaurar. SOURCE_REUSE=NONE.
