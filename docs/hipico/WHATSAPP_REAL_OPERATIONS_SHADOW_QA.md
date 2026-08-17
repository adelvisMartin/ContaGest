# Control Hipico · QA real de operativa por WhatsApp · Shadow Gate

Fecha base: 2026-08-17

## Objetivo

Validar con mensajes reales del grupo `Control hípico lab` el flujo completo:

```text
WhatsApp normal
→ web.whatsapp.com oficial
→ Bridge Playwright local
→ /api/v1/hipico-bot/bridge/events
→ clasificador operacional
→ HipicoWebhookEvent
→ HipicoBotOutbox(status=shadow)
```

Este gate **no automatiza la operativa**. Ninguna frase de jugada, confirmacion, cierre, resultado, disponibles, liquidacion o POLLA/PARLEY puede modificar datos operativos ni responder al grupo.

## Condiciones de seguridad obligatorias

- `HIPICO_ALLOW_SEND=false` en el Bridge.
- El endpoint del grupo siempre devuelve `actions: []`.
- Todos los Outbox de `targetType=group_bridge` quedan `status=shadow`.
- Un mensaje monetario u operativo tiene `autoEligible=false`.
- No probar con dinero real ni con un grupo de produccion hasta cerrar este gate.

## Corpus de prueba operativa

Enviar uno por uno, alternando los dos participantes cuando se indique. Se puede sustituir hipodromo/caballo/monto manteniendo la forma real de trabajo.

| Paso | Mensaje de ejemplo | Intent esperado | Riesgo |
|---|---|---|---|
| 1 | `Juega PP del 3 con 20` | `offer_player` | monetary |
| 2 | `Consigue 1/2 del 5 con 15` | `offer_receiver` | monetary |
| 3 | `J` | `offer_confirmation` | monetary |
| 4 | `Debe confirmar` | `pending_confirmation` | monetary |
| 5 | `Anula esa jugada` | `cancel_or_correction` | monetary |
| 6 | `TERCIOS\nJuega PP del 3 con 20` | `plan_snapshot` | monetary |
| 7 | `Cierra carrera 4` | `race_close` | review |
| 8 | `No va mas la 4` | `race_close` | review |
| 9 | `Juega 1N del 6 con 10` despues del cierre | `offer_player` | monetary |
| 10 | `Llegada 2.1.6.4` | `race_result` | review |
| 11 | `Pizarra: 2 1 6 4` | `race_result` | review |
| 12 | `TERCIOS\nJuega Adel Bs 20\nConsigue Luis Bs 20` | `settlement_snapshot` | monetary |
| 13 | `TERCIO DISPONIBLE\nAdel 100\nLuis -50` | `balance_snapshot` | monetary |
| 14 | `Polla 5 con 20` | `polla_or_parley` | monetary |
| 15 | `Cierre de jornada` | `day_close` | review |
| 16 | `Mañana vamos temprano` | `conversation` | review |

## Pruebas de transporte y resiliencia

1. **Dos participantes:** al menos una oferta desde cada numero. `sender` debe diferenciar ambos remitentes.
2. **Mismo texto dos veces:** escribir manualmente la misma frase dos veces debe producir dos eventos, porque WhatsApp crea dos IDs diferentes.
3. **Reentrega del mismo ID:** el mismo `providerMessageId` debe producir una sola fila y `duplicate=true` en reintentos.
4. **Reinicio del Bridge:** cerrar consola/Chrome y volver a iniciar. No debe exigir QR mientras la sesion local siga vinculada.
5. **Corte de Internet:** desconectar unos segundos, reconectar y enviar un mensaje. Debe recuperarse sin perder el evento.
6. **Backend temporalmente no disponible:** el evento debe permanecer en `data/spool` y reintentarse; no se debe borrar antes del POST exitoso.

## Validacion en PostgreSQL

Por cada mensaje nuevo debe existir exactamente una fila en `HipicoWebhookEvent` con:

- `providerMessageId` unico;
- `sender` identificado;
- `body` original;
- `intent` esperado;
- `risk` esperado;
- `status=classified`.

Y una fila asociada en `HipicoBotOutbox` con:

- `targetType=group_bridge`;
- `status=shadow`;
- `intent` y `risk` consistentes con el evento.

## Criterio PASS del gate

El gate pasa solo si el corpus completo cumple simultaneamente:

- 100% de mensajes nuevos observados por el Bridge;
- 100% de requests aceptados (`200 duplicate` o `202 new`);
- 100% de eventos persistidos/deduplicados correctamente;
- 100% de intents del corpus esperado;
- cero respuestas del Bridge al grupo;
- cero mutaciones de carrera/saldos/resultados/liquidacion;
- recuperacion correcta despues de reinicio y corte de red.

## Lo que NO habilita este gate

Pasar el shadow gate no autoriza automatizacion monetaria. El siguiente nivel, si se aprueba, sera **assist/manual approval**: el sistema propone emparejamientos/acciones y el operador confirma. Cierres, llegadas, liquidaciones, anulaciones y cualquier movimiento monetario mantienen revision explicita hasta tener evidencia separada de conformidad.
