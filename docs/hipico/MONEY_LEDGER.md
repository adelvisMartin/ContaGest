# Control Hípico — Money Ledger (#108)

## Regla central

El saldo no es un número editable: es una **proyección** de movimientos append-only. Toda variación debe poder explicarse por una entrada del ledger.

## Dinero exacto

La aplicación usa unidades menores enteras de escala 2 para el dominio Hípico. Ejemplos:

- `60.000,00` → `6000000` minor units;
- `0,10 + 0,20` → `30`, sin error de floating point;
- `-0,01` → `-1`.

El parser `hipico-money.ts` no acepta notación exponencial. PostgreSQL almacena `amount_minor`/`balance_minor` como `NUMERIC(30,0)`.

## Entradas

Tipos: `bet`, `settlement`, `adjustment`, `reversal`.

Cada entrada tiene owner, grupo, participante, moneda, idempotency key y metadata/evidencia opcional. Settlement requiere `settlement_of_key` estable; existe índice único para impedir una segunda liquidación del mismo objeto aun si llega con otra idempotency key.

## Reversos

No se modifica ni borra el movimiento original. `reversal` referencia `original_entry_id` y su importe se deriva como el negativo exacto del original dentro de la transacción. Se prohíbe reversar un reverso y existe un índice único que impide doble reverso.

## Atomicidad

`appendHipicoLedgerEntry()` inserta el movimiento, actualiza `hipico_money_accounts.balance_minor` y verifica `SUM(entries.amount_minor) = balance_minor` dentro de **la misma transacción**. Si la reconciliación falla, toda la operación revierte.

## Inmutabilidad

La migración `20260827212500_hipico_money_ledger` instala un trigger que rechaza `UPDATE`/`DELETE` sobre `hipico_money_ledger_entries`. Correcciones son nuevos `adjustment` o `reversal`, nunca edición destructiva.

## Idempotencia y retry

`UNIQUE(owner_id, group_key, idempotency_key)` hace que un retry/restart devuelva la entrada existente sin sumar saldo otra vez. La protección de settlement y reversal añade defensa semántica adicional frente a keys incorrectamente regeneradas.

## Reconciliación

`reconcileHipicoLedger(ownerId, groupKey)` compara por participante/moneda el saldo materializado contra la suma del journal. Cualquier `matches=false` es finding P0 y bloquea promoción.

## Límites

Snapshots/balances históricos de WhatsApp son evidencia y **no** deben usarse como seed automático del saldo vigente. La conexión de state machine/eventos de #107 con este ledger debe pasar una idempotency key estable y sólo escribir cuando la operación esté autorizada; shadow nunca modifica saldo real.
