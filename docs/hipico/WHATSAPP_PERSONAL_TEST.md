# Prueba controlada de WhatsApp — Hípico Control

## Objetivo
Validar el circuito real extremo a extremo con un chat personal antes de depender del grupo operativo.

## Privacidad
El número personal de prueba no se escribe en Git ni en fixtures. Se configura como `HIPICO_TEST_RECIPIENT_E164` en el entorno/Meta y los fixtures usan identificadores anonimizados.

## Precondiciones
- App de Meta con producto WhatsApp.
- WABA/número de prueba o número empresarial habilitado.
- Recipient de prueba autorizado en Meta cuando el modo de prueba lo requiera.
- Callback HTTPS desplegado en Vercel.
- Secrets configurados solo server-side: verify token, app secret, access token, phone number id y service role necesaria.

## Secuencia E2E
1. Meta valida el callback del webhook.
2. Se envía un mensaje de prueba desde Hípico al chat personal autorizado.
3. Desde el teléfono personal se responde con `saludos`; debe persistirse y clasificarse como conversación sin respuesta automática.
4. Se envía `Juego 2n del 4 con 100k`; debe persistirse y crear una oferta estructurada.
5. Se responde con una cita/monto corto; debe correlacionarse sin crear una apuesta independiente.
6. Se envía `Sf`; solo se confirma cuando exista contexto inequívoco.
7. Se envía un cierre autorizado; nuevas ofertas quedan tardías.
8. Se envía una llegada; debe extraerse el orden correcto.
9. Se fuerza reentrega/replay del mismo payload; no debe duplicarse el mensaje ni la operación.
10. Se desconecta el teléfono del operador; el webhook cloud debe continuar si el canal se ejecuta realmente en Cloud API.
11. Al reconectar la PWA/APK, debe mostrar backlog procesado, estado y trazabilidad.

## Gates
- Cada mensaje del test aparece una sola vez en `hipico_messages`.
- Webhook inválido o firma incorrecta se rechaza.
- El mensaje original puede rastrearse desde el evento/operación.
- Ninguna respuesta corta crea dinero sin contexto.
- Cierre manda sobre mensajes posteriores.
- Outbox no duplica respuestas.
- La UI diferencia En vivo, Retrasado, Sin conexión, Recuperando y Hueco detectado.

## Importante
La prueba personal valida mensajería individual y la arquitectura cloud. No demuestra por sí sola que un grupo ordinario de WhatsApp entregue todos sus mensajes mediante la misma API; ese escenario requiere una validación separada con soporte oficial del canal real.
