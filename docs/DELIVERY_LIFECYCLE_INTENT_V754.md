# #754 — Estados propuestos para delivery/pick (avance parcial)

`prepareDeliveryTransition` modela transiciones `draft→allocated→picking→dispatched→delivered` y cancelación antes de despacho. Complementa `prepareDeliveryQuantity` de PR #1175 (preflight de owner/cantidad) sin sustituirlo ni escribir movimientos. Nunca ofrece cancelación directa después del despacho; las correcciones de entregas deben pasar por reverso explícito registrado, no borrar el consumo anterior.

Retorna expectativa CAS de tenant + delivery + revision, obligación de verificar owner reservation en la transacción, necesidad de consumir stock atómicamente en confirmación y liberar remanente en cancelaciones; **persisted=false**, **stockConsumed=false**. Toda identidad debe proceder de consulta autenticada a Delivery/SalesOrder persistente, no de formulario libre. El helper NO concede permiso de contabilizar/crear factura.

DoD pendiente: modelo Delivery/DeliveryLine real, ledger de eventos y audit actor, FSM server-side transaccional con idempotency, owner reservation consume (#738), FEFO/lotes (#755), partial/backorder y QA con PostgreSQL17 dos órdenes concurrentes + API. No modificar DB/Inventario existente por suposición. #754 OPEN/PARTIAL NO_MERGE.
