# POS #765 — Consulta orientativa de existencias de todo el carrito

## Qué se implementó

Se añadió `POST /api/v1/sales/pos/stock-preview` a la ruta canónica de Ventas. Exige sesión y empresa autenticada mediante `requireTenant` y el permiso `sales.view`. Recibe entre 1 y 100 líneas de `productId` UUID y `quantity` como cadena Decimal(18,3), y consulta **únicamente** productos `tenantId`, `active:true`, `id IN...` a través de Prisma.

El cálculo de `stock - reserved` utiliza **BigInt de milésimas**; jamás Float o sumas JS de dinero. Responde por línea con `requested`, `stock`, `reserved`, `available`, `shortfall` y estado `available/shortage`. El resumen `ready` indica únicamente que los saldos globales **observados** parecen alcanzar para el borrador, no que estén reservados. Rechaza inventario inconsistente, producto ausente/desactivado/ajeno al tenant, UUID duplicado, cantidad cero, negativa, exponencial, más de 3 decimales o desbordamiento.

La pantalla `Ventas` incorpora el botón **Consultar stock disponible** y tabla de cantidades/faltantes. La petición es solo lectura incluso siendo `POST`; incluye `Cache-Control: private, no-store` y protección CSRF del cliente API existente. Si cambia empresa, carrito o cantidades durante la petición, el resultado queda desechado. Se invalida también al modificar líneas o reanudar otro carrito. Se valida la forma de la respuesta antes de mostrarla; los fallos de red mantienen el borrador intacto.

**Esta vista NO es promesa de stock:** no bloquea filas, no reserva, no valida lotes, sedes ni ubicación de los productos, no crea venta/factura, impuestos, cobros, idempotency key financiera, movimiento, devolución o asiento contable. La disponibilidad decisiva deberá evaluarse y consumirse atómicamente en el backend al cerrar un checkout autorizado.

## Archivos y pruebas

- `backend/src/modules/pos/pos-stock-preview.ts`: política pura de entradas y cálculo exacto.
- `backend/src/modules/sales/sales.routes.ts`: endpoint read-only, RBAC y tenant.
- `frontend/src/pages/SalesPage.jsx`: botón, resultados, errores, protección de sesión y revisión del carrito.
- `tests/pos_stock_preview_v765.test.mjs`: 20 pruebas del módulo y contratos de ruta+UI.
- `frontend/package.json`: comando nuevo `test:pos:stock`.

Ejecutar en un checkout con Node 22:
```sh
npm --workspace frontend run test:pos:stock
# Alternativa:
node --experimental-strip-types --test tests/pos_stock_preview_v765.test.mjs
npm --workspace backend run typecheck
```

### Evidencia comprobada

**20/20 casos** de la suite original ejecutados contra los mismos módulos y archivos de GitHub mediante V8 y eliminación de anotaciones TypeScript no ejecutables; 18 casos de lógica exacta, límites y seguridad + 2 contratos estáticos de ruta/UI. **9/9** escenarios de la función real de UI `checkPosStockPreview` extraída de `SalesPage.jsx`: éxito, faltante, desconexión, vacío, cantidades sin aplicar, cambio de empresa, edición concurrente, respuesta corrupta y doble clic. Se corrigió un escape doble de la regex de respuesta que esas pruebas detectaron antes del PR. Los blobs y SHA exactos de la entrega quedan en el PR.

**No ejecutado:** el runner nativo Node contra todo el repositorio, build Vite, typecheck monorepo TS, PostgreSQL17 HTTP tenant A/B, Browser/Playwright, pruebas de concurrencia de stock ni suite CI completa. Ninguna ejecución CI en cola se presentará como PASS; workflows, branch protections y verificaciones obligatorias no se modificaron.

## Riesgos / reversión / backlog

Sin DDL, migración, escrituras contables, fiscales o de inventario. Revertir el PR restaura exactamente las rutas/UI previas; no hay compensación de stock. El #765 permanece OPEN: implementar checkout idempotente con stock owner-scoped, lotes y location, caja/turnos, pagos mixtos, fiscal/localización, banking/ledger y QA real antes de certificar el POS.
