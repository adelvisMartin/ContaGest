# #756 — Actividad física de salida (sin asumir demanda)

**Baseline:** main `edafbd9e3b7cf9f22938f4af1fc96183add306e0`. Extiende el claim exclusivo existente de #756; no altera inventario, ventas, compras, políticas de #755 ni otras autoridades.

## API

`GET /api/v1/reports/inventory/slow-moving?productId=<UUID>&inactivityDays=90`

- Requiere tenant del contexto autenticado y permiso `reports.view` en el router. Producto activo buscado mediante `id + tenantId`. No se acepta tenantId del cliente.
- Periodo desde 1 hasta 3.650 días (por defecto 90). Datos reales desde `InventoryMovement` del mismo tenant/producto, ordenados por `createdAt asc,id asc`; límite duro 5.000 movimientos, se rechaza si existe un movimiento 5.001.
- Dentro de transacción de lectura PostgreSQL `RepeatableRead`, se reutiliza `calculateStockAgeing` para exigir conciliación exacta del historial físico con `Product.stock`. Ante salidas sin entradas, desajustes, entradas futuras, orden corrupto u overflow se devuelve 409 sin simular resultados. Producto ajeno/inexistente: 404.
- El indicador usa exclusivamente movimientos `type='out'`; reservas y liberaciones **no son salidas físicas**, y los ajustes no son ventas. Cantidades en formato Decimal exacto con BigInt, milésimas sin float; total de cantidad y conteo de salidas dentro de la ventana. La fecha de corte procede del servidor.
- Estados `recent_outbound`, `outbound_inactive`, `no_outbound_recorded` y `out_of_stock`. No informar que ausencia de salidas equivale a baja demanda: la fuente sólo demuestra inactividad física de salidas, no conversión, ventas, rotación anual o lot/location.
- Cabeceras sin caché, sólo campos de producto allowlisted. `noAutomaticProcurement=true`; ninguna compra, reserva, notificación, mutación fiscal o migración se activa.
- Un producto nuevo con stock y sin salidas pertenece a `no_outbound_recorded`, nunca a `outbound_inactive`. Un producto sin stock pertenece a `out_of_stock`, aunque no tenga salidas recientes.

## Tests y evidencia

- `tests/stock_movement_activity_v756.test.mjs`: 11 casos, diez pruebas de función puras y una de contrato de ruta. Se incorpora al comando `npm --workspace backend run test:reports`.
- 10/10 pruebas funcionales efectivamente ejecutadas en el contenedor con Node.js 22.16.0. TypeScript 5.8.3 `tsc --noEmit` sobre el módulo puro: PASS.
- Los archivos exactos ejecutados coinciden con los blobs de GitHub: `stock-movement-activity.ts` = `01bdf5615eb66f85b4604a5065e760279942e7bf`; test = `dd719fada32a431ca07993d4b50204b5a7ddd4bf`. La comprobación del contrato de ruta se verificó con las 7 expresiones regulares directamente contra el archivo de GitHub; su ejecución formal completa en el checkout del repositorio sigue NOT_EXECUTED.
- `npm ci`, typecheck completo, PostgreSQL 17 multi-tenant con 401/403/404, traza de movimiento concurrente, Playwright y build: NOT_EXECUTED en contenedor sin DNS GitHub y dependencias. CI remoto queued/pending no es PASS.

## Restos y cierre

#756 continúa OPEN. Siguen sin cumplirse completamente las políticas por producto/localización, lead time y safety stock, asignación física FEFO por lote #755, ageing real y sus pruebas de reconciliación, integración outbox, QA E2E y UX. Este incremento aporta análisis físico confiable de un producto, no una decisión automática de compra.

**Rollback:** revertir el helper, la ruta de sólo lectura, el test, su inserción en `test:reports` y este documento. No hay DDL ni escritura transaccional.
