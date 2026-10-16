# #854 — Timeline de notificaciones sin PII ni confirmación falsa

`NotificationLog` ya existe y su contenido puede almacenar recipient/message/payload/errores. La nueva ruta `GET /notifications/delivery-evidence?take=50&skip=0` está bajo `requireTenant` y `sales.manage`, hace SELECT con `tenantId` en DB, usa paginación acotada y **proyecta sólo** id, canal, estado interno y fecha. No lee ni devuelve destino, asunto, cuerpo, JSON arbitrario, error ni providerId.

Todo estado se informa como `receiptVerified=false`/`deliveryEvidence=NOT_VERIFIED`. En particular, `provider_accepted` y el legacy `delivered` no prueban entrega a destinatario sin receipt autenticado de #772. El helper fail-closed rechaza estados desconocidos y contaminación de tenant, sin permitir mutaciones, retries o envío.

No se introduce segundo log/worker, ni se toca #853 outbox, proveedor #772, consentimiento #854 existente o SOURCE de Hípico. Un historial completo necesita autenticación de provider receipts, identidad/consent persistido y reconciliación. **PARTIAL/NO_MERGE** hasta PostgreSQL 17 tenant A/B, API RBAC E2E, UI Cg*, tipado/build del monorepo y contrato real de delivery.
