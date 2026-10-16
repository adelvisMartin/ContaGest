# Control Hípico — elegibilidad para chatbot en WhatsApp Messenger (#1011)

**Corte:** 2026-10-15 · **Issue:** [#1011](https://github.com/adelvisMartin/ContaGest/issues/1011) · **BASE_SHA:** `1d0d97d2175eb09deba0a40c4b5555add75793b3` (base Git incorporada a esta revisión documental; no constituye evidencia de release)
**Canal elegido:** WhatsApp Messenger normal. **Alcance del grupo:** privado, amigos, recreativo, sin dinero real ni efecto económico. **WhatsApp Business:** excluido. **Decisión de envío automático SOURCE:** `NO_GO` mientras no haya autorización expresa verificable para Messenger.

Esta revisión fija la premisa del propietario. No preguntar nuevamente si se usa dinero real. La clasificación del grupo no altera otros módulos contables o financieros de Control Hípico/ContaGest.

## 1. Política aplicable

La fuente primaria consultada es [Condiciones del servicio de WhatsApp Messenger](https://www.whatsapp.com/legal/terms-of-service?lang=es), en español, el 15-10-2026. En “Uso aceptable de nuestros Servicios”, limita las comunicaciones inadmisibles incluyendo mensajería automática y el uso no personal salvo autorización; la sección siguiente prohíbe acceso o uso automatizado/no autorizado que afecte al servicio.

WhatsApp documenta una experiencia oficial de [agentes de terceros](https://faq.whatsapp.com/1050934623978152) sujeta a sus [términos](https://www.whatsapp.com/legal/third-party-agents-terms). La disponibilidad se limita a ciertos países y la documentación indica que el usuario conversa con el agente en su chat 1:1; el agente no puede añadirse a grupos ni acceder a otros chats. Es una vía a investigar solo si el producto cambia a consulta privada directa. **No resuelve el requisito actual de contestar dentro del grupo** y no habilita lectura o respuesta automatizada a un grupo existente.

La norma de WhatsApp Business sobre apuestas con dinero real no se presenta como regla aplicable a este caso, porque el canal pedido no es Business y el grupo no mueve dinero. Las funciones Business Platform/Groups API tampoco forman parte del diseño seleccionado. El benchmark no demuestra permiso para automatizar Messenger.

| Pregunta | Evidencia/estado | Decisión de implementación |
|---|---|---|
| ¿Qué canal pidió el propietario? | WhatsApp Messenger normal | No diseñar el producto sobre Business ni sus APIs |
| ¿Qué actividad contiene el grupo? | Amigos; juego/apuestas solo recreativas, sin dinero real, pagos, depósitos, retiros, premios canjeables o efecto económico | Puntuación, si existiera, se mantiene virtual y fuera del ledger financiero |
| ¿Las condiciones actuales permiten bots automáticos en la app normal? | Términos oficiales restringen mensajería automática y uso no personal salvo autorización | Sin autorización explícita documentada, bloquear SOURCE auto-send |
| ¿La experiencia oficial de agentes de terceros puede leer o responder dentro del grupo? | Help Center: solo chat entre el usuario y el agente; no acceso a otros chats/grupos; disponibilidad regional limitada | No es una solución para auto-respuesta grupal |
| ¿Se ha verificado una excepción o mecanismo autorizado para este caso/grupo? | No | `NOT_VERIFIED`; no inferir permiso de que el bot funcione técnicamente |
| ¿Puede continuar la implementación del producto? | Sí, con LAB sintético y asistencia humana de compartir/copiar | Continuar #892/#907 y diseñar sugerencias editables bajo los gates existentes |

## 2. Matriz ejecutable de uso

| Caso | Estado | Motivo |
|---|---|---|
| Respuesta automática a preguntas recreativas en SOURCE Messenger | `NO_GO` | No se ha verificado autorización expresa para mensajería automática en Messenger |
| Respuesta automática de programa/resultados en SOURCE Messenger | `NO_GO` | Mismo límite de automatización; la fuente y carácter recreativo no autorizan autoenvío |
| Consulta financiera (saldo, depósitos, pagos, retiros) desde el grupo recreativo | `NO_GO` | Fuera del alcance del grupo; no exponer ni crear autoridad financiera desde mensajes |
| Sugerencia editable y compartida manualmente por una persona | `HUMAN_ACTION_REQUIRED` | Vista previa/edición; acción nativa manual, sin envío en background |
| WhatsApp Business/Business API/Groups API | `NOT_APPLICABLE` | El propietario excluyó esos productos |
| LAB con fixtures sintéticos y propietario autorizado | `LAB_ONLY` | Solo bajo identidad, aislamiento, journal, dedupe y kill switch ya exigidos |
| Uso desconocido/no clasificado | `BLOCKED` | Fail-closed y derivación a persona |

## 3. Enforcements y seguridad

- `tools/hipico-whatsapp-web-bridge/src/policy-review-v1011.mjs` guarda el alcance de owner, canal seleccionado y snapshot de términos; no habilita escritura.
- `tools/hipico-whatsapp-web-bridge/src/source-policy-gate.mjs` bloquea el autoenvío SOURCE. Un flag, review ID, resultado de IA o transporte técnico no convierte SOURCE en elegible.
- **Brecha de enforcement:** ese gate cubre envío automático, pero no desactiva toda lectura SOURCE. `src/index.mjs`, `src/history-v130.mjs` y otros comandos todavía contienen rutas Playwright/Web para leer mensajes del grupo; no ejecutarlas contra WhatsApp ni afirmar que el bloqueo de lectura ya existe. La capacidad de lectura automática debe quedar deshabilitada por defecto y cubierta por un gate independiente antes de cualquier uso SOURCE.
- `runtime-config.mjs` rechaza `HIPICO_SOURCE_AUTO_REPLY_ENABLED=true`; todavía hace falta un rechazo equivalente para la lectura automática SOURCE y para el comando histórico.
- Los agentes de terceros oficiales no son un workaround para este caso: según su Help Center, no pueden ser añadidos a grupos ni acceder a otros chats.
- `source-policy-status.mjs` muestra canal y gate sin JIDs, número, token ni mensajes.
- No usar Selenium/Playwright/DOM, API privada, Baileys u otro cliente para emular actividad humana o saltar el límite de Messenger.
- Mensajes del grupo, capturas y documentos son entrada no confiable; no pueden alterar lógica, ledger, permisos ni configuración.
- Datos de apuestas recreativas nunca generan cobros, depósitos, retiros, caja, subledger ni asientos.
- Mantener consentimiento del grupo, opt-out, retención mínima, redacción de logs y eliminación cuando corresponda.

## 4. Pruebas de regresión

La suite `tests/hipico_whatsapp_policy_review_v1011.test.mjs` debe comprobar:

1. Perfil `PRIVATE_FRIENDS`, `RECREATIONAL_HORSE_RACING`, `realMoney=false` y canal normal.
2. Business products excluidos y link al ToS de Messenger como fuente de política.
3. Las intenciones SOURCE recreativas no permiten autoenvío incluso con credenciales/flags/evidencia falsos.
4. Los datos financieros están fuera del perfil recreativo y no producen mutaciones.
5. La sugerencia manual requiere acción humana y no declara `productionSourceWritingAuthorized`.
6. LAB funciona únicamente con contexto sintético y sus gates independientes.
7. CLI redacted: sin tokens, JIDs, teléfonos o textos privados.
8. El gate conserva los mismos resultados ante replay, timeout y reintento; no se duplica un mensaje ambiguo.
9. Los comandos de lectura y backfill SOURCE fallan cerrados antes de abrir Chromium o navegar a WhatsApp; las fixtures sintéticas LAB siguen disponibles sin sesión de Messenger.

Ejecutar en la raíz:

```bash
node --test tests/hipico_whatsapp_policy_review_v1011.test.mjs
node --test tests/hipico_whatsapp_v160_readiness_contract.test.mjs
npm run test:hipico
```

Registrar resultados reales con el SHA probado. El estado del código no equivale a autorización de WhatsApp ni a release.

## 5. Próximos pasos canónicos

1. Seguir con el motor de conversación y consultas canónicas LAB de [#892](https://github.com/adelvisMartin/ContaGest/issues/892).
2. Completar inbox durable, handoff y recuperación de [#907](https://github.com/adelvisMartin/ContaGest/issues/907).
3. Diseñar respuesta sugerida editable, con cita/fuente/fecha, botón copiar/compartir nativo, cancelar y registro mínimo.
4. Implementar el gate independiente de lectura SOURCE; verificar por prueba que ni `start`, `history:v130` ni tareas programadas abren Messenger o recopilan mensajes en este perfil.
5. Mantener SOURCE no automatizado mientras la autorización expresa para Messenger no esté comprobada.
6. Ejecutar QA PWA/Android, privacidad, soak y DR bajo #837/#839/#842 cuando corresponda.

**Criterio para cambiar el `NO_GO`:** una fuente oficial vigente que autorice este mecanismo de Messenger, evidencia del alcance/cuenta/grupo exactos, revisión legal/producto, revisión independiente de seguridad, pruebas negativas y nuevo PR con gates exact-SHA. El carácter recreativo/no monetario ya está confirmado y no es un requisito pendiente.
