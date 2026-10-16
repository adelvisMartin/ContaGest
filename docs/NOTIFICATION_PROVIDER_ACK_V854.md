# #854 — Veracidad del acuse Meta Cloud (incremento)

El proveedor WhatsApp Cloud responde HTTP 2xx a una petición, pero eso no demuestra entrega. El módulo `notification-provider-ack.mjs` exige un único ID de mensaje del provider, sin registrar ni reflejar el ID, teléfono, texto, contact ni respuesta cruda. Un 200 sin ID válido produce `provider_unverified`, no `provider_accepted` ni `delivered`. No se genera reenvío automático: es un resultado ambiguo que requiere reconciliación independiente. El estado `delivered` depende de evidencia posterior por webhook firmado y no existe todavía esa integración.

`notifications.routes.ts` aplica el clasificador al retorno Meta, registra el estado de forma mínima y mantiene `delivered:false`. El endpoint general `/send` sigue 503 sin outbox; no se introduce cola ni adaptador obligatorio, se excluye Hípico SOURCE.

Pruebas: `node --test tests/notification_provider_ack_v854.test.mjs`. Pendientes: PostgreSQL17, canal real consentido, webhooks verificados, integración #853/#772, tenant A/B, browser. #854 continúa OPEN; este incremento no autoriza envíos ni certifica delivery. Rollback: revert 3 files, sin migración.
