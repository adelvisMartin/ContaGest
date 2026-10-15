# #756 — Actividad comercial observada por unidades facturadas

## Contrato y autoridad

Ruta de solo lectura: `GET /api/v1/reports/inventory/invoiced-activity?productId=<UUID>&windowDays=90&take=25&skip=0`.

Esta consulta agrega **unidades de líneas de facturas** (`SalesInvoiceLine.quantity`), no salidas físicas ni pronóstico de demanda. Se usan exclusivamente facturas con estado `issued`, `paid` u `overdue`. Se excluyen `draft` y `cancelled`. Las notas de crédito, cancelaciones históricas/retornos y su conciliación todavía **no se netean**; el resultado se identifica como **gross invoiced units**.

- Producto buscado por `id + tenantId` autenticado y activo. Líneas restringidas por `productId` y por `invoice.tenantId` del contexto autenticado.
- El router aplica `requireTenant` y `requirePermission('reports.view')`. El usuario nunca suministra `tenantId`.
- Ventana `windowDays` entre 1 y 365 (por defecto 90) desde la hora del servidor hasta el snapshot actual. `take` 1–100 (por defecto 25), `skip` 0–1.000.000. Se rechazan arreglos, valores ambiguos, negativos y claves desconocidas con error 400.
- `Product`, agregado `SalesInvoiceLine.aggregate` y página `SalesInvoiceLine.findMany` se leen en transacción Prisma `RepeatableRead`. La suma y el conteo pertenecen a la misma instantánea que el detalle. El detalle está ordenado por fecha de factura descendente y `line.id` descendente, con `pagination.hasMore` y `nextSkip`.
- Todos los valores de cantidad son **cadenas decimales exactas con 3 posiciones**, nunca flotantes JavaScript; las cantidades de unidades pueden sumarse aunque las facturas tengan diferentes monedas porque no se suman importes, precios ni tasas FX.
- La respuesta contiene identidad mínima de producto, total `grossInvoicedUnitsExact`, número de líneas, y las referencias de documento necesarias para drill-down (sin importes privados ni datos personales de clientes). No crea movimientos, facturas, reservas, compras ni registros derivados. `cache-control: no-store`.
- Esta métrica es una señal comercial de ventas facturadas **observadas**, no una autoridad de stock, demanda no satisfecha, previsión, rotación neta o inventario disponible. Nunca autoriza compra automática.

## Evidencia de desarrollo y prueba

- `backend/src/modules/reports/invoiced-unit-activity.ts` verificado con blob Git `c27282a8230c69c365b592935a1395e857d4ec14`; la copia exacta compiló con `tsc 5.8.3 --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --skipLibCheck`: **PASS**.
- `tests/invoiced_unit_activity_v756.test.mjs` coincide con blob Git `a497826a4c24c131bf5d7bb199f3092b73215d05`. Se ejecutaron las primeras **12/12 pruebas funcionales PASS** en Node 22.16.0 (cantidad, agregación, paginación, estatus, snapshot y datos malformados); se aisló la prueba 13, que requiere el router del monorepo no disponible en este contenedor.
- Nueve inspecciones de contrato en `reports.routes.ts` se ejecutaron contra la fuente exacta de la rama mediante GitHub: RBAC, doble predicado tenant, estatus excluidos, ventana de fecha, agregado, paginación, snapshot y ausencia de mutaciones: **9/9 VERIFIED_SOURCE**, no un test PostgreSQL.
- `backend/package.json` integra los 13 tests oficiales en `test:reports`. **NOT_EXECUTED**: suite completa del monorepo, `npm ci`, compilación global, PostgreSQL 17 multi-tenant/HTTP (A/B, 401/403/404), E2E y navegación; el sandbox no dispone del checkout íntegro ni de dependencias backend.
- GitHub Actions pendientes o saltados no son PASS. La documentación no certifica producción.

## Requisitos restantes del issue #756

Persistencia de políticas por producto/almacén (mínimo/máximo/safety stock, lead time, habilitación), FEFO y balances físicos reales por lote de #755, retorno/nota de crédito neta, forecasting de demanda ajustada, outbox, reconciliaciones multiempresa PostgreSQL y QA integral. El ticket **permanece abierto**; este PR constituye un incremento comercial verificable, no el DoD completo.

**Rollback**: revertir los cinco archivos de este PR. Sin DDL, sin datos que restaurar y sin escrituras contables.
