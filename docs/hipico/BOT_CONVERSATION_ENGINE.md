# Control Hípico — Bot Conversation Engine (#150)

## Propósito

El motor conversacional decide **qué hacer con un mensaje**, no ejecuta dinero ni envía WhatsApp. Su frontera es deliberada:

```text
mensaje
→ normalización/clasificación
→ resolución de contexto
→ decisión tipada
→ plan de respuesta
→ transportAction = NONE
```

Toda operación monetaria o de estado sigue necesitando las autoridades de dominio existentes y los gates posteriores.

## Pipeline

La evidencia expone las etapas:

`RECEIVED → NORMALIZED → PARSED → CONTEXT_RESOLVED → DECISIONED → RESPONSE_PLANNED`.

Cada decisión contiene:

- `decision`;
- `decisionReason`;
- `responseIntent` y texto planificado;
- `confidence`;
- `parserVersion`;
- `policyVersion`;
- `correlationId` determinista;
- `sourceMessageId`;
- participante/carrera;
- `effectsAllowed=false`;
- `transportAction=NONE`.

## Reglas fail-closed

- duplicado: `NO_RESPONSE`;
- conversación bajo ownership humano: `NO_RESPONSE`;
- contenido monetario ambiguo/incompleto: `NEEDS_CLARIFICATION`;
- stateful fuera de orden: `HELD_FOR_REVIEW`;
- carrera cerrada: `REJECTED`;
- media sin texto soportado: `ESCALATED`;
- cierre/resultado/saldo/liquidación: sólo review, nunca efecto automático;
- baja confianza + riesgo monetario/stateful: aclaración, no inferencia optimista.

## Aislamiento

El orden temporal se evalúa por `participantId`; el mensaje más reciente de A no vuelve “tardío” un mensaje legítimo de B. La lista de ownership humano también se evalúa por participante normalizado.

## Idempotencia

`sourceMessageId` es la identidad de entrada. Un ID ya visto produce silencio y el mismo `correlationId` determinista. Esto complementa, no reemplaza, la idempotencia de persistencia del Bridge/spool.

## Integración actual

`POST /bridge/events` continúa siendo shadow-only para SOURCE. Después de persistir/classificar, expone `conversationDecision` en la respuesta del backend. En esta fase:

- no se añade ruta de envío a SOURCE;
- no se permite mutación monetaria desde el motor;
- no se activa producción;
- el LAB puede consumir la decisión como evidencia/simulación.

## Casos de prueba

La suite cubre:

- duplicados;
- ambigüedad monetaria;
- carrera cerrada;
- out-of-order;
- aislamiento entre participantes;
- takeover humano;
- media no soportada;
- intents de estado sólo review;
- baja confianza.

## Evidencia

Comando canónico cuando exista runner/local toolchain:

```bash
cd backend
npm run test:hipico
npm run typecheck
```

Con GitHub Actions sin runner (#134), el resultado remoto debe permanecer `BLOCKED/NOT_EXECUTED`; inspección de source no se reetiqueta como PASS.

## Siguiente frontera

#151 usa este motor en el simulador LAB. #152 añade contrato de respuesta/handoff durable. #153 añade abuse cases. #121 decide promoción; ninguna de esas fases convierte automáticamente el motor en transport productivo.
