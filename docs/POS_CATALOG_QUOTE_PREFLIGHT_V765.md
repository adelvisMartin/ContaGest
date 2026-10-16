# POS #765 — Estimación de catálogo desde el backend canónico

## Qué quedó integrado

El backend de Ventas proporciona `POST /api/v1/sales/pos/catalog-quote-preview`, protegido por `requireTenant` y `sales.view`. Recibe el mismo esquema estricto de hasta 100 líneas del preflight de existencias: UUID de producto y cantidad exacta Decimal(18,3).

Consulta exclusivamente productos activos del tenant autenticado mediante Prisma, en una lectura sin bloqueo, y obtiene `id,sku,name,price,taxRate,stock,reserved`. Para cada línea se exige además `expectedSku` con validación estricta de código escaneable; el backend compara el SKU **exactamente** (respetando mayúsculas y ceros iniciales) con el producto de ese tenant. Si el identificador continúa igual pero su SKU fue reasignado, renombrado o no coincide, devuelve conflicto `409` (`POS_CATALOG_SKU_CHANGED`) **antes** de calcular subtotal/impuesto/total. El cliente también rechaza respuestas que no repiten su SKU esperado. Reutiliza **`validatePosStockLines`**, **`previewPosStock`** y **`calculateInvoiceTotals`** (la misma política de subtotal/IVA/total que `POST /sales`). La ruta no permite al navegador fijar precios, tasas fiscales ni moneda y nunca escribe ventas, ledger, pagos o movimientos de inventario.

La pantalla **Ventas** incorpora el botón *Consultar importe del catálogo*, una tabla de cantidades, precios y tasa de catálogo y un resumen de base, impuesto y total estimado. El resultado se descarta si cambia la empresa o la versión/identidad del carrito durante la llamada; no se aceptan respuestas con campos monetarios malformados. La consulta es single-flight y exige aplicar las cantidades pendientes antes de comenzar.

**Límite explícito de autoridad:** el producto no dispone de un campo de moneda vinculado a `Product.price`; por ello la respuesta usa `currency:null`, `readOnly:true`, `authoritativeForCheckout:false`, `fiscalLocalizationApplied:false`, `priceListsApplied:false` y `pricingBasis:'current_product_catalog'`. Los importes son **estimaciones sin moneda fiscal confirmada**, NO cotizaciones vinculantes ni validaciones de caja, FX, IGTF, retenciones, precios por lista, descuentos, promociones o localización venezolana. El stock global es una fotografía y no acredita ubicación/lote ni autoriza cobrar. La validación fiscal y el descuento atómico deben ejecutarse más adelante dentro del checkout transaccional.

## Archivos y QA

- `backend/src/modules/sales/sales.routes.ts` — endpoint seguro, lectura tenant-only y uso de políticas canónicas.
- `frontend/src/pages/SalesPage.jsx` — interfaz de consulta y avisos.
- `tests/pos_catalog_quote_preflight_v765.test.mjs` — 11 pruebas de ruta, permisos, respuesta estimativa, errores y enlace UI.
- `frontend/package.json` — comando `test:pos:catalog-quote`.

Comandos de ejecución en un checkout:

```sh
npm --workspace frontend run test:pos:catalog-quote
node --test tests/pos_catalog_quote_preflight_v765.test.mjs
npm --workspace backend run typecheck
```

**Evidencia tras endurecer la identidad:** 17/17 casos del test de ruta fuente ejecutados en V8 con el código exacto de GitHub y dobles explícitos de Prisma/stock/calculador; seis regresiones nuevas de SKU divergente con mismo UUID, mayúsculas, ceros iniciales, SKU ausente, validación Zod estricta y eco de identidad. 10/10 escenarios del manejador real de Ventas con API/estado simulado, incluidos SKU incorrecto, SKU ausente, cero inicial, carrito editado durante petición y doble pulsación. Los mocks no prueban que Prisma, Zod o PostgreSQL funcionen integrados; esa evidencia sigue pendiente.

**Pendiente de ejecutar:** runner nativo Node contra un checkout, `tsc` completo, Prisma/PG17 real, build Vite, Chromium/E2E, controles RBAC A/B y workflow CI. No se debe atribuir PASS a nada de lo anterior, ni a jobs remotos en cola.

## Rollback, dependencias y cierre

Rollback: revertir los cuatro archivos y este documento; no existen migraciones ni efectos persistidos. #765 continúa **OPEN/PARTIAL**: turno/caja, listas de precio y localización, checkout con idempotencia, inventario atómico owner-scoped y por lote/sede, pagos mixtos, reversos, auditoría y conciliación financiera necesitan integración y QA transaccional real. No cambiar el estado del issue por este incremento.