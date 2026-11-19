# #757 — Estado de línea frente a estado global de PurchaseOrder

`preparePurchaseReceipt` es un preflight de **una línea**. El campo histórico `nextOrderStatus` utilizaba una cuenta exacta por línea para proponer `received`, lo cual **no demuestra que el pedido entero** esté recibido cuando tiene más líneas.

Sin romper consumidores existentes, se añade `nextLineReceiptStatus` y banderas inmutables `orderWideStatusAuthorized=false` y `requiresOrderWideStatusReconciliation=true`. La sugerencia histórica se mantiene por compatibilidad, pero debe considerarse deprecated y **no utilizarse para confirmar/cerrar la PurchaseOrder**. Para cerrar una orden se requiere transacción sobre todas sus líneas, movimientos, pendientes concurrentes, y validación tenant/supplier.

El dominio mantiene bloqueo de sobre-recepción y Decimal(18,3). Ninguna nueva tabla, posting de inventario, AP, ruta o factura. Faltan PG17 concurrente, API, autorización y migración de estado global; ticket #757 OPEN/PARTIAL y PR DRAFT hasta DoD.

## #757 · Validación de referencias en la transacción financiera

Al crear una `PurchaseInvoice`, el middleware `tenantReferenceGuard` valida supplier/product contra tenant antes de entrar al router. Se ha reforzado la autoridad en el callback de `runFinancialIdempotentMutation`: `validateTenantMutationReferences(tx, ctx.tenantId, '/purchases', req.body)` se ejecuta **dentro de la misma transacción que guarda compra, líneas, snapshots y ledger**, antes de numeración, insert y posting. La ruta no acepta `tenantId` del request como autoridad, ni crea proveedores/productos automáticamente. Reutiliza el guard existente, sin duplicar consultas de catálogo en otro módulo. Mantiene contratos de replay e idempotencia.

La suite `tests/purchase_draft_atomicity_v757.test.mjs` verifica su posición previa a los efectos. `qa/purchase-draft-atomic-v757.test.ts` incorpora proveedores y productos ajenos, rechazos HTTP 409 y ausencia de factura/asiento. Se ejecutan en la base **PostgreSQL 17 efímera** existente de `e2e-commercial-v23.yml` con SHA de checkout controlado. El alcance es creación de factura de proveedor; **no** equivale a Purchase Request/Order/Receipt, recepción física ni integración nueva con inventario. No tocar migraciones, pricing ni GL.

Reversión: revertir el cambio de ruta + pruebas + workflow; no hay cambios de datos. QA de PG17/CI sólo puede marcarse PASS tras la ejecución real en SHA candidato.
