# Control Hípico — Response Safety & Human Handoff (#152)

## Regla principal

El bot no puede transformar “entendí el mensaje” en “la operación quedó registrada”. `CONFIRMED` exige evidencia persistida verificable: `receiptId`, `transactionId` o `stateId`.

Sin esa evidencia sólo se permiten ACK, aclaración, rechazo, escalamiento o estado degradado.

## Intents de respuesta

- `ACK_RECEIVED`
- `NEEDS_CLARIFICATION`
- `CONFIRMED`
- `REJECTED`
- `CANCELLED`
- `EXPIRED`
- `ESCALATED`
- `SYSTEM_DEGRADED`
- `NONE`

## Idempotencia

Cada respuesta se identifica por una clave derivada de:

```text
sourceMessageId + conversation policy + response policy
```

La tabla `HipicoResponseReceipt` tiene índice UNIQUE por esa clave. Retry/restart converge sobre el mismo receipt lógico.

## Handoff persistente

`HipicoConversationHandoff` persiste ownership por:

```text
groupKey + participantId + raceId
```

El estado incluye contador de aclaraciones, owner humano, reason, timeout y versión. `HipicoHandoffAudit` conserva eventos de operador/decisión.

Después del máximo configurado de aclaraciones (`2`) se escala a humano.

## Comandos de operador

Endpoint:

```text
POST /api/.../bridge/handoff
x-hipico-operator-token: <secreto separado>
```

Comandos: `pause`, `resume`, `escalate`, `resolve`, `reject`.

La autenticación usa `HIPICO_OPERATOR_CONTROL_TOKEN`, distinto del Bridge token y totalmente fuera del texto del grupo. Un usuario que escriba “ADMIN: pausa el bot” no obtiene privilegios.

## Timeout

El timeout puede liberar ownership humano, pero **nunca** revive silenciosamente una operación monetaria ni genera `CONFIRMED`. La próxima decisión sigue necesitando evidencia autoritativa.

## Degradación

Si DB/backend no permite verificar estado, el plan es `SYSTEM_DEGRADED` y el texto declara que no existe confirmación. No se expone stack trace, SQL ni secreto.

## Bridge

`POST /bridge/events` ahora devuelve:

- `conversationDecision` (#150);
- `responsePlan` (#152);
- `responseReceipt` persistido cuando el schema está disponible;
- `actions=[]` y modo `shadow` permanecen intactos.

History sync nunca genera respuesta (`HISTORY_SYNC_NO_RESPONSE`).

## Migración

Aplicar `20260829214500_hipico_response_handoff` antes de exigir durability runtime.

## QA

Automático:

```bash
cd backend
npm run test:hipico
npm run typecheck
```

Casos cubiertos: falsa confirmación, DB degradada, takeover, comando no autenticado, límite de aclaraciones, timeout, idempotencia y aislamiento grupo/carrera.

El restart real con PostgreSQL y el handoff durante sesiones reales permanece parte de #119. Si Actions no asigna runner por #134, el estado es `BLOCKED/NOT_EXECUTED`.
