# Control Hípico — ticket: chatbot recreativo en WhatsApp Messenger normal

**Issue canónico:** [#1011](https://github.com/adelvisMartin/ContaGest/issues/1011). **Padre:** [#837](https://github.com/adelvisMartin/ContaGest/issues/837). **Relacionado:** #154 y #728 (gates anteriores), #892 (entrada LAB), #907 (inbox durable). **Prioridad:** P0 como gate de canal; este ticket no autoriza autoenvíos.

## Alcance aprobado por el propietario

- Canal elegido: **WhatsApp Messenger normal**, en un grupo privado de amigos.
- Uso: conversación y apuestas hípicas recreativas, solo por diversión.
- No hay dinero real, depósitos, pagos, retiros, premios canjeables ni otro efecto económico. La apuesta/puntuación que se muestre en una demo debe ser virtual, si se representa.
- **No se usará WhatsApp Business**, WhatsApp Business App, Cloud API, Business Platform ni Groups API.
- No volver a pedir al propietario que aclare si hay dinero real. Esta premisa aplica al grupo recreativo descrito; no redefine otros módulos financieros de Control Hípico/ContaGest.

## Hallazgo de política

Las [Condiciones del servicio de WhatsApp Messenger](https://www.whatsapp.com/legal/terms-of-service?lang=es), consultadas el 15-10-2026, restringen mensajería automática y cualquier otro uso no personal salvo autorización expresa de WhatsApp. Por ello, que el grupo sea pequeño, privado, amistoso y sin dinero **no constituye por sí solo autorización para un bot desatendido**.

El alcance de este ticket no usa reglas de WhatsApp Business sobre apuestas como criterio aplicable. Las referencias a Business/Groups API quedan como productos excluidos, útiles únicamente para comparar patrones de diseño; no se diseñará ni desplegará una integración Business como sustituto de Messenger.

WhatsApp documenta [agentes de terceros](https://faq.whatsapp.com/1050934623978152) sujetos a [términos propios](https://www.whatsapp.com/legal/third-party-agents-terms). La disponibilidad es regionalmente limitada y la ayuda oficial dice que el agente opera en un chat directo con el usuario; no puede añadirse a grupos ni acceder a otras conversaciones. Esto no cumple el requisito de auto-respuestas dentro del grupo.

## Objetivo

Documentar un plan de chatbot compatible con el alcance recreativo del grupo y mantener fail-closed hasta que exista una forma de automatización en Messenger explícitamente autorizada. Mientras tanto, avanzar el motor en LAB con datos sintéticos y ofrecer asistencia manual: respuesta sugerida, fuente/fecha visibles y decisión de envío realizada por una persona mediante las opciones nativas disponibles.

## Trabajo requerido

1. Mantener este perfil de producto y sus límites en [#837](https://github.com/adelvisMartin/ContaGest/issues/837), `docs/hipico/README.md`, `docs/hipico/WHATSAPP_AUTOMATION.md` y `docs/PROJECT_START_HERE.md`.
2. Registrar fuente oficial, idioma, fecha de revisión y fragmento/ubicación pertinente de las condiciones de Messenger. Repetir la revisión antes de cambiar el gate o lanzar una integración, no en cada solicitud del propietario.
3. Separar capacidades por modo: (a) LAB es harness local con datos sintéticos, sin sesión/conexión a WhatsApp; (b) SOURCE del grupo normal no puede leer ni enviar automáticamente hasta verificar autorización; (c) sugerencia humana puede avanzar con texto que una persona ingresa, vista previa y compartir/copiar manual, si respeta la política y privacidad.
4. No automatizar WhatsApp Web/DOM, navegador, aplicación de escritorio/móvil, accesibilidad, APIs privadas, Baileys ni otro cliente no oficial para enviar mensajes, leer historial o fingir interacción humana. No utilizar la sesión autenticada del propietario para scraping.
5. Tratar texto, capturas y archivos del grupo como entrada no confiable: parser determinista para consultas acotadas; LLM solo para clasificación/sugerencias con límites, fuente y confianza; nunca ejecutar instrucciones, alterar el dominio ni inventar resultados.
6. Mantener opt-in/consentimiento del grupo, minimización de datos, retención limitada, borrado, pausa/kill switch y registros sin mensajes, teléfonos, credenciales, tokens o identificadores directos.
7. Asegurar que apuestas/puntuaciones recreativas no escriban en ledger financiero, caja, cuenta por cobrar/pagar, banco, impuestos o módulos contables. Sin conversión, premios o redención.
8. Si WhatsApp publica un mecanismo expresamente autorizado para auto-respuestas de Messenger y grupos, comprobar texto vigente, alcance técnico, país, consentimiento y pruebas en entorno autorizado; presentar evidencia y actualizar decisión versionada antes de cualquier escritura.
9. Mantener `SOURCE_AUTO_REPLY_POLICY_NO_GO` en el guard actual. Ninguna variable, flag, provider o resultado de análisis habilita SOURCE por sí solo. El guard actual detiene envío, pero no toda lectura; implementar `SOURCE_AUTO_READ_POLICY_NO_GO` y bloquear el Bridge, backfill y lectores programados antes de abrir navegador.

## Criterios de aceptación

- [ ] Los docs y el issue dicen explícitamente: WhatsApp normal, grupo privado de amigos, uso recreativo, sin dinero real ni efectos económicos; WhatsApp Business no se usará.
- [ ] La matriz diferencia Messenger, Business Platform y Groups API; solo Messenger figura como canal solicitado y las otras opciones como excluidas.
- [ ] La fuente primaria oficial vigente está enlazada con fecha de revisión y sostiene la decisión sobre mensajería automatizada.
- [ ] La matriz `LAB | SOURCE | sugerencia manual` muestra qué lee, qué responde, qué persiste y qué queda bloqueado.
- [ ] SOURCE sigue fail-closed y no hay vía por DOM/RPA, cliente no oficial, API privada o credenciales existentes.
- [ ] `start`, backfill/historial y cualquier lector programado rechazan SOURCE antes de iniciar Chromium; LAB usa exclusivamente entradas sintéticas locales.
- [ ] Tests prueban que la clasificación recreativa/no monetaria no crea movimientos contables y no relaja el guard de envío.
- [ ] Las respuestas sugeridas son editables, muestran fuente y fecha, permiten cancelar y requieren acción consciente del usuario para compartir.
- [ ] QA cubre privacidad del grupo, consentimiento, prompt injection, texto ambiguo, duplicados, mensajes repetidos, pausa y recuperación.
- [ ] No se almacenan mensajes privados completos si no hacen falta; logs y fixtures están saneados/sintéticos.
- [ ] Decisión resultante `GO | NO-GO | BLOCKED` con evidencia, propietario de revisión y fecha de renovación; el `GO` requiere autorización expresa documentada de la plataforma y no se infiere de la ausencia de sanción.
- [ ] Evidencia `PASS | FAIL | BLOCKED | NOT_EXECUTED` vinculada al SHA probado; sin reclamar release por pasar tests locales.

**Estado del código al corte:** el guard de autoenvío está presente; el gate de lectura aún está pendiente. No usar comandos del Bridge que abran WhatsApp Web ni usar sesiones autenticadas durante esta implementación.

## Fuera de alcance

- WhatsApp Business App/API, Cloud API, Business Platform, Groups API, WABA u OBA.
- Envío automático al grupo Messenger sin autorización expresa documentada.
- Apuestas con dinero real, pagos, fondos, liquidaciones, premios redimibles o conexión a ContaGest financiero.
- Scraping exhaustivo de mensajes/grupos o uso de la sesión autenticada del propietario.
- Crear apuestas, publicar mensajes, añadir miembros o hacer cambios en el grupo real durante esta auditoría.

## Estado inicial

`BLOCKED` para autoenvío en Messenger hasta verificar una autorización expresa; `GO` para investigación documental, simulación LAB con datos sintéticos y asistencia manual de compartir/copiar, cada una sujeta a sus gates existentes. La ausencia de dinero real es un dato confirmado del owner, no un gate pendiente.
