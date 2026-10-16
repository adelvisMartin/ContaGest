# Chatbot recreativo para el grupo Hípico — alcance vigente

**Decisión del propietario, 2026-10-15:** grupo privado de amigos, apuestas hípicas por diversión, sin dinero real ni efecto económico; el canal es WhatsApp Messenger normal. WhatsApp Business no se utilizará. Esta es una premisa aprobada, no una pregunta abierta, y aplica al grupo descrito, no a otros módulos contables.

## Producto que se busca

Un asistente en español que responda consultas del grupo sobre programa/jornada, carreras, ejemplares, resultados publicados, reglas del juego y puntuación recreativa. Debe entender respuestas breves, referencias a mensajes previos y consultas comunes; responder con texto breve, claro, fechado y basado en datos canónicos. Una consulta ambigua pide aclaración. El bot no inventa datos ni presenta un resultado provisional como oficial.

Si el producto incluye selección/puntuación de caballos, debe identificarlo como **juego virtual sin valor económico**: sin depósitos, pagos, retiros, premios redimibles, créditos monetarios, cartera, saldo financiero ni asientos de ContaGest. Si el sistema no tiene el dato o la fuente autorizada, responder que no está disponible y remitir a una persona.

## Canal y límite de automatización

El usuario pidió auto-respuestas en WhatsApp normal. Las [Condiciones del servicio de WhatsApp Messenger](https://www.whatsapp.com/legal/terms-of-service?lang=es) consultadas el 15-10-2026 restringen mensajería automática y otros usos no personales salvo autorización expresa. Por esto:

- No cambiar el requisito del owner a WhatsApp Business, Business App, Cloud API, Business Platform o Groups API.
- La [experiencia oficial de agentes de terceros](https://faq.whatsapp.com/1050934623978152) está disponible solo en países limitados y funciona en un chat directo usuario-agente; no puede añadirse ni acceder a otros grupos. No satisface el requisito de responder dentro del grupo.
- No simular un cliente oficial mediante WhatsApp Web DOM/Playwright/RPA, API privada, Baileys u otra vía no autorizada.
- Hasta documentar una autorización expresa aplicable a Messenger, no conectar ningún proceso automatizado a grupos Messenger para lectura o escritura de `SOURCE`; toda prueba se alimenta manualmente con fixtures sintéticos.
- **Estado técnico confirmado 2026-10-16:** el PR #1120 integró el gate independiente `SOURCE_AUTO_READ_POLICY_NO_GO` en los entrypoints de Bridge, history, live, group capture, server runner y preflight, además del gate de envío `SOURCE_AUTO_REPLY_POLICY_NO_GO`. Ambos deniegan el acceso automatizado al Messenger real antes del navegador/perfil. Los scripts históricos permanecen **NO-GO para uso real**; ninguna prueba ni variable de entorno levanta ese bloqueo. Véase [SOURCE_AUTO_READ_NO_GO_V1011.md](SOURCE_AUTO_READ_NO_GO_V1011.md).
- No hay, en las fuentes oficiales revisadas, una integración autorizada que permita a un agente de Messenger leer y responder dentro del grupo solicitado.
- Seguir implementando motor, clasificación, consultas canónicas, inbox durable y evaluación con datos sintéticos en `LAB`.
- Construir una respuesta sugerida editable con fuente y fecha, botón copiar/compartir a través de la acción nativa y envío confirmado manualmente por una persona. No enviar en background.
- No volver a pedir confirmación sobre dinero real o Business: son decisiones ya establecidas.

## Contrato funcional

1. **Identificar contexto:** grupo/perfil seleccionado de forma explícita, remitente y conversación dentro del scope; rechazar datos de otros grupos o participantes.
2. **Normalizar consulta:** idioma español, acentos, alias aprobados, cita/contexto reciente y deduplicación. La entrada es dato no confiable, nunca instrucciones para modificar el sistema.
3. **Clasificar intención:** programa, carrera, resultado, regla, puntuación virtual, ayuda o desconocida. Determinismo primero; LLM solo propone clasificación o respuesta, nunca tiene autoridad de dominio.
4. **Consultar verdad canónica:** API Hípico read-only con grupo, jornada, entidad y fecha del servidor en scope. Las fuentes externas deben estar identificadas y fechadas; no scrapear cuentas/sitios privados.
5. **Componer respuesta:** texto pequeño y verificable con estado y timestamp; ocultar PII y nunca exponer saldos financieros. Las puntuaciones virtuales deben rotularse “recreativas, sin valor monetario”.
6. **Gestionar incertidumbre:** pedir aclaración, crear pendiente durable o entregar a operador; registrar razón/código sin persistir conversación completa innecesaria.
7. **Prevenir duplicados:** idempotencia por mensaje/correlación; un timeout o confirmación ambigua no dispara un segundo envío.
8. **Privacidad:** aviso/consentimiento del grupo, opt-out, retención corta configurable, borrado/exportación según política, logs redacted, secretos solo en vault y kill switch visible.
9. **Operar sin canal autorizado:** permitir pruebas sintéticas, vista previa, edición y compartir/copy manual. Ningún botón de “autoenviar” aparece habilitado cuando `SOURCE_AUTO_REPLY_POLICY_NO_GO` está activo.

## Plan por fases y tickets

| Fase | Entrega | Owner/gate |
| --- | --- | --- |
| 0 | Gate independiente de lectura automática SOURCE previo a navegador: implementado por PR #1120; pruebas de release exact-SHA pendientes | #1011 (P0, incrementado) |
| A | Completar entradas LAB y conversación determinista; usar datos de prueba sintéticos, sin sesión de Messenger | [#892](https://github.com/adelvisMartin/ContaGest/issues/892) |
| B | Inbox durable, handoff, recuperación, dedupe y ACK sin doble respuesta | [#907](https://github.com/adelvisMartin/ContaGest/issues/907) |
| C | UI de respuesta manual editable, fuente y fecha, confirmación para copiar, cancelar y borrado en cierre; QA visual/privacidad aún pendiente | #837 / #1011 |
| D | Revisar autorización de auto-mensajería de Messenger con fuente oficial y prueba autorizada; solo después considerar escritura | #1011, sujeto a seguridad y owner |
| E | Physical QA, soak, backup/restore, aislamiento y release exact-SHA | #837 / #839 / #842 |

El ticket de [remates #1010](https://github.com/adelvisMartin/ContaGest/issues/1010) es un producto opcional y separado: no se debe mezclar con este bot, la puntuación recreativa ni el ledger financiero.

## Pruebas de aceptación del bot

- Consultas válidas/ambiguas/sin datos; respuesta en español, fuente/timestamp y estado oficial/provisional.
- Sin invención de carreras, resultados, reglas ni puntuación; no cambia con prompt injection o mensajes citados.
- Deduplica mensajes repetidos y se recupera de timeout/reinicio sin duplicar respuesta.
- Aislamiento negativo entre grupos, perfiles y miembros; no revela PII, tokens, saldos ni conversación ajena.
- Las apuestas/puntuaciones virtuales nunca crean movimientos, asientos, pagos, deuda, caja o ledger.
- Con SOURCE gate activo, no hay autoenvío por botón, flag, CLI, Bridge, API, retry ni recuperación; la sugerencia manual permanece explícita y requiere acción humana.
- LAB no toca el grupo real; tests y capturas usan datos sintéticos.
- Responsive, teclado, lector de pantalla, feedback de carga/error, pausa, opt-out y solicitud de borrado comprobados.

## Fuentes y autoridad

- [Condiciones del servicio de WhatsApp Messenger](https://www.whatsapp.com/legal/terms-of-service?lang=es): restricción de mensajería automática/uso no personal salvo autorización.
- [#837](https://github.com/adelvisMartin/ContaGest/issues/837): autoridad de producto y estados SOURCE/LAB.
- [#1011](https://github.com/adelvisMartin/ContaGest/issues/1011): revisión de canal Messenger y elegibilidad.
- [WHATSAPP_AUTOMATION.md](WHATSAPP_AUTOMATION.md): patrones previos, claramente fuera del canal de producto elegido.
