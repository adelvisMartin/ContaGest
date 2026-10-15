# #756 · Intervalos configurables de antigüedad FIFO estimada

**Objetivo:** añadir una interpretación configurable al endpoint de antigüedad existente sin cambiar la autoridad del inventario ni su compatibilidad.

## API

`GET /api/v1/reports/inventory/ageing?productId=<UUID>&bucketDays=7,30,90`

- `bucketDays` es **opcional**. Sin el parámetro, la respuesta mantiene sus intervalos fijos originales `buckets`: 0–30, 31–90, 91–180 y 181+ días.
- Cuando se proporciona, debe contener **tres enteros positivos estrictamente crecientes**, separados por comas, con último límite máximo de 3650 días. Ejemplos válidos: `7,30,90`, `30,60,120`. No se aceptan espacios, ceros, valores duplicados, exponentes, arreglos ni claves inesperadas.
- Los parámetros mal formados se rechazan con HTTP 400 y código `AGEING_BUCKET_QUERY_INVALID` **antes de consultar la base de datos**.
- La respuesta añade `stockAgeing.customBuckets`, con `cutoffsDays`, cuatro objetos `ranges` de `fromDay`/`toDay` y `quantityExact` (milesimas como cadena decimal), y `source=RECONCILED_FIFO_ESTIMATE_NOT_LOT_ALLOCATION`.
- Los cohortes se obtienen únicamente **después de la conciliación exacta** entre historia de `InventoryMovement` y `Product.stock` en la transacción `RepeatableRead` existente, con autenticación `requireTenant`, `reports.view` y predicados `tenantId` en el servidor.
- Mantiene límite de 5000 movimientos, controles de orden y movimientos futuros, FIFO estimado, y rechazo por historial incompleto. Los cambios son sólo lectura. No hay migraciones, compras, correcciones de stock, asignación FEFO ni persistencia de agregados.
- Los rangos se calculan por duración en días de 24 horas desde el instante del servidor (igual que los intervalos originales), **no** mediante días calendario ni trazabilidad física real por lote. El indicador no sustituye #755.

## Pruebas y evidencia

- `configurable-ageing.ts`: helper puro exacto al blob Git `ffb1c4e056ed8746e1f2e17518108648ed3cf6cb`; 10/10 pruebas focalizadas **PASS** en Node 22.16 y `tsc --noEmit` con TypeScript 5.8.3 **PASS**.
- `tests/configurable_ageing_v756.test.mjs`: 13 pruebas oficiales escritas y enlazadas al comando `test:reports`. Incluyen compatibilidad con salida antigua, intervalos límites, agregación precisa, guardia ante ledger inconsistente y contrato del endpoint.
- La suite formal integrada, incluidas las 13 pruebas de checkout y las regresiones existentes, permanece **NOT_EXECUTED** en este entorno sin dependencias completas. Se cambió a `tsx --test` la suite antigua `stock_ageing_v756.test.mjs` y la nueva para resolver correctamente imports internos TypeScript `.js`→`.ts`.
- `npm ci`, typecheck total, PostgreSQL 17 multiempresa (A/B), 401/403/404, pruebas de grandes datos y Playwright siguen **NOT_EXECUTED / BLOCKED_INFRASTRUCTURE**. GitHub Actions en cola no constituye PASS.

## Backlog pendiente

#756 sigue abierto por políticas persistentes de reorder y lead time por ubicación, stock de seguridad, asignación física FEFO/lotes #755, alertas transaccionales y QA real de integración. Se puede revertir este incremento sin pérdida de datos revirtiendo sus seis archivos: un helper nuevo, dos archivos de código extendidos, una suite nueva, package.json y este documento.

**SOURCE_REUSE=NONE:** implementación original, sin copia de ERPNext/Tryton.
