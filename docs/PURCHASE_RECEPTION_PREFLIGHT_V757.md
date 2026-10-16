# #757 — Purchase reception preflight de cantidades

Guardia pura previa a una recepción de orden de compra: compara cantidades `ordered - received - pendingOtherReceipt - requested` con BigInt a seis decimales, exige empresa/pedido/línea de la misma autoridad y orden confirmado o parcialmente recibido. No admite sobrerecepción sin una política de tolerancia aprobada y evidencia de auditoría.

La intención retornada es **informativa**: `requiresLockedOwnerTransaction:true`, `persisted:false`, `stockMovementAuthorized:false`, `accountsPayableAuthorized:false`. No crea PurchaseOrder/GoodsReceipt, no reserva ni incrementa stock, no asienta facturas/AP ni toma saldos de un navegador. En la implementación final el servidor debe buscar y bloquear todos los datos con tenantId dentro de una transacción y volver a aplicar la regla.

QA: `node --test tests/purchase_reception_preflight_v757.test.mjs`. Pendiente real: modelos y migración, numbering/idempotency, inventario, facturas, auditoría, PostgreSQL17 multi-tenant/API/E2E. No cerrar #757 por este incremento. Rollback sin migración. SOURCE_REUSE=NONE.
