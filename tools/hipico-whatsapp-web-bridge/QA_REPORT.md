# QA REPORT — Bridge v1.6.0

## Objetivo

v1.6.0 separa explícitamente **capacidad técnica de transporte** de **permiso de negocio/política**. El Bridge puede observar SOURCE y ejecutar conversación automática en LAB, pero SOURCE permanece read-only porque la Política de mensajes de WhatsApp Business revisada el 2026-09-29 prohíbe facilitar apuestas con dinero real.

## Controles v1.6.0

- adapter actual `playwright-web` declarado mediante contrato de capacidades;
- boundary `cloud-api` registrado como oficial pero `implemented=false` para no fingir soporte;
- gate `SOURCE_AUTO_REPLY_POLICY_NO_GO` con snapshot/reason codes estructurados;
- ningún `.env`, país, licencia o metadata de revisión puede convertir el snapshot actual en GO;
- árbitro backend determinista para respuestas conversacionales;
- Jev puede degradar una respuesta segura, nunca aumentar autoridad;
- consultas read-only usan store/risk policy canónicos;
- mensajes monetarios/lifecycle pueden generar ACK/aclaración, no ejecutar dinero/estado;
- adjuntos no conceden autoridad financiera;
- comandos y eventos persistidos/idempotentes;
- journal durable `prepared → sending → sent|ambiguous`;
- crash durante envío queda `ambiguous`, sin retry ciego;
- `fromMe` se excluye para evitar feedback loops;
- identidad de SOURCE/LAB se revalida con IDs `@g.us`;
- kill switch local bloquea promoción/envío;
- spool/backoff/replay conservan trabajo seguro durante fallos;
- diagnóstico `npm run source:policy` expone capacidades/política sin secretos.

## Gate de QA

```text
npm run check
npm test
npm run source:policy
```

El gate de repositorio agrega contratos backend, PostgreSQL efímero, browser y exact-SHA cuando la infraestructura está disponible. Un job GitHub sin steps ejecutados es `BLOCKED_INFRASTRUCTURE / NOT_EXECUTED`, no PASS.

## Resultado esperado de la prueba local

- SOURCE recibe cero mensajes automáticos;
- LAB puede responder automáticamente con IDs pinneados y distintos;
- duplicados no producen doble efecto;
- entregas inciertas quedan `ambiguous`;
- reconnect/restart conserva spool/journals;
- `sourceSendPossible=false` permanece coherente con la política actual.

Un LAB verde demuestra readiness técnica del entorno de prueba; no autoriza SOURCE writing.
