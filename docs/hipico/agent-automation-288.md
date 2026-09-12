# Agent/Shadow automation — ticket #288

## Invariante

Control Hípico conserva una sola autoridad de dominio. El flujo es `mensaje no confiable → parser determinístico → candidato IA opcional → validación de esquema/policy → RBAC → query/command del dominio`. El modelo nunca recibe SQL, shell, administración universal, ledger o liquidación, ni puede introducir owner/group scope, roles, tokens, secretos o cambios de policy.

## Estados y promoción

El orden obligatorio es `DISABLED → SHADOW → ASSISTED → AUTOMATIC_LOW_RISK → AUTOMATIC`; no se saltan etapas. SOURCE nace en `SHADOW`; otros grupos en `DISABLED`. Los gates exigen evidencia revisada y cero falsos positivos de alto riesgo/acciones no autorizadas. `AUTOMATIC` exige además `HIPICO_OWNER_APPROVAL_TOKEN`, fuerte y distinto del token operativo; esa aprobación nunca se acepta desde el body ni desde una salida del modelo.

Cada transición exige `Idempotency-Key`, se serializa con bloqueo de fila y deja auditoría append-only con scope, firma, actor derivado, métricas y decisión permitida/rechazada.

## Acciones automáticas de bajo riesgo

Sólo son auto-elegibles las queries read-only `queryCurrentMeeting`, `queryCurrentRace`, `queryNextRace`, `queryLastResult`, `queryParticipant`, `queryHorse`, `queryProvider` y `queryDocument`. `proposeResponse` y `requestHumanReview` nunca son auto-ejecutables. Los intents monetarios tampoco.

El endpoint de evaluación persiste evidencia y devuelve elegibilidad; no escribe eventos de dominio, no despacha mensajes, no toca ledger y no liquida dinero. Una futura ejecución con efecto deberá pasar por un contrato/ticket separado y por la autoridad canónica.

## Evidencia shadow

`hipico_agent_evaluations` guarda hash SHA-256 del mensaje, expected/predicted/actual, confidence, risk, tool, flags de seguridad y evidencia acotada; no guarda el mensaje crudo. El corpus `qa/fixtures/hipico-agent-golden-v1.json` contiene patrones operativos autorizados anonimizados y cubre aperturas, ofertas, respuestas, cierres, pizarras, llegadas, resultados, retirados, PDFs, consultas, duplicados, multi-grupo, typos, ambigüedad e input malicioso. Su digest y score esperado quedan fijados en `hipico-agent-golden-history.json`.

## Multi-grupo y prompt injection

Todo acceso se limita por `owner_id + group_key + group_id`. El scope se deriva del request autenticado y se inyecta después de validar el candidato; nunca proviene del modelo. Mensajes y documentos son datos no confiables. Intentos de cambiar reglas, revelar secretos o solicitar SQL/shell van a revisión humana. Una salida estructurada inválida falla cerrada a `requestHumanReview`.

## Límites actuales

SOURCE continúa read-only. No existe auto-liquidación ni auto-envío al grupo real. `AUTOMATIC` no amplía el conjunto de herramientas read-only. La readiness de automatización sigue `NOT VERIFIED` hasta acumular y revisar evidencia shadow real suficiente según los gates.
