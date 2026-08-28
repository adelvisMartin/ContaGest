# Control Hípico — State machines e integridad de datos (#107)

## Principio

Un mensaje de WhatsApp es **evidencia**, no autoridad suficiente para reescribir el estado operativo o monetario. El sistema valida la transición anterior → nueva, conserva el mensaje/evento y separa lo observado de lo aplicado.

## Carrera

Flujo canónico:

`PREPARING → OPEN → CLOSED → RESULT_RECEIVED → SETTLEMENT_READY → SETTLED → BALANCED → PUBLISHED → ARCHIVED`

Compatibilidad controlada: `PREPARING → CLOSED` permite registrar un cierre cuando el plan/open previo no quedó disponible; cualquier salto posterior continúa fallando cerrado.

`SETTLED → PUBLISHED` es válido cuando no existe una confirmación de balance separada. Cuando sí existe balance, el camino es `SETTLED → BALANCED → PUBLISHED`.

## Jornada

`PREPARING → OPEN → CLOSING → CLOSED → ARCHIVED`

Un `DAY_CLOSED` recibido antes de OPEN/CLOSING se conserva como evidencia rechazada/review, pero no cierra la jornada automáticamente.

## Dispositions

- `applied`: transición válida; actualiza la proyección materializada.
- `evidence_only`: evidencia válida que no debe cambiar estado (por ejemplo jugada, corrección/reverso o evento repetido de mismo estado).
- `duplicate`: misma identidad ya procesada; efecto cero.
- `review`: ambiguo/desconocido o falta una referencia verificable.
- `rejected`: evento conocido, pero imposible en el estado actual/out-of-order.

## Idempotencia

La identidad durable se compone por owner + grupo + aggregate kind/key + `source_message_key` + tipo de evento. El mismo mensaje no puede volver a aplicar la misma transición tras retry/restart.

## Append-only

`public.hipico_domain_events` es journal histórico. La migración #107 instala un trigger que rechaza `UPDATE` y `DELETE`. Una corrección o reverso se registra como **otro evento** y `original_event_id` referencia la evidencia original; nunca se edita el pasado.

La tabla conserva, cuando están disponibles:

- source message id/key;
- raw message;
- normalized payload;
- actor/source;
- timestamps;
- parser version;
- schema version;
- previous/next state;
- disposition/reason.

## Concurrencia

`persistHipicoDomainEvent()` usa una transacción y bloquea la fila de `hipico_domain_aggregates` con `FOR UPDATE`. La validación y la actualización de `state_version` suceden dentro de la misma transacción para que dos workers/retries no apliquen una transición simultáneamente.

## Ambigüedad y mensajes tardíos

`UNKNOWN`, `AMBIGUOUS`, `requiresReview` y transiciones fuera de orden nunca avanzan el estado. Se persisten como review/rejected para poder reconstruir qué llegó y por qué no se aplicó.

Una llegada antes del plan/cierre, doble cierre, settlement fuera de orden o balance antes de settlement no se convierte en estado válido por heurística.

## Corrección y reverso

Toda corrección/reverso requiere `original_event_id`. Un reverso de un evento ya reversado es rechazado por la capa de persistencia. El efecto monetario real corresponde al ledger de #108; #107 sólo garantiza la semántica de evento y ciclo de vida.

## Autoridad

- Backend reducer: `backend/src/modules/hipico-bot/hipico-domain-state.ts`.
- Persistencia: `backend/src/modules/hipico-bot/hipico-domain-event.store.ts`.
- Migración: `backend/prisma/migrations/20260827211500_hipico_domain_state_integrity/`.
- Frontend/PWA: `frontend/public/hipico-control/assets/js/race-state-machine.js` mantiene el mismo contrato para prevalidación/UI, pero no sustituye al backend como autoridad productiva.

## Pruebas obligatorias

Se cubren: lifecycle completo, llegada antes de plan, duplicados, ambigüedad, día fuera de orden, corrección/reverso y compatibilidad del reducer frontend. Los tickets posteriores deben reutilizar estos invariantes para ledger, shadow evaluation, replay, offline sync y promoción.
