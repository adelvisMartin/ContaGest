# #854 — Veracidad del acuse Meta Cloud (incremento)

El proveedor WhatsApp Cloud responde HTTP 2xx a una petición, pero eso no demuestra entrega. El módulo `notification-provider-ack.mjs` exige un único ID de mensaje del provider, sin registrar ni reflejar el ID, teléfono, texto, contact ni respuesta cruda. Un 200 sin ID válido produce `provider_unverified`, no `provider_accepted` ni `delivered`. No se genera reenvío automático: es un resultado ambiguo que requiere reconciliación independiente. El estado `delivered` depende de evidencia posterior por webhook firmado y no existe todavía esa integración.

`notifications.routes.ts` aplica el clasificador al retorno Meta, registra el estado de forma mínima y mantiene `delivered:false`. El endpoint general `/send` sigue 503 sin outbox; no se introduce cola ni adaptador obligatorio, se excluye Hípico SOURCE.

Pruebas: `node --test tests/notification_provider_ack_v854.test.mjs`. Pendientes: PostgreSQL17, canal real consentido, webhooks verificados, integración #853/#772, tenant A/B, browser. #854 continúa OPEN; este incremento no autoriza envíos ni certifica delivery. Rollback: revert 3 files, sin migración.

## Unificación de evidencia de intento (2026-10-22)

`POST /notifications/whatsapp/order` registra metadatos mínimos en `NotificationLog` en vez del legacy `ModuleRecord(moduleSlug=notification-log)`, para que `GET /notifications/delivery-evidence` vea **nuevos intentos**. Se admite `provider_unverified` en la proyección como estado incierto, `receiptVerified=false`. Los registros históricos de ModuleRecord no se migran ni se muestran en este timeline; requieren reconciliación explícita para no duplicar ni mentir sobre cobertura. Esta corrección no garantiza atomicidad provider↔DB, webhook ni retries #853/#772; mantener #854 OPEN.

## Hardened transport validation — 2026-10-22

El adaptador directo heredado ahora valida destino internacional, acepta únicamente el campo `phone` dentro de `order`, limita el texto, rechaza campos inesperados fuera de `order` y valida versión/identificador de API Graph antes de construir la URL. Establece un timeout de 10 s. No registra teléfonos ni mensajes. **Esto no prueba consentimiento, delivery, outbox, idempotencia de proveedor ni un teléfono asociado a un pedido persistido**; producción automatizada sigue NO-GO hasta integrar #853/#772 y resolver esas referencias server-side. El enlace manual `wa.me` del frontend no usa este envío automático.

## Política fail-closed frente a consentimiento ausente (2026-10-22)

La versión anterior de `/whatsapp/order` aceptaba el teléfono proporcionado por el navegador y podía llamar Meta directamente **antes** de registrar el intento. No existe en Prisma evidencia tipada/auditable de consentimiento, preferencias de canal, ni garantía de deduplicación/recibo. Esa ruta ahora valida sintaxis y responde HTTP **503** sin hacer ninguna llamada externa, escribir `NotificationLog` o fingir envío. El clasificador puro `notification-provider-ack.mjs` se conserva para un futuro adapter #772, pero no está conectado. `/delivery-evidence` mantiene lectura de históricos sin PII. El enlace manual `wa.me` requiere interacción del operador y **abrirlo no demuestra entrega**.

Condición para reactivar: orden/recipient resolved exclusivamente server-side, consentimiento persistido y trazable, preferencias + quiet hours, intento idempotente en #853 y adapter verificado #772 con recepción autenticada. No introducir un feature flag que permita saltar estos controles.

## Persistencia de consentimiento in-app (22-10-2026)

Se añade `NotificationChannelPreference` con `tenantId,userId,channel='in_app'` y FK compuesta a `UserProfile`, consentimiento `granted|denied|unknown`, `enabled`, hora verificada, evidencia server-side `authenticated-self-service` y zona/ventana de silencio. SQL fuerza RLS y bloquea activar sin consentimiento; la ruta `GET/PUT /api/v1/notifications/preferences/me` usa únicamente `req.context.userId/tenantId`, valida usuario activo, franja horaria IANA, persiste la preferencia con auditoría en la misma transacción y no divulga PII ni proveedor. **Esta aceptación in-app jamás autoriza WhatsApp, SMS, email o web push**. No hay todavía dispatch, outbox de notificación, worker ni webhook y no se afirma delivery. Los envíos siguen HTTP 503 hasta integrar #853/#772.

## QA PG17 de consentimiento (opt-in)

`CG_NOTIFICATION_PREF_QA_ISOLATED=true npm run test:backend:notification-preferences:real` verifica en DB `*_v854` PostgreSQL 17 y seed/sidecar RLS la preferencia propia `in_app` concedida/revocada, quiet hours, persistencia al refrescar, auditoría, rechazo de tenant spoofing y no envío WhatsApp (503), sin token negativo. No se ejecutó en este entorno; preparar una DB exclusiva. No valida provider/webhook/worker; #854 sigue pendiente.

## Fix de validación de preferencias de horario (2026-10-22)

Se corrigió el regex de quiet-hours para aceptar `HH:mm` real (00:00–23:59) y rechazar horas inválidas. Anteriormente había una barra adicional que convertía `\\d` en un literal dentro de la expresión regular. Se añadió `tests/notification_preferences_time_validation_v854.test.mjs` al test nativo. Las reglas de zona horaria, consent, user+tenant y auditoría no se relajan; hasta ejecución de integración no se afirma QA total.
