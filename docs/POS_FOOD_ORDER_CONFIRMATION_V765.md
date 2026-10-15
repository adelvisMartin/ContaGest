# ContaGest #765 — No crear órdenes POS ficticias al perder conectividad

## Hallazgo corregido

En `FastFoodPosPage.js`, si `createFoodOrder(order)` fallaba o devolvía respuesta incierta, el cliente creaba antes una orden `source:local`, eliminaba `posCart` y navegaba a Pedidos. Esa simulación no demuestra persistencia ni recepción en cocina; ante timeout posterior al commit podía producir un pedido duplicado al reintentar.

## Comportamiento integrado

- En `Crear pedido`, el operador prepara una orden. Se mantienen las validaciones obligatorias de carrito y cliente.
- Un manejador single-flight `createCounterOrderCommit` admite solo un POST pendiente; pulsaciones consecutivas no repiten la operación en paralelo.
- Solo cuando el backend devuelve un objeto con `id` no vacío se actualiza la lista de pedidos y se vacía el carrito, después de confirmar el servidor.
- Ante timeout, respuesta inválida o rechazo: sin escritura local de orden, sin vaciar carrito, sin navegar a Pedidos; muestra una advertencia genérica para consultar/sincronizar antes de intentar de nuevo.
- Si el backend ya confirmó el pedido pero falla la actualización del Store local, se considera confirmado remotamente, se bloquea resubmisión en la misma vista y se advierte que verifique Pedidos.
- El texto de éxito dice `confirmado por el servidor`, sin prometer más que lo realmente devuelto. No se altera el flujo independiente de notificaciones WhatsApp; ese flujo conserva su propio owner y controles.

## Evidencia

Pruebas ejecutadas sobre los mismos blobs exactos publicados en GitHub:

```sh
node --test tests/pos_counter_order_commit_v765.test.mjs
npm --workspace frontend run test:pos:order
npm test
```

La suite incluye ocho casos dinámicos y dos guardas de contrato de página (diez en total) (red, respuesta sin ID, doble clic y fallo del estado local); `npm test` incluye la suite a través del script frontend. Ejecutada la suite unitaria Node22: 10/10 PASS; `node --check` y `tsc --allowJs --checkJs --noEmit --strict` sobre el helper: PASS. Ejecutados adicionalmente cuatro escenarios de montaje del manejador real sobre la versión exacta de GitHub: 4/4 PASS con DOM simulado y servicio fake. No se atribuye éxito a `npm test` monorepo, build Vite, PG17, Chromium o E2E real, que siguen NOT_EXECUTED.

## Autoridad, límites y rollback

`SupabaseSyncService.createFoodOrder` llama a `BackendApi` y sigue siendo la única autoridad de alta de pedido. Sin cambios en Prisma, FX, precios, existencias, impuestos, cobros, caja, persistencia offline ni canales reales de WhatsApp. La nueva validación no puede determinar por sí sola si un timeout ocurrió antes o después del commit: exige **reconciliar en Pedidos** antes de repetir. Queda pendiente idempotencia backend para `/food/orders`, comprobación de tenant/RBAC, confirmación en cocina y QA browser/DB.

Rollback: revertir las modificaciones a la vista, scripts y helper, sin migraciones. Mantener el issue #765 abierto: este PR corrige un fallo operativo, no entrega el POS completo. `SOURCE_REUSE=NONE`.
