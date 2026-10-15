# #756 Stock ageing — estimación FIFO reconciliada v1

Este incremento agrega un endpoint de consulta de antigüedad de existencias derivado de `InventoryMovement` y `Product.stock`. Es un modelo **hipotético FIFO**, no prueba de asignación física de lotes, FEFO real, valuación contable ni gestión de perecederos.

## Contrato

`GET /api/v1/reports/inventory/ageing?productId=<UUID>`

- Requiere la sesión de tenant y `reports.view` del router de reportes. `productId` debe ser UUID; claves desconocidas se rechazan.
- Localiza el producto por `id + tenantId`, y lee hasta 5.001 movimientos del mismo producto/tenant, ordenados por `createdAt + id`.
- La lectura de producto y movimientos se efectúa en una transacción PostgreSQL `RepeatableRead` de sólo consultas; el cálculo no escribe balances, reservas, ajustes ni compras.
- `in` agrega cohortes; `out` las consume FIFO; `adjustment` usa su signo para agregar/consumir; `reservation/release` no modifican stock físico. Usa cantidades exactas BigInt (milésimas, escala 3) y una cola FIFO de complejidad O(n).
- Acepta el resultado sólo si la reconstrucción de movimientos coincide exactamente con `Product.stock`. Historial incompleto, cantidades inválidas, movimientos futuros/desordenados o más de 5.000 entradas dan error 409 y **nunca** presentan una antigüedad ficticia.
- Buckets 0–30, 31–90, 91–180 y 181+ días, medidos desde hora del servidor al momento de la petición. Todos los montos son strings decimales exactos.
- La salida declara `FIFO_ASSUMPTION_NOT_PHYSICAL_LOT_PROVENANCE`, `currentOnly=true` y `reconciled=true`. No ofrece saldos de meses anteriores: el snapshot es de la petición actual.
- El modelo no contiene coste unitario ni previsión de demanda: no usar para valorización contable o reposición automática.

## Pruebas y evidencias

La suite `tests/stock_ageing_v756.test.mjs` contiene **12 tests reales** ejecutados en Node.js 22.16.0 sobre un archivo cuyo SHA de blob Git coincidió exactamente con el remoto. Resultado: `12 pass / 0 fail`. Se probó consumo FIFO, milésimas, reservas/releases no físicos, ajustes negativos, stock cero, historia incompleta, mismatch, relojes, límites de 30/90/180 días, malformed numbers y 5.001 movimientos. TypeScript del helper se verificó con `tsc --noEmit` local.

El test quedó añadido a `backend/package.json` en `test:reports`. El checkout íntegro, `npm ci`, typecheck global, integración PostgreSQL17 y E2E HTTP **no se ejecutaron** porque el contenedor no resuelve `github.com` para clonar y no tiene `@prisma/client`, `express`, `zod` ni `tsx` del backend. Los GitHub Actions en cola no pueden considerarse PASS.

## Gate pendiente y cierre del backlog

1. Ejecutar `npm ci && npm run typecheck && npm --workspace backend run test:reports && npm run build` sobre SHA exacto del PR.
2. PostgreSQL17 efímero con tenant A/B: ver 200 del propio tenant y 404/403 del otro, historia truncada, ajustes y reserva, permisos y snapshots concurrentes. Probar que ningún endpoint modifica DB.
3. #755 gobierna lot/location/FEFO física: el modelo FIFO estimado debe contrastarse con recibos reales antes de usarlo para near-expiry o lenta rotación.
4. Falta del issue #756: política persistente de reorder point, safety stock, lead time, multi-location, ageing real por lote, slow moving y alertas outbox. **No cerrar #756 como DONE por este incremento**.

Rollback sin migraciones: revertir la ruta, el helper y su test/documentación. No hay cambios de datos.
