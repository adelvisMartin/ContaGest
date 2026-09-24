# QA REPORT — Bridge v1.5.0

## Objetivo

La versión 1.5.0 añade respuesta autónoma segura en el grupo SOURCE. El canal permanece en solo lectura por defecto y sólo puede enviar cuando backend y Bridge habilitan explícitamente `HIPICO_SOURCE_AUTO_REPLY_ENABLED=true`, el grupo `@g.us` está pinneado, el preflight está listo y no existe kill switch local.

## Controles v1.5.0

- árbitro backend determinista para respuestas autónomas;
- Jev sólo puede degradar una respuesta segura; nunca aumenta autoridad;
- consultas hípicas read-only usan el store canónico y Risk Policy antes de responder;
- mensajes monetarios/lifecycle pueden recibir ACK o aclaración, pero nunca ejecutar dinero/estado;
- adjuntos solicitan texto antes de recurrir a humano;
- hasta tres aclaraciones automáticas antes del handoff de último recurso;
- comandos `source_reply` persistidos e idempotentes;
- journal local `prepared → sending → sent|ambiguous`;
- un crash durante envío queda `ambiguous` y no se reenvía a ciegas;
- mensajes `fromMe` se excluyen para evitar feedback loops;
- identidad SOURCE se revalida antes de escribir y antes de Enter;
- recibos de entrega se reconcilian con backend;
- kill switch local bloquea auto-reply aunque la configuración siga activa;
- datos/colas permanecen bajo el directorio persistente del Bridge.

## Gate

`npm run check`, `npm test`, typecheck y tests Hípico del backend, PostgreSQL
aislado para idempotencia/recibos, build backend y `git diff --check` deben pasar
sobre el SHA exacto. CI nunca activa el envío real a WhatsApp.

El Bridge sólo puede operar SOURCE auto-reply cuando
`/api/v1/hipico-bot/bridge/health` responde `ready=true`,
`sourceSendPossible=true` y `mode=safe-auto`. En cualquier discrepancia el
preflight falla cerrado.
