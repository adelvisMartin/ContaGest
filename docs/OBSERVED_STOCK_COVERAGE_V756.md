# #756 · Cobertura de stock según salidas físicas reconciliadas

**Versión:** `physical-outbound-coverage-v1`. **Rama:** `feat/756-observed-coverage-exact-20261015`. **Base:** `49dd0e1859f5aac8d39f0fb2342910e10754cb31`.

## Contrato funcional

Se amplía el endpoint ya existente `GET /api/v1/reports/inventory/slow-moving?productId=<UUID>&inactivityDays=90` con un nuevo objeto `coverage`. La respuesta anterior `product`, `activity` y `provenance` se preserva.

- El backend conserva el middleware `requireTenant` y `requirePermission('reports.view')`; el producto se lee por tenant autenticado y se selecciona `Product.stock` y `Product.reserved`.
- Los movimientos físicos `InventoryMovement.type='out'` ya se leen por producto/tenant desde historia completa y se contrastan contra `Product.stock` mediante `calculateStockAgeing`. Rechaza más de 5.000 movimientos o historia no conciliable; opera con transacción `RepeatableRead`.
- La cobertura matemática utiliza `available = stock - reserved`, sin asignar reservas como existencias libres. El ritmo observado se basa exclusivamente en salidas físicas `type='out'` registradas dentro de `inactivityDays` (entre 1 y 3650). **No equivale a previsión de ventas/demanda, venta real ni giro contable**; no se emplea para compra automática.
- `dailyPhysicalOutboundExact` en seis decimales y `coverageDaysExact` en dos (redondeo half-up) se calculan con `BigInt` sobre cantidades exactas con tres decimales. Nunca se suman o dividen cantidades usando coma flotante.
- Si no hay salidas en la ventana, la cobertura es `null` —jamás infinita, cero fingido ni forecast—, con estado `NO_PHYSICAL_OUTBOUND_SAMPLE` salvo que no haya stock disponible.
- Si la reserva excede el stock, la proyección falla cerrada con error `COVERAGE_RESERVES_EXCEED_STOCK` y la ruta responde conflicto mediante su guard de error existente. Si stock disponible es cero, muestra `NO_AVAILABLE_STOCK`.
- La salida declara `hasDemandForecast:false`, `createsPurchaseOrder:false`, `reconciled:true` y el origen `Product.stock-reserved+InventoryMovement.type=out`. No introduce nuevas tablas, migraciones, jobs, permisos, saldos derivados persistidos, ni escritura financiera.

## Pruebas y evidencia exacta

- Código de `backend/src/modules/reports/stock-coverage.ts` reproducido localmente con **SHA blob Git exacto `7c71a0d87d4c80a34ebd696a6afde06108802a1c`**. TypeScript 5.8.3 `tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --skipLibCheck`: PASS.
- **11/11 comprobaciones focalizadas Node22.16 ejecutadas**, incluyendo aritmética, reservas, ventana sin salidas, overflow decimal, redondeo, error por reserva excesiva y prohibición de auto-compra. Las pruebas focalizadas verifican el helper, **no** la ejecución de la ruta HTTP.
- `tests/stock_coverage_v756.test.mjs` incluye 11 regresiones, enlazadas a `npm --workspace backend run test:reports`; la regresión que inspecciona la ruta y la suite oficial completa siguen NOT_EXECUTED por ausencia de checkout/dependencias del repositorio.
- `git ls-remote https://github.com/adelvisMartin/ContaGest.git HEAD` desde contenedor: BLOCKED por `Could not resolve host: github.com`. Por ello `npm ci`, typecheck monorepo, compilación general, PostgreSQL17 efímero, tenant A/B (401/403/404), browser/E2E y despliegue exact-SHA quedan NOT_EXECUTED.
- GitHub Actions: se debe consultar la ejecución del PR exact-SHA; QUEUED/PENDING/SKIPPED nunca se denomina PASS.

## Falta para completar #756

Se mantiene la autoridad de #755 para inventario físico por almacén/lote/FEFO. En #756 faltan policy persistente configurable por producto/location (reorder point/qty/safety stock/lead time), forecasting sobre demanda comercial real, reconciliación SQL/tenant, alertas outbox, frontend/UX y QA integral. **No cerrar #756 ni eliminar su backlog funcional por este incremento.**

Rollback: revertir los cinco archivos del PR sin tocar datos, balances ni migraciones.
