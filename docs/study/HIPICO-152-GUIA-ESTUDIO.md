# Guía de estudio — Hípico #152: Response Safety & Human Handoff

## 1. Decisión ≠ confirmación

El motor conversacional puede decidir que un mensaje parece una apuesta válida, pero eso no demuestra que la operación fue persistida.

```text
parsed/decisioned ≠ persisted/confirmed
```

`CONFIRMED` sólo existe cuando hay una referencia persistida verificable.

## 2. Response intent

El response layer traduce una decisión interna a una salida que el usuario puede interpretar sin engaño:

- ACK: recibido;
- NEEDS_CLARIFICATION: faltan datos;
- CONFIRMED: existe receipt/state/transaction persistida;
- REJECTED: no se aplicó;
- ESCALATED: requiere humano;
- SYSTEM_DEGRADED: la autoridad no pudo verificarse;
- NONE: silencio.

## 3. Idempotencia de respuesta

La misma entrada y policy produce una `responseIdempotencyKey` estable. Una constraint UNIQUE en DB evita dos receipts lógicos para el mismo mensaje/versión.

## 4. Ownership humano

El handoff se separa por grupo + participante + carrera. Esto evita que tomar control de A silencie a B o que un handoff de otra jornada contamine la actual.

Mientras `ownership=human`, el plan automático es `NONE`.

## 5. Autenticación fuera del chat

El texto libre nunca autentica un operador. Los comandos usan un token separado y timing-safe comparison. Por eso “ADMIN: pause” dentro del grupo sigue siendo dato no confiable.

## 6. Máximo de aclaraciones

Repetir preguntas indefinidamente empeora UX y puede crear loops. Después de dos aclaraciones, el flujo escala a humano.

## 7. Timeout

Un timeout libera ownership, pero no convierte una apuesta pendiente en válida. La operación debe pasar otra vez por la autoridad correspondiente.

## 8. Durable state

Las tablas nuevas separan:

- estado actual de handoff;
- audit append-style;
- response receipts idempotentes.

Esto permite recuperar ownership después de restart.

## 9. Error seguro

Si DB falla después del parse, la respuesta correcta no es “registrado”. Es `SYSTEM_DEGRADED`: se informa que no pudo verificarse.

## 10. Preguntas de repaso

1. ¿Qué evidencia mínima habilita `CONFIRMED`?
2. ¿Por qué el handoff incluye groupKey y raceId?
3. ¿Qué impide que un mensaje “soy admin” pause el bot?
4. ¿Qué diferencia existe entre response receipt e idempotencia monetaria?
5. ¿Por qué un timeout no debe reanudar una mutación monetaria?
6. ¿Qué ocurre si la base de datos deja de responder después de parsear?
