# POS #765 — Ventas usa la búsqueda autoritativa de productos

La pantalla existente de Ventas ahora consulta **GET /api/v1/sales/pos/product-lookup?code=** mediante `BackendApi.get`. Este endpoint ya integrado desde PR #1068 autentica tenant y permiso `sales.view`, busca SKU, barcode y ProductCode activos, limita coincidencias a 2 y devuelve 409 cuando el código es ambiguo. La UI ya no decide unicidad sobre una lista de productos posiblemente paginada.

El código se normaliza con `normalizePosLookupCode` y se envía codificado. `acceptServerPosProduct` valida UUID, SKU, nombre y tipo de barcode, preserva únicamente identidad sin precios, stock ni datos fiscales; los alias ProductCode funcionan aunque sean distintos de SKU/barcode. La UI muestra errores diferenciados 400, 404, 409 y conexión/permiso, y descarta respuestas de otro tenant si cambia la empresa durante la llamada.

El resultado se incorpora al **borrador local**, mediante `posCartPolicy`, sin checkout, factura, impuestos, cobros, inventario ni persistencia.

## Pruebas

```sh
npm --workspace frontend run test:pos:lookup
node --test tests/pos_authoritative_sales_lookup_v765.test.mjs
```

Se verificaron **10/10** escenarios de validación e integración directamente sobre los mismos blobs GitHub de página, helper y tests. La suite nativa se incorporó para ejecución posterior con el checkout. **NOT_EXECUTED**: npm ci/full tests, build Vite, navegador Playwright, HTTP real con PG17 y tenant A/B. Las ejecuciones CI en cola no se consideran PASS.

No se modifica backend ni migraciones. Rollback: revertir la página Ventas, el helper de normalización, el test, el script y este documento. Issue #765 requiere todavía caja, turnos, pagos, fiscal/ledger, inventario y QA integral.
