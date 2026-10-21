# #757 — Estado de línea frente a estado global de PurchaseOrder

`preparePurchaseReceipt` es un preflight de **una línea**. El campo histórico `nextOrderStatus` utilizaba una cuenta exacta por línea para proponer `received`, lo cual **no demuestra que el pedido entero** esté recibido cuando tiene más líneas.

Sin romper consumidores existentes, se añade `nextLineReceiptStatus` y banderas inmutables `orderWideStatusAuthorized=false` y `requiresOrderWideStatusReconciliation=true`. La sugerencia histórica se mantiene por compatibilidad, pero debe considerarse deprecated y **no utilizarse para confirmar/cerrar la PurchaseOrder**. Para cerrar una orden se requiere transacción sobre todas sus líneas, movimientos, pendientes concurrentes, y validación tenant/supplier.

El dominio mantiene bloqueo de sobre-recepción y Decimal(18,3). Ninguna nueva tabla, posting de inventario, AP, ruta o factura. Faltan PG17 concurrente, API, autorización y migración de estado global; ticket #757 OPEN/PARTIAL y PR DRAFT hasta DoD.
