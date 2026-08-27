# ADR — Inventario derivado de movimientos (#94)

## Estado

Aceptado para el candidato del issue #94.

## Contexto

`Product.stock` y `Product.reserved` se conservan como proyecciones materializadas por rendimiento, pero no son campos maestros. Antes de este cambio podían escribirse desde el CRUD de productos y el frontend fabricaba un movimiento inicial a partir del saldo actual, lo que impedía demostrar cómo se llegó a una existencia.

## Decisión

La fuente operacional de verdad es `InventoryMovement`.

- `Product` contiene datos maestros y proyecciones materializadas.
- Toda entrada, salida, reserva y liberación se aplica mediante `/inventory/movements`.
- Todo ajuste físico se aplica mediante `/inventory/adjustments`, requiere `inventory.adjust`, `reasonCode` y nota.
- Todo reverso crea un movimiento inverso y conserva el original.
- `stock` y `reserved` no forman parte del contrato de creación/edición ordinaria de `/products`.
- Las mutaciones bloquean la fila de producto con `FOR UPDATE` para serializar efectos concurrentes.
- La disponibilidad se define como `stock - reserved`.
- Las salidas y reservas no pueden superar disponibilidad.
- Las liberaciones no pueden superar lo reservado.
- El stock negativo no está permitido en esta fase.
- Un ajuste no puede dejar `stock < reserved`.
- Idempotencia financiera protege movimiento, ajuste y reverso frente a reintentos.

## Saldo de apertura e históricos

Un saldo de apertura verificable se registra como un movimiento `in` con `source=opening` y una relación `InventoryMovementAuditLink(kind=opening)`. Sólo puede existir uno por producto.

No se inventan movimientos para saldos históricos existentes. Si una proyección materializada no coincide con la secuencia disponible y no existe apertura explícita, `/inventory/integrity` devuelve `legacy-baseline-required` para una migración controlada.

## Auditoría append-only

`InventoryMovementAuditLink` relaciona movimientos de apertura, ajustes y reversos con tenant y producto. Sus FKs compuestas `(tenantId,id)` impiden relaciones cross-tenant en PostgreSQL.

Los movimientos persistidos no se reescriben ni se eliminan como mecanismo de corrección. Un movimiento sólo se neutraliza mediante reverso o un ajuste posterior explícito.

## Kardex

El Kardex ya no agrega un movimiento ficticio basado en `Product.stock`. Reconstruye:

- stock físico: `in - out + adjustment`;
- reserva: `reservation - release`;
- disponibilidad: `stock - reserved`.

Las proyecciones se comparan con los saldos materializados mediante `/inventory/integrity`.

## Integración contable

Este issue no inventa contabilización automática de inventario. Cuando un movimiento de inventario deba producir un asiento, el adaptador deberá respetar el lifecycle de ledger de #91 y nunca modificar un asiento `posted`.

## Importaciones

#95 no puede escribir `Product.stock` o `Product.reserved`. La importación de producto maestro debe crear el maestro con saldo cero; cualquier saldo inicial verificado debe entrar posteriormente por el workflow de movimientos/apertura.

## Seguridad y SoD

- `inventory.manage`: operaciones ordinarias y lectura del Kardex.
- `inventory.adjust`: ajustes y reversos manuales de mayor privilegio.
- El tenant procede exclusivamente del contexto autenticado.
- El cliente nunca impone el saldo final.

## Rollback

El código puede revertirse con Git. La tabla de relaciones y los movimientos creados son evidencia operativa; una reversión de software no debe borrar automáticamente esos registros.