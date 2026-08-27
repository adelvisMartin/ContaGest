# ADR — Saldos bancarios derivados, reversos y correcciones auditables (#93)

## Estado

Aceptado para la implementación del issue #93.

## Contexto

`BankAccount.balance` es una proyección materializada para lectura rápida. Antes de este cambio podía modificarse desde el CRUD genérico y un `BankMovement` no conciliado podía eliminarse físicamente. Ambas rutas hacían imposible demostrar de forma confiable por qué cambió un saldo.

## Decisión

1. El CRUD ordinario de `BankAccount` sólo administra metadatos. `balance` no forma parte de su contrato de escritura.
2. Una cuenta nueva se abre mediante `POST /banking/accounts`. El saldo inicial distinto de cero crea un `BankMovement` de apertura y actualiza el saldo en la misma transacción idempotente.
3. `POST /banking/accounts/:id/opening-balance` sólo puede utilizarse sobre una cuenta activa con saldo cero y sin movimientos previos.
4. Todo movimiento normal actualiza `BankMovement` y `BankAccount.balance` en una única transacción. Las operaciones sobre la misma cuenta toman un lock de fila para serializar apertura, movimientos y correcciones concurrentes.
5. Un movimiento aplicado no se elimina. `DELETE /banking/movements/:id` conserva compatibilidad de ruta, pero responde `409 BANK_MOVEMENT_IMMUTABLE` e indica utilizar reverso/corrección.
6. Un reverso crea un movimiento nuevo con débito/crédito intercambiados. El original permanece intacto.
7. Una corrección crea en una sola transacción: reverso del original + movimiento sustituto + actualización neta del saldo.
8. Un movimiento conciliado debe desconciliarse antes de reversarse/corregirse. Este ticket no modifica el asiento contable ligado; la política de posting/inmutabilidad del ledger continúa perteneciendo a #91.
9. Si `ledgerEntryId` se usa al conciliar, el backend exige que el asiento exista dentro del tenant activo. Desconciliar limpia el vínculo.
10. Las relaciones apertura/original/reverso/corrección se guardan en `BankMovementAuditLink`, una tabla append-only con FKs compuestas por tenant y constraints de único reverso/apertura.
11. Las mutaciones económicas consumen el mecanismo de idempotencia de #92 y todos los importes usan Decimal de #90.

## Cuentas históricas

No se generan movimientos ficticios para cuentas anteriores a #93. El resumen compara el saldo materializado con la suma exacta de movimientos:

- `ok`: saldo y movimientos coinciden;
- `mismatch`: existe apertura explícita del nuevo workflow y la proyección diverge;
- `legacy-baseline-required`: hay una diferencia histórica pero no existe evidencia suficiente para inventar un saldo de apertura.

La última categoría exige revisión/migración explícita del operador; no se oculta absorbiendo la diferencia en un movimiento artificial.

## Seguridad y tenant isolation

- Cuenta, movimiento y relaciones se buscan con `tenantId` del contexto autenticado.
- Los IDs enviados por cliente nunca se usan como autoridad de tenant.
- Las FKs de `BankMovementAuditLink` usan `(tenantId, id)` para impedir relaciones cruzadas.
- `ledgerEntryId` se valida por tenant antes de persistirse.
- La observabilidad de `bank.balance.integrity_mismatch` registra `tenantId`/`accountId`, no números de cuenta.

## Auditoría

Se conservan eventos de auditoría para apertura, movimiento, conciliación/desconciliación, reverso y corrección. Los motivos de reverso/corrección son validados server-side y forman parte de la evidencia.

## Rollback

El código puede revertirse con Git. La tabla `BankMovementAuditLink` es aditiva y contiene evidencia financiera: **no debe eliminarse automáticamente durante un rollback**. Si una versión anterior del runtime debe restaurarse, conservar la tabla y sus registros hasta ejecutar una migración de compatibilidad revisada manualmente.

## Consecuencias

- El saldo queda explicable hacia adelante por eventos auditables.
- Los clientes antiguos que escribían `balance` por CRUD reciben error 422 y deben migrar al workflow de apertura.
- Reversar/corregir aumenta el número de filas deliberadamente; la historia financiera deja de ser destructiva.
- #91 sigue siendo la autoridad para posted ledger; #93 no reescribe asientos contables.
