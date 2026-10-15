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

**Hardening #1018 (15/10/2026):** el reconciliador debe consultar **ambas tablas** con filtro independiente de propietario y grupo y cruzarlas por `participant_code + currency` mediante `FULL OUTER JOIN`. Un `LEFT JOIN` que comience por `hipico_money_accounts` puede ocultar un asiento sin cuenta materializada y producir un falso «sin diferencias». Los campos de diagnóstico `accountPresent` y `ledgerPresent` indican qué lado está ausente. Cuando `accountPresent=false`, `balanceMinor="0"` es exclusivamente un valor de comparación (no acredita existencia de una cuenta); `matches=false` es obligatorio. Una cuenta materializada con saldo cero y sin ningún asiento sigue siendo compatible con el comportamiento previo (`matches=true`); una cuenta sin asientos con saldo distinto de cero es discrepancia.

Los importes son `NUMERIC(30,0)` (unidad menor), no números de punto flotante. No se mezclan monedas ni propietarios/grupos; los reversos son filas con signo y se incluyen en `SUM(amount_minor)`. La comprobación es **estrictamente de lectura**, no permite crear cuentas faltantes ni reescribir el ledger para «arreglar» el hallazgo.

**Pruebas de regresión sin gasto de Actions:** `npm run test:hipico:ledger:reconcile`; caracteriza asiento huérfano, cuenta huérfana, moneda, owner/grupo, magnitud de enteros grandes y reversos. Se ha ejecutado una comprobación JavaScript independiente del código y sus fixtures, **no** una prueba PostgreSQL real. Verificar SQL/RLS en PG17 aislado sigue siendo obligatorio antes de declarar la convergencia productiva en [#1018](https://github.com/adelvisMartin/ContaGest/issues/1018).

**Alcance separado:** esto concilia dos representaciones del **mismo backend**, no demuestra que el `workspace` offline de PWA y el ledger PostgreSQL tengan los mismos campos, tipos ni reglas; la conciliación entre ambos permanece abierta en #1018.

## Límites

Snapshots/balances históricos de WhatsApp son evidencia y **no** deben usarse como seed automático del saldo vigente. La conexión de state machine/eventos de #107 con este ledger debe pasar una idempotency key estable y sólo escribir cuando la operación esté autorizada; shadow nunca modifica saldo real.
