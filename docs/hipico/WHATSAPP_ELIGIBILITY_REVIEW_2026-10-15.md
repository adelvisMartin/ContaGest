# Control Hípico — elegibilidad WhatsApp y revisión de política #1011

**Corte:** 2026-10-15 · **Issue:** [#1011](https://github.com/adelvisMartin/ContaGest/issues/1011) · **BASE_SHA:** `5c1b4a940867aac1581dcf2c2deb7e4a4145431a`  
**Decisión sobre SOURCE (grupo real): NO-GO** para envío automatizado. **Account/capability/legal review: BLOCKED/NOT_VERIFIED.** Este documento no habilita ningún mensaje, ni reemplaza los términos oficiales.

## 1. Fuente, evidencia y confianza

| Fuente oficial / fecha de revisión | Hallazgo documentado | Estado |
|---|---|---|
| [WhatsApp Business Messaging Policy](https://business.whatsapp.com/policy/preview?lang=es_LA) · 2026-10-15 | La política vigente (23-09-2026), §4, restringe las apuestas con dinero real, **pero §§5–6 definen excepciones acotadas** para mensajes promocionales de apuestas en línea mediante Business Platform sólo en **Australia, Japón, Colombia, México y Perú**, sujetas a jurisdicción, edad, licencias y aprobación explícita de Meta. **Venezuela no figura en la lista de excepciones para apuestas en línea**; la presencia de Perú en esa lista tampoco habilita el grupo real ni elimina requisitos de elegibilidad. Exige consentimiento/opt-out y escalamiento humano en supuestos permitidos. | `VERIFIED_POLICY_TEXT` vía fuente oficial accesible |
| [WhatsApp Business Solution Terms](https://www.whatsapp.com/legal/business-solution-terms) · revisado 2026-10-15; página indexada: último cambio 2026-03-06 | Términos para proveedores terceros y de IA. Business Solution Data no debe utilizarse para entrenar/mejorar modelos externos generales; la excepción descrita para fine-tuning exclusivo tiene condiciones. Un producto de IA principal tiene restricciones específicas, distintas de una IA meramente auxiliar. | `PARTIAL`: texto oficial indexado; la URL de lectura directa puede exigir autenticación |
| [Meta Terms for WhatsApp Business](https://www.whatsapp.com/legal/meta-terms-whatsapp-business?lang=es) · 2026-10-15 | La página remite a cambios con vigencia anunciada el 2026-09-23; no asumimos que el aviso/banner sea prueba de aprobación del caso. | `PARTIAL` texto oficial visible |
| [WhatsApp Groups API](https://developers.facebook.com/documentation/business-messaging/whatsapp/groups/) · 2026-10-15 | La consulta oficial de Groups API respondió HTTP 429. **No verificamos** con éxito los requisitos actualizados de OBA, tamaño, coexistencia, formatos de mensaje o autorización para el grupo existente. Las cifras de documentación secundaria se consideran hipótesis pendientes de comprobación. | `NOT_VERIFIED_RATE_LIMITED` |
| [Third Party Agent Terms](https://www.whatsapp.com/legal/third-party-agents-terms) · texto fechado 2026-08-25 | Existen términos para agentes de terceros operando en una plataforma de WhatsApp. No se confirma que el Bridge actual esté autorizado como tal por disponer de código técnico. | `REVIEW_REQUIRED` |

### Excepciones limitadas no son autorización para este SOURCE

La política distingue **promoción de apuestas en línea** (exige lista territorial, aprobación Meta y otras condiciones) de **actividades presenciales** y otras categorías mencionadas en §6. Es incorrecto afirmar una prohibición absoluta en todas las regiones o que poseer una licencia local automáticamente convierta una operación en autorizada. Ninguna excepción se ha acreditado para la cuenta/grupo/actividad de este proyecto. `SOURCE=NO_GO` se mantiene por evaluación concreta y falta de evidencia, no por negar las excepciones de la política.

**Captura de evidencia:** texto oficial público [Business Messaging Policy §§4–6](https://business.whatsapp.com/policy/) leído 2026-10-15 (la página declara revisión 2026-09-23); Groups API siguió inaccesible. Las listas territoriales y términos pueden cambiar: renovar evidencia antes de cualquier evaluación futura.

No se consultaron credenciales del propietario, el WABA real ni la cuenta del grupo; **no se hicieron envíos, apuestas, compras, creaciones de grupo ni pruebas sobre WhatsApp real**.

## 2. Matriz por caso de uso (efecto de la política sobre el producto actual)

| Caso | Usuario/destino | Interacción y riesgo | Decisión | Por qué/condiciones |
|---|---|---|---|---|
| `SOURCE_WAGERS` | Miembros del grupo real SOURCE | Jugadas, recepción/confirmación de apuestas, apuestas con dinero real | **NO_GO** | Política de mensajes comercial prohibitiva para el caso, independiente del transporte |
| `SOURCE_BALANCES` | Miembros de SOURCE | Saldos, depósitos, retiros, pagos, devoluciones, transferencias | **NO_GO** | En el contexto real facilita la operación monetaria; no convertir consulta en excepción |
| `SOURCE_RESULTS` | Miembros de SOURCE | Resultado/pizarra/respuesta automatizada asociada a liquidación | **NO_GO** | Sigue dentro del mismo contexto comercial hípico de dinero real |
| `SOURCE_GENERAL_INFORMATION` | Miembros de SOURCE | Respuestas de bot aparentemente informativas | **NO_GO** | No hay aprobación separada del caso ni del grupo existente; no inferir autorización por texto neutro |
| `PRIVATE_INFORMATIONAL_ONE_TO_ONE` | Destinatario individual hipotético | Consulta genuinamente no monetaria, sin referencia al grupo de apuestas | **BLOCKED** | Account/consent/opt-out/plantilla/ventana 24h/región/uso permitido y proveedor no verificados |
| `OFFICIAL_GROUPS_API_TEST` | Grupo sandbox oficial hipotético | Pruebas de grupos/Cloud API, webhook y delivery receipts | **BLOCKED** | Groups API dio 429 y elegibilidad WABA/OBA/capacidades no verificada |
| `THIRD_PARTY_AI_AGENT` | Procesador tercero | Modelo IA, mensajes y datos de usuarios | **BLOCKED** | Falta analizar términos del proveedor, contrato y destino de los datos |
| `LAB_SYNTHETIC` | LAB de QA explícitamente autorizado | Corpus sintético, respuestas sin efectos monetarios | **LAB_ONLY** condicionado | No concede permiso de plataforma ni sustituye identity/handoff/pinning, antivirus de duplicados, consentimiento ni kill switch |

`NO_GO` y `BLOCKED` nunca se transforman en `GO` al configurar `HIPICO_SOURCE_AUTO_REPLY_ENABLED=true`, activar un transport/cloud API, marcar edad, adjuntar un «permiso» en un env var o rebautizar un mensaje de apuesta como «informativo».

## 3. Implementación, alcance y pruebas de regresión

- `tools/hipico-whatsapp-web-bridge/src/policy-review-v1011.mjs` es el **snapshot de producto/eligibilidad** con referencia oficial, fecha, clasificación conservadora y razones sanitizadas. No crea otro canal, motor de conversación ni autoriza enviar mensajes.
- `tools/hipico-whatsapp-web-bridge/src/source-policy-gate.mjs` sigue siendo la **única autoridad ejecutable** de bloqueo SOURCE. El review v1011 renueva su fecha/snapshot, sin habilitar `eligible` ni `sourceAutoReplyEnabled`.
- `tools/hipico-whatsapp-web-bridge/src/source-policy-status.mjs` muestra `NO_GO`, fecha/revisión, caso de uso y requisitos no verificados sin imprimir JIDs, número, token ni mensajes. Es el indicador de estado disponible para operaciones mientras no exista UX visual aprobada.
- `tests/hipico_whatsapp_policy_review_v1011.test.mjs` entra automáticamente en `node scripts/hipico-root-contracts.mjs` por convención `hipico*.test.mjs`. Verifica default-deny, aislamiento LAB, imposibilidad de transformar SOURCE a GO y redacción del CLI.
- El Bridge tiene otras protecciones de identidad, journal y de LAB ya existentes. Este ticket **no las reemplaza ni valida físicamente**.

Para probar localmente con Node 22:

```bash
node --test tests/hipico_whatsapp_policy_review_v1011.test.mjs
node scripts/hipico-root-contracts.mjs
cd tools/hipico-whatsapp-web-bridge
npm run source:policy
npm run qa
```

`source:policy` con SOURCE habilitado debe salir con código 2 y explicar el NO-GO; sin solicitud presenta `DISABLED`, no `GO`. El resto del QA tiene estado `NOT_EXECUTED` hasta probarlo realmente en un checkout completo.

## 4. Aprobaciones y dependencias para futuras decisiones

1. Legal/compliance y titular documentan propósito real, apuestas frente a información separable, jurisdicción, tipo de organización y permisos; un cambio de nombre de endpoint no cambia la actividad.
2. Meta/WhatsApp oficial: confirmación vigente de política y de elegibilidad por caso, WABA/OBA, región, participantes/grupo, consentimiento, tipo de mensaje y términos de grupos. **Actualmente NOT_VERIFIED.**
3. Protección de Business Solution Data: contrato proveedor, inventario/redacción/retención, propósito, aislamiento, solicitudes de borrado, IA no entrenada con datos ajenos y no exposición de información personal.
4. Sólo tras autorización independiente, un sandbox oficial permitido puede verificar webhooks/receipts; nunca realizar una prueba de envío sobre SOURCE para demostrar disponibilidad.
5. Cualquier cambio `GO` exige nuevo PR revisado por seguridad, jurídico/producto, evidencia fechada, pruebas negativas, decisión firmada y release gate exact-SHA. Sin todo ello continuar `NO_GO`.
6. Los desarrollos #892/#907 siguen en LAB y SOURCE read-only. Si los términos prohíben el caso, se elige otro canal autorizado o una consola propia; no un bypass DOM/Cloud API/Baileys.

## 5. Pendientes del issue #1011 (no presentarlos como completados)

- Acceso/lectura confirmada de Groups API oficial y tabla de capacidades vigentes; sesión devolvió 429.
- Titular de WABA y operator, tipo de cuenta, región, número, grupo y consentimiento: no se solicitó ni almacenó PII.
- Revisión jurídica/producto; validación con cuenta y grupo sandbox oficial, sólo cuando se justifique.
- Revisión independiente de seguridad; UX operacional integrada más allá del CLI, si el owner la requiere.
- QA física Windows/Android/WhatsApp real y estabilidad #119/#120: pendientes por decisión del propietario y gates de seguridad.

**Resultado verificable de este incremento:** código y documentación que reproducen un bloqueo existente con mayor transparencia y pruebas; **no es habilitación de WhatsApp productivo**, ni certificación completa del issue.
