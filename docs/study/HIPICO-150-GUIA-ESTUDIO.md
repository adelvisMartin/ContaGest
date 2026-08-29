# Guía de estudio — Hípico #150: Bot Conversation Engine

## Concepto principal

El parser responde **qué parece significar el texto**. El motor conversacional responde **qué decisión segura corresponde dado el contexto**. Son responsabilidades distintas.

```text
texto → parser → intención/entidades
                  ↓
contexto → conversation engine → decisión/plan de respuesta
```

## 1. Determinismo

Mismo mensaje + mismo contexto + misma versión de policy debe producir la misma decisión. Esto permite replay, golden tests y auditoría.

El `correlationId` se deriva de `policyVersion + sourceMessageId + participantId`, por lo que no depende de reloj ni azar.

## 2. Fail-closed

Cuando existe ambigüedad monetaria, no se “completa” el mensaje imaginando datos. Se pide aclaración.

Ejemplo:

```text
“juega 2N”
```

Si faltan selección/caballo o monto, la decisión es `NEEDS_CLARIFICATION`, no una apuesta aceptada.

## 3. Idempotencia

Un mensaje duplicado no genera una segunda respuesta ni un segundo efecto. La identidad relevante es `sourceMessageId`.

La idempotencia existe en varias capas:

- conversación: no decidir/responder dos veces;
- Bridge/spool: no reenviar dos veces;
- ledger/dominio: no aplicar dos veces un efecto económico.

Una capa no sustituye a las otras.

## 4. Contexto por participante

El último timestamp de A no debe contaminar B. Por eso `lastTimestampByParticipant` está particionado por identidad.

También el handoff humano se evalúa por participante: si A está en takeover, el bot calla para A pero no para B.

## 5. Out-of-order

Un mensaje stateful que llega con timestamp anterior al último conocido se retiene para revisión. No se reordena silenciosamente una operación monetaria o un cierre.

## 6. Carreras cerradas

Si el contexto dice que la carrera está cerrada, un intento monetario se rechaza antes de cualquier efecto.

```text
closed race + monetary intent → REJECTED
```

## 7. Separación del transporte

`transportAction = NONE` y `effectsAllowed = false` son garantías arquitectónicas de esta fase. El motor puede planificar texto, pero no posee la capacidad de escribir al SOURCE ni de tocar dinero.

## 8. Decisiones importantes

- `NO_RESPONSE`: duplicado o ownership humano.
- `ACK_RECEIVED`: mensaje seguro/informativo.
- `NEEDS_CLARIFICATION`: falta información o confianza.
- `HELD_FOR_REVIEW`: intención stateful que necesita autoridad/revisión.
- `REJECTED`: regla explícita impide continuar.
- `ESCALATED`: requiere operador.

## 9. Qué estudiar en el código

1. `hipico-operational-classifier.ts`: intención y entidades.
2. `hipico-conversation-engine.ts`: policy/contexto/decisión.
3. `hipico-bridge.routes.ts`: integración shadow sin envío.
4. `hipico-conversation-engine.test.ts`: invariantes.

## Preguntas de repaso

1. ¿Por qué parser y conversation engine no deberían ser el mismo módulo?
2. ¿Qué riesgo evita pedir aclaración ante monto faltante?
3. ¿Por qué un ID de mensaje debe ser estable?
4. ¿Qué diferencia hay entre `HELD_FOR_REVIEW` y `REJECTED`?
5. ¿Por qué el contexto temporal se separa por participante?
6. ¿Qué significa que `effectsAllowed=false` aunque exista una respuesta planificada?
