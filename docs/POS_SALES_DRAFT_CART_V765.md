# #765 — Carrito POS de borrador dentro de Ventas

## Flujo integrado (sin transacción)

La ruta actual **Ventas** (`frontend/src/pages/SalesPage.jsx`) muestra la sección *Venta rápida · carrito en preparación* sin agregar otra ruta o introducir permisos de navegación paralelos. Un operador autenticado introduce SKU o código de barras; la pantalla consulta en vivo `BackendApi.list('products')` (API existente, no datos del Store desactualizados), aplica `matchPosDraftProduct` y, si existe exactamente una coincidencia en el catálogo devuelto, utiliza la utilidad de cantidades `addPosCartItem` ya mergeada en PR #1085. También permite quitar líneas.

- Coincidencia **exacta y sensible a mayúsculas** por `sku` o `barcode`; conserva ceros iniciales. Sin coerción implícita ni suposiciones de alias.
- Activos solamente; rechaza cadenas malformadas, catálogo inesperado, múltiples coincidencias y UUID no válido. No utiliza precio, stock, tasas o datos fiscales de esa respuesta.
- El listado de productos se obtiene con el cliente HTTP autenticado ya existente; RBAC/tenant siguen en el backend. Una falla HTTP o acceso denegado no permite agregar el producto.
- Solo guarda el borrador **en memoria de React**, con `productId` y cantidad exacta de tres decimales; no guarda copia offline ni emite documento. Cambiar el tenant reinicia el borrador y lo oculta mientras cambia el contexto. No introduce checkout.
- La vista informa **Sin total fiscal ni cobro confirmado**. No hay creación de venta, asiento, ajuste de stock, recepción de pago, cálculo de IVA ni reserva al agregar productos.

## Pruebas y evidencia

Ejecutar desde el monorepo:

```sh
npm --workspace frontend run test:pos:sales
# Sin instalar frontend:
node --test tests/pos_sales_draft_cart_v765.test.mjs
tsc --allowJs --checkJs --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext frontend/src/services/posProductLookup.mjs
```

Suite de 13 casos, de los cuales 12 prueban comportamiento puro sin DB y uno verifica la conexión del código en `SalesPage.jsx`. Se ejecutaron 12/12 casos puros (Node22.16) sobre blobs exactos GitHub y 12/12 aserciones del wiring directamente sobre la página GitHub; seis escenarios del submit del borrador con mocks también pasaron. Se ejecutó `tsc --checkJs --strict` en el helper puro.

**NOT_EXECUTED**: suite de 13 en checkout real, build Vite completo, Chromium/Playwright con 360/390/430px y modos claro/oscuro, PG17 tenant/role E2E, backend HTTP test de colisiones y duplicados. La ejecución visual material sigue pendiente de QA. Runners remotos QUEUED no son PASS.

## Límites y próximos tickets

La consulta `GET /products` puede ser paginada o incompleta: esta búsqueda de borrador **no certifica unicidad global del SKU**. La ruta autoritativa, con `take:2` y verificación tenant de ProductCode, continúa DRAFT en el PR #1068; solo debe habilitar un flujo de checkout al integrarse con pruebas HTTP/PG17 y seguridad. El resultado de UI jamás constituye factura ni verifica existencias disponibles.

El ticket #765 sigue OPEN para caja, turnos, checkout, pagos mixtos, conciliación, tasa FX, impuestos fiscales, reversos e integración PostgreSQL. `SOURCE_REUSE=NONE`.

Rollback: revertir la integración `SalesPage.jsx`, el helper, script y test/doc. No hay DDL, data migration ni side effects financieros.
