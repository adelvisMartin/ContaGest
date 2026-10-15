# POS #765 — Carrito temporal con cantidades exactas

**Estado:** incremento aislado y reusable; no implica que POS/Bodega esté completo. SOURCE_REUSE=NONE.

## Responsabilidad

`frontend/src/services/posCartPolicy.mjs` es una máquina de estado de borrador puramente local para las líneas del carrito. Las funciones `addPosCartItem`, `setPosCartQuantity` y `removePosCartItem` reciben y devuelven arrays inmutables de `{productId, quantity}`; no conservan precio, IVA, impuestos, inventario ni metadata no canónica. Los UUID proporcionados al cliente son IDs **provisionales**: toda conversión a factura requiere autenticación, RBAC, tenant, resolución real de productos, precios y disponibilidad desde el backend.

- Producto: UUID con guiones normalizado a minúsculas; cadenas de otro formato fallan, sin interpolar datos en SQL.
- Cantidad: solo string decimal exacto, no float ni exponencial. Precisión hasta 3 decimales; compatible con el límite de `Decimal(18,3)` del dominio existente. `bigint` para sumar sin errores de coma flotante.
- `add`: unifica el mismo producto y agrega cantidad intencionalmente, con valor por defecto de `1.000`. **No es idempotente**: el consumidor debe evitar procesar dos veces el mismo evento de escáner.
- `set`: reemplaza cantidad sin introducir un producto que no exista.
- `remove`: idempotente, única operación válida para eliminar cantidades a cero.
- Máximo 100 productos distintos por carrito, entrada no confiable/duplicada rechazada, snapshots de salida inmutables.

## Prueba y reproducibilidad

```sh
npm --workspace frontend run test:pos:cart
# Alternativa sin instalar paquetes:
node --test tests/pos_cart_policy_v765.test.mjs
tsc --allowJs --checkJs --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext frontend/src/services/posCartPolicy.mjs
```

Suite de 21 pruebas Node 22: suma decimal exacta, máximo de líneas, extremos `Decimal(18,3)`, UUID, entradas hostiles, duplicación, borrado, snapshots inmutables, orden y ausencia de precios. El comando npm específico está registrado en `frontend/package.json`. La prueba aislada no demuestra el build global, visual QA, ni pruebas de una API o PostgreSQL.

## Contratos y dependencias restantes

Los servicios de ventas e inventario mantienen autoridad absoluta sobre producto/tenant, precio canónico, impuestos/FX, stock, reservas y emisión de factura. Las operaciones financieras y los pagos pertenecen a sus servicios backend; jamás contabilizar una cantidad transmitida por el cliente sin validación del servidor.

La consulta de productos SKU/barcode y su matriz HTTP/RBAC/PG17 siguen pendientes en el PR #1068. El cálculo de propuesta de pagos mixtos del PR #1078 ya se integró separadamente. Este cambio **no** añade pantalla táctil, flujo de checkout, caja, pago, fiscal, DB, API ni persistencia offline. Ticket #765 permanece abierto hasta su DoD.

Rollback: revertir los nuevos archivos y el script de frontend; no se modifica esquema ni estado persistente.
