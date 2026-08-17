# Control Hipico · QA real de operativa por WhatsApp · Shadow Gate

Fecha base: 2026-08-17

## Objetivo

Validar con mensajes reales del grupo `Control hípico lab` el flujo completo:

```text
WhatsApp normal
→ web.whatsapp.com oficial
→ Bridge Playwright local
→ /api/v1/hipico-bot/bridge/events
→ clasificador operacional + entidades
→ HipicoWebhookEvent                   (auditoria de transporte)
→ HipicoBotOutbox status=shadow        (compatibilidad/auditoria)
→ hipico_messages                      (mensaje canonico normalizado)
→ hipico_operation_events              (evento operativo pending)
→ hipico_shadow_evaluations            (prediccion shadow pending)
→ shadow-projection                    (matching RC1 de solo lectura)
```

El canal canonico de laboratorio es independiente del canal operativo existente y esta configurado como `web_bridge`, `shadow_only`, `auto_send=false`.

Este gate **no automatiza la operativa**. Ninguna frase de jugada, confirmacion, cierre, resultado, disponibles, liquidacion o POLLA/PARLEY puede modificar datos operativos ni responder al grupo.

## Condiciones de seguridad obligatorias

- `HIPICO_ALLOW_SEND=false` en el Bridge; el runtime aborta si se cambia a `true`.
- El endpoint del grupo siempre devuelve `actions: []`.
- Todos los Outbox de compatibilidad `targetType=group_bridge` quedan `status=shadow`.
- `hipico_operation_events.event_state=pending` durante este gate.
- `hipico_shadow_evaluations.match_status=pending` hasta revision.
- Todo intent monetario/operativo tiene `autoEligible=false`.
- El dual-write canonico **no escribe** `hipico_ledger_entries` ni `hipico_outbox` operativo.
- Si cualquier persistencia obligatoria falla, el endpoint devuelve HTTP 503 `retryable=true`; el Bridge conserva el evento en `data/spool` y reintenta.
- No probar con dinero real ni con un grupo de produccion hasta cerrar este gate.

## Linea base PostgreSQL

Antes del corpus real se conservaron las pruebas de transporte ya verificadas:

```text
HipicoWebhookEvent = 6
HipicoBotOutbox    = 6
last_event_at      = 2026-08-17 04:58:14.799 UTC
```

No se limpia esa evidencia. El corpus se mide por filas posteriores a esa marca y por el canal canonico `control-hipico-lab`.

## Corpus de prueba operativa

Enviar uno por uno. Los montos son **solo datos de laboratorio**.

| Paso | Remitente | Mensaje | Intent esperado | Evidencia esperada |
|---|---|---|---|---|
| 1 | Adel | `Juega PP del 3 con 20` | `offer_player` | role=player, play=PP, horse=3, amount=20 |
| 2 | segundo participante | `Consigue PP del 3 con 15` | `offer_receiver` | role=receiver; shadow match=15; JUEGA restante=5 |
| 3 | segundo participante | `J` | `offer_confirmation` | confirmation=J |
| 4 | Adel | `Debe confirmar` | `pending_confirmation` | sin efecto operativo |
| 5 | Adel | `Anula esa jugada` | `cancel_or_correction` | manual review |
| 6 | Adel | `Consigue 1/2 del 5 con 15` | `offer_receiver` | play=1/2, horse=5, amount=15; no empareja PP/3 |
| 7 | Adel | `Cierra carrera 4` | `race_close` | raceNumber=4; segmento queda cerrado |
| 8 | segundo participante | `Juega 1N del 6 con 10` | `offer_player` | aparece como `lateOffer`, no se empareja |
| 9 | Adel | `Llegada 2.1.6.4` | `race_result` | board=[2,1,6,4] |
| 10 | Adel | `Pizarra: 2 1 6 4` | `race_result` | board=[2,1,6,4] |
| 11 | Adel | mensaje multilinea `TERCIOS` + `Juega PP del 3 con 20` | `plan_snapshot` | abre siguiente segmento si el anterior estaba cerrado |
| 12 | participantes distintos | nuevas `Juega 1N del 6 con 10` y `Consigue 1N del 6 con 10` | offers | solo deben emparejar dentro del nuevo segmento |
| 13 | Adel | multilinea `TERCIOS` + `Juega Adel Bs 20` + `Consigue Luis Bs 20` | `settlement_snapshot` | filas estructuradas, sin liquidar |
| 14 | Adel | multilinea `TERCIO DISPONIBLE` + `Adel 100` + `Luis -50` | `balance_snapshot` | disponibles observados, sin modificar saldo |
| 15 | segundo participante | `Polla 5 con 20` | `polla_or_parley` | manual review, sin efecto monetario |
| 16 | Adel | `Cierre de jornada` | `day_close` | jornada observada como cerrada en projection |
| 17 | Adel | `Mañana vamos temprano` | `conversation` | no operacional |

## Reglas que debe demostrar la proyeccion RC1

La proyeccion de solo lectura debe aplicar exactamente estas restricciones:

1. `JUEGA` solo empareja con `CONSIGUE`.
2. Mismo tipo de jugada (`PP`, `1N`, `1/2`, etc.).
3. Mismo caballo.
4. Remitentes distintos; nunca auto-emparejar al mismo participante.
5. Mismo segmento de carrera.
6. Matching parcial por `min(JUEGA restante, CONSIGUE restante)`.
7. Una oferta despues de `race_close` queda en `lateOffers` y no se usa para matching.
8. Un nuevo `plan_snapshot` puede abrir el segmento siguiente.

La inspeccion se hace mediante el endpoint autenticado de operador:

```text
GET /api/v1/hipico-bot/shadow-projection?limit=100
```

## Pruebas de transporte y resiliencia

1. **Dos participantes:** al menos una oferta desde cada numero. `sender` debe diferenciar ambos remitentes.
2. **Mismo texto dos veces:** escribir manualmente la misma frase dos veces debe producir dos eventos porque WhatsApp crea dos IDs distintos.
3. **Reentrega del mismo ID:** el mismo `providerMessageId` debe producir una sola fila y `duplicate=true` en reintentos.
4. **Reinicio del Bridge:** cerrar consola/Chrome y volver a iniciar. La sesion persistente no debe exigir QR mientras siga vinculada.
5. **Cambio temporal de chat:** al regresar a `Control hípico lab` no se crea un baseline nuevo; IDs persistentes evitan duplicados y los mensajes nuevos visibles se procesan.
6. **Corte de Internet:** desconectar unos segundos, reconectar y enviar un mensaje. Debe recuperarse sin perder el evento.
7. **Backend temporalmente no disponible:** el evento permanece en `data/spool` hasta un POST exitoso.

## Validacion PostgreSQL por mensaje

Cada mensaje nuevo debe dejar evidencia coherente en las capas aplicables:

### `HipicoWebhookEvent`

- `providerMessageId` unico;
- `sender`, `body`, `intent`, `risk`;
- `status=classified`;
- `payload.operational` con las entidades extraidas.

### `HipicoBotOutbox`

- una sola fila por evento de grupo;
- `targetType=group_bridge`;
- `status=shadow`.

### `hipico_messages`

- `channel_key=control-hipico-lab`;
- mismo external message ID;
- `classification` esperada;
- `normalized` con entidades;
- `processing_status=processed`.

### `hipico_operation_events`

Solo para intents operativos:

- `event_state=pending`;
- tipo coherente (`offer`, `counteroffer`, `confirmation`, `race_close`, `result`, etc.);
- payload marcado `shadow=true`;
- sin ledger ni efecto real.

### `hipico_shadow_evaluations`

- una evaluacion idempotente por external ID + prediction type;
- `scenario_key=real-operativa-shadow-v1`;
- `match_status=pending`;
- `predicted_payload` con intent/riesgo/entidades.

## Criterio PASS

El gate pasa solo si simultaneamente hay:

- 100% de mensajes nuevos observados por el Bridge;
- 100% de requests exitosos (`202 new` o `200 duplicate`); un `503` debe quedar spooled y luego recuperarse;
- 100% de persistencia/idempotencia en transporte y esquema canonico;
- 100% de intents y entidades del corpus esperado;
- matching/sobrantes/lateOffers correctos segun RC1;
- cero respuestas del Bridge al grupo;
- cero filas nuevas en ledger/outbox operativo originadas por el gate;
- cero mutaciones de carrera, saldos, resultados o liquidacion;
- recuperacion correcta despues de reinicio, cambio de chat y corte de red.

## Lo que NO habilita este gate

Pasar el shadow gate no autoriza automatizacion monetaria. El siguiente nivel, si se aprueba, sera **assist/manual approval**: el sistema propone emparejamientos/acciones y el operador confirma. Cierres, llegadas, liquidaciones, anulaciones y cualquier movimiento monetario mantienen revision explicita hasta tener evidencia separada de conformidad.
