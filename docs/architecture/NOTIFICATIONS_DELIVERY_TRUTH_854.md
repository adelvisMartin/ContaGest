# #854 — Notificaciones: veracidad del estado, privacidad y autoridad pendiente

**Ticket:** [#854](https://github.com/adelvisMartin/ContaGest/issues/854)  
**Baseline:** `main@7d681c8b609f36fc23ec93cb9fedca0b6a2ef1b4`  
**Owner exclusivo:** `ChatGPT-ContaGest-Notification-Truth-20261015-w6`  
**Estado de alcance:** `IMPLEMENTED_INCREMENT / INCOMPLETE_EPIC`.

## Hallazgo reproducible anterior

`backend/src/modules/notifications/notifications.routes.ts` registraba dos rutas independientes:
- `POST /api/v1/notifications/send` analizaba `{to,message,order?}` y devolvía `{queued:true,channel:'generic',to,message}` **sin llamar un worker, outbox ni DB**, y además reflejaba los datos personales en la respuesta.
- `POST /api/v1/notifications/whatsapp/order` enviaba directamente por Meta Cloud si había credenciales. El HTTP 200 se trataba como `sent` sin receipt; el registro `moduleRecord` persistía el pedido completo, texto de mensaje y objeto de respuesta Meta, pudiendo incluir contacto y otros datos sensibles.

`NotificationLog` existe en Prisma, pero no tiene todavía la autoridad completa de intent/template/preferencia/quiet-hours/delivery del #854, ni el worker transaccional requerido por [#853](https://github.com/adelvisMartin/ContaGest/issues/853). No introducir una segunda cola, ni fingir que `NotificationLog` implica un envío durable.

## Cambio integrado (incremento seguro)

| Frontera | Antes | Después | Invariante |
|---|---|---|---|
| `POST /notifications/send` | 200 `queued:true` + teléfono/mensaje reflejados | HTTP **503** con texto genérico de indisponibilidad tras validar el shape | Sin worker no existe un encolado; sin envío, sin retención de destinatario en logs |
| `POST /notifications/whatsapp/order` | HTTP Meta 200 → registro `sent` | HTTP Meta 200 → registro `provider_accepted`; API `delivered:false` | El ACK no es un comprobante de entrega al destinatario |
| Log del pedido | `title` con número y `payload` con pedido/mensaje/respuesta | Sólo `channel`, `provider`, `providerAccepted`, `deliveryConfirmed:false` | Minimización de datos; no teléfono, texto, secretos ni payload ajeno en DB |
| Error Meta | JSON externo incluido en mensaje de error | Texto genérico sin reflejar respuesta Meta | No filtrar campos ni PII del proveedor |

### Compatibilidad que hay que revisar

La semántica cambia deliberadamente para clientes que trataban `queued:true` o `status:sent` como éxito definitivo. Identificar consumidores y adaptar su UX a:
- `503`: **no se solicitó ninguna entrega**; orientar al operador a reintentar sólo cuando el sistema informe que existe un servicio de cola. No hacer retry infinito desde navegador.
- `provider_accepted`: el proveedor recibió la solicitud, **no** se demostró entrega ni lectura. El identificador de mensaje no se devuelve al frontend hasta definir un registro seguro y un receipt autorizado en #772/#853.
- `skipped`: proveedor no configurado; no inferir éxito.
- `delivered`: reservado para evidencia de canal/receipt verificada futura.

No se enviaron mensajes ni se usaron credenciales reales durante la implementación. `/whatsapp/order` preexistente sigue necesitando una revisión adicional de consentimiento, sesión, canal y elegibilidad de Meta antes de declararlo listo para producción; **este incremento no certifica compliance**. En Control Hípico, SOURCE permanece read-only/NO-GO bajo #1011; no acoplar ese Bridge al ERP genérico.

## Pruebas

- `node --test tests/notifications_delivery_truth_issue_854.test.mjs`: cinco regresiones de fuente sobre rutas, estados y redacción. Integrado en `npm --workspace backend test` para que se ejecute con el pipeline de CI ya existente.
- `qa/notification-dispatch-v854.e2e.mjs`: Playwright API E2E **opcional y de fallo cerrado**, deliberadamente fuera del glob de suites automáticas; se ejecuta sólo mediante `npx playwright test --config playwright.notifications-v854.config.mjs`, exige `CG_NOTIFICATION_E2E_ISOLATED=true`, `CG_NOTIFICATION_E2E_URL=http://127.0.0.1:PUERTO` y `CG_NOTIFICATION_E2E_TOKEN` sintético para una cuenta con permiso `sales.manage`. Responde HTTP 503 sin datos privados.
- `npm run typecheck`, `npm run test`, `npm run build:backend` y navegador, PostgreSQL 17 efímero, BOLA A/B: obligatoriedad de pruebas locales completas antes del cierre final. Sin dependencias añadidas, DDL ni migraciones en este incremento.
- No interpretar cola de GitHub Actions como PASS o fallo de código.

## Camino incremental restante de #854

1. **#853 como prerequisito:** outbox transaccional canónico, idempotencia y workers con reinicios/reconciliation; `/notifications/send` sólo podrá responder queued real cuando persistir el intent en una transacción pase y un worker autorizado esté configurado.
2. Catálogo versionado de plantillas e interpolación escapada, localidad/timezone y branding; sin SQL arbitrario ni HTML enviado por los clientes.
3. Preferencias/consentimiento, quiet-hours/DST, opt-outs, RBAC/tenant y enlaces sensibles caducos; casos clínicos y financieros tienen owners propios.
4. Adaptadores provider-neutral bajo #772, recibos verificables, estado `accepted` vs `delivered` vs `failed`, circuit breaker, backoff y DLQ del #853; la ruta directa preexistente requiere su propia migración.
5. UX Cg*: timeline/estado, edición autorizada de preferencias y plantillas, vacíos/errores/permisos, reintento con idempotencia.
6. Regresiones unitarias + PG17 A/B, Playwright real y evidencia exact-SHA; **mantener issue #854 abierto** hasta cierre de ese alcance y de dependencias.

## Rollback / interoperabilidad

Se trata de una reducción de afirmaciones y datos privados expuestos. Si un consumer exige el contrato anterior, adaptar al nuevo estado de error/accepted con manejo explícito; **no restaurar `queued:true` sin cola, ni `sent` sin receipt, ni payload privado en DB**. No se cambia schema Prisma ni RLS. La decisión operativa de envío masivo/productivo sigue aparte.

## Cierre de vector de envío sin autorización (2026-10-22)

Al comprobarse ausencia de consentimiento persistente y vinculación segura `FoodOrder → recipient`, `POST /notifications/whatsapp/order` no puede seguir emitiendo mensajes a cualquier teléfono aportado en el cuerpo. Responde 503 sin proveedor ni escritura; no borra la evidencia histórica existente. Esto evita transformar `sales.manage` en permiso para mensajes a terceros. La infraestructura #853 está presente (issue cerrado), pero falta wiring de intents de notificación, y #772/consentiente de canal todavía no son una autoridad integrada. Los tests de regresión ahora verifican esta negación por defecto en vez de certificar un ACK no entregado. Este cambio intencional requiere actualización de la UX cuando se ofrezca envío automático formal.
