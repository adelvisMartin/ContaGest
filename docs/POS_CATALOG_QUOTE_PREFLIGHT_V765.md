# POS #765 — Estimación de catálogo desde el backend canónico

## Qué quedó integrado

El backend de Ventas proporciona `POST /api/v1/sales/pos/catalog-quote-preview`, protegido por `requireTenant` y `sales.view`. Recibe el mismo esquema estricto de hasta 100 líneas del preflight de existencias: UUID de producto y cantidad exacta Decimal(18,3).

Consulta exclusivamente productos activos del tenant autenticado mediante Prisma, en una lectura sin bloqueo, y obtiene `id,sku,name,price,taxRate,stock,reserved`. Reutiliza **`validatePosStockLines`**, **`previewPosStock`** y **`calculateInvoiceTotals`** (la misma política de subtotal/IVA/total que `POST /sales`). La ruta no permite al navegador fijar precios, tasas fiscales ni moneda y nunca escribe ventas, ledger, pagos o movimientos de inventario.

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

**Evidencia obtenida:** 11/11 casos del test ejecutados en V8 sobre el código exacto de GitHub (`new Function` con dependencias de base de datos, política de stock y cálculo de facturas simuladas); 9/9 escenarios del manejador `checkPosCatalogQuote` extraído del archivo real de Ventas, incluidos éxito, error de red, carrito vacío, cantidad pendiente, cambio de tenant/revisión, respuesta fiscal inválida, importes malformados y doble clic.

**Pendiente de ejecutar:** runner nativo Node contra un checkout, `tsc` completo, Prisma/PG17 real, build Vite, Chromium/E2E, controles RBAC A/B y workflow CI. No se debe atribuir PASS a nada de lo anterior, ni a jobs remotos en cola.

## Rollback, dependencias y cierre

Rollback: revertir los cuatro archivos y este documento; no existen migraciones ni efectos persistidos. #765 continúa **OPEN/PARTIAL**: turno/caja, listas de precio y localización, checkout con idempotencia, inventario atómico owner-scoped y por lote/sede, pagos mixtos, reversos, auditoría y conciliación financiera necesitan integración y QA transaccional real. No cambiar el estado del issue por este incremento.