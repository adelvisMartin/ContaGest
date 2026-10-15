# POS / Bodega — búsqueda exacta por escáner (#765)

**Incremento:** solo lectura de catálogo; no implica POS terminado, venta emitida, pago autorizado ni reserva de inventario.

## Contrato integrado

`GET /api/v1/sales/pos/product-lookup?code=<SKU-o-barcode>`

- Requiere sesión autenticada, tenant de servidor y permiso `sales.view`, heredados de la frontera de ventas.
- `code` se normaliza con trim exterior, preservando cero inicial y mayúsculas. Longitud 1–64, caracteres ASCII alfanuméricos, `._:/-`. Arreglos, inputs no escalares y caracteres de control/SQL se rechazan (400).
- Consulta solo `Product.active=true` bajo `tenantId`, por SKU, barcode o `ProductCode` activo del mismo tenant con `kind=barcode`; `take: 2` para detectar colisiones entre campos.
- Resultado único: `{ok:true,data:{id,sku,barcode,name,unit},meta:{}}`. Ausente → 404, ambiguo entre productos → 409. `Cache-Control: private, no-store` incluso para errores.
- Sin costo, precio base, stock derivado, datos del cliente, movimiento de inventario, ventas ni escrituras. Para crear una venta, el cliente **debe** usar las rutas existentes `/sales` con resolución canónica de precio, validaciones financieras, auditoría e idempotencia.

## Verificación

```sh
node --experimental-strip-types --test tests/pos_barcode_lookup_v765.test.mjs
npm --workspace backend test
npm run typecheck
npm run build
```

Los cinco tests nuevos validan serialización de escáner, entradas inseguras, ambigüedad, contrato de ruta/tenant/RBAC y su inclusión en la suite. Las pruebas basadas en lectura de código **no** equivalen a E2E HTTP/Prisma.

**Pendiente antes de cierre #765:** PostgreSQL17 efímero con dos tenants, coincidencia de alias/colisiones de datos reales, permisos HTTP, barcode móvil/scanner, Cg* UI, caja/turnos, ventas, pagos, devoluciones, fiscal, ledger y reconciliación. Mantener issue abierto. `SOURCE_REUSE=NONE`.

## Reversión

Revertir el endpoint, la normalización y la incorporación del test; no hay DDL/migración ni estado persistente nuevo.
