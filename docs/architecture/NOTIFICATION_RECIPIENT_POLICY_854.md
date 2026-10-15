# ContaGest #854 — decisión de consentimiento y destinatario (incremento 3)

**Repositorio:** `adelvisMartin/ContaGest` · **Fecha:** 2026-10-15 · **Owner exclusivo:** `ChatGPT-ContaGest-Notification-Truth-20261015-w6` · **Issue:** [#854](https://github.com/adelvisMartin/ContaGest/issues/854).  
**Base de trabajo:** `main@80658cbfa64707c00de4aff7df215fc7c84c70d8`.

## 1. Frontera de autoridad y alcance

`backend/src/modules/notifications/notification-recipient-policy.ts` implementa una decisión **pura, sin efectos laterales**, sobre evidencia de destinatario y preferencias obtenida de fuentes **del servidor**. No consulta la base de datos, no envía, no crea trabajos ni mensajes. El objeto `ServerVerifiedNotificationPolicy` NO se construye a partir de `req.body`: el controlador/servicio de dominio que lo use en el futuro deberá derivarlo de una sesión autenticada, tenant verificado y preferencias almacenadas con provenance/auditoría.

**No existe todavía persistencia operativa de consentimiento en #854.** Por tanto, esta función es una pieza de contrato para el futuro servicio, no evidencia de que ya se estén respetando preferencias de destinatarios en envíos reales. Tampoco confiere permisos de WhatsApp: el grupo SOURCE de Control Hípico sigue `NO_GO`.

## 2. Decisiones deterministas y fallos cerrados

| Condición / evidencia | Decisión | Razón |
|---|---|---|
| Falta evidencia del servidor | `SUPPRESS` | `MISSING_SERVER_EVIDENCE` |
| Tenant solicitante diferente de destinatario | `SUPPRESS` | `RECIPIENT_TENANT_MISMATCH` |
| Destinatario inactivo o canal no permitido | `SUPPRESS` | `RECIPIENT_INACTIVE` / `UNKNOWN_CHANNEL` |
| Canal desactivado | `SUPPRESS` | `CHANNEL_DISABLED` |
| Consentimiento negado, desconocido o no verificado en servidor | `SUPPRESS` | `CONSENT_NOT_VERIFIED` |
| Preferencia `opt-out` | `SUPPRESS` | `RECIPIENT_OPTED_OUT` |
| Canal externo email/push/WhatsApp | `SUPPRESS` | `PROVIDER_POLICY_NOT_VERIFIED` hasta revisión de #772 |
| `quietHours` inválidas | `SUPPRESS` | `INVALID_QUIET_HOURS` |
| Instante dentro de horario de silencio | `DEFER` | `QUIET_HOURS` (no calcula `runAt`) |
| Consentimiento positivo de servidor, tenant correcto, `in_app`, horario permitido | `ELIGIBLE_FOR_INTENT` | `POLICY_CHECKED_NO_DISPATCH` |

**En todas las respuestas** `deliveryAuthorized:false` y `queued:false`. `ELIGIBLE_FOR_INTENT` no es `SENT`, `QUEUED` ni prueba de que existe `NotificationLog`; aún requiere outbox #853, idempotencia, adaptación de proveedor #772, privacidad y autorización de operación. Incluso la clasificación `transactional` **no bypass** consentimiento/opt-out, a diferencia de una futura excepción `mandatory` que tendría que estar explícitamente documentada, legalmente autorizada y probada. No se implementaron excepciones.

## 3. Catálogo descubrible sin exposición de datos

Se añadió `GET /api/v1/notifications/templates`, tras `requireTenant` y con `requirePermission('sales.manage')`. Devuelve sólo la lista estática de plantillas `key`, versión, clasificación, nombres de slots y locales disponibles, con `queueReady:false`. Los descriptores son inmutables (`Object.freeze` superficial y de sus arrays) y no contienen contacto, mensaje renderizado, cuerpo, token o configuración de proveedor. No hay escritura de BD ni side effects.

La vista previa existente `POST /api/v1/notifications/templates/preview` permanece independiente y `PREVIEW_ONLY`. No se añadió endpoint para subir consentimiento desde el navegador o aprobar envíos, porque la persistencia/roles requeridos no están implementados.

## 4. Verificaciones y limitaciones

**Ejecución focalizada real en Node 22.16.0** de `tests/notification_recipient_policy_v854.test.mjs`: **8 PASS / 0 FAIL**; seis tests de lógica y dos tests de catálogo/ruta. La copia local fue compilada con `tsc` y se ejecutó con `node --experimental-strip-types --test`; para el repositorio el runner integrado utiliza `tsx --test ../tests/notification_recipient_policy_v854.test.mjs` porque resuelve imports TypeScript→JS de forma consistente. Se comprobó `tsc --noEmit --strict --skipLibCheck --target es2022 --module nodenext --moduleResolution nodenext` del módulo. Se compararon los hashes Git de los archivos fuente/test usados con los blobs exactos de la rama.

**Tests de CI:** `backend/package.json` ejecuta la suite #854 dentro de `npm --workspace backend test`. La suite browser opt-in `qa/notification-dispatch-v854.e2e.mjs`, configuración `playwright.notifications-v854.config.mjs`, incorpora consulta del catálogo con y sin credenciales y verifica que la cola siga inactiva.

**No ejecutado / bloqueado por entorno:** `npm ci` de todo el repositorio, typecheck completo, build, E2E HTTP en PostgreSQL 17 efímero, UI/UX 360–1440, RBAC real y pruebas de proveedor. El clonado GitHub por DNS está bloqueado en este contenedor. Los checks remotos en cola no son PASS.

## 5. Próximas dependencias / criterio de cierre

1. #854: entidad o mecanismo canónico de preferencias + consentimiento verificable por tenant/usuario/canal; el servicio resuelve los datos exclusivamente desde backend y no copia la afirmación de `req.body`.
2. #853: persistencia **atómica** de intent con transacción de negocio, scheduling `runAt`, retry/lease/DLQ e idempotencia. `DEFER` no programa nada hoy.
3. #772: consentimiento, opt-out, firma de webhooks, canal habilitado y receipts de proveedores, con política legal y privacidad por canal; nunca habilitar mensajes a SOURCE de Hípico mediante esta infraestructura.
4. Una vez conectados los contratos reales: negativa tenant A→B, preferencias cambiadas concurrentemente, reintentos, quiet hours, idempotency ledger, PG17 y pruebas HTTP/browser sobre backend y UI funcional.
5. QA manual del propietario puede ejecutarse al final, pero los gates de seguridad/monetarios/materiales no se declaran PASS sin ejecución.

**Veredicto de este incremento:** implementación de política/metadata con tests unitarios; **el issue padre #854 permanece OPEN** hasta cumplir su alcance total. Rollback: revertir sólo módulo, endpoint GET, pruebas, comando y documento; no requiere migraciones ni cambia registros persistidos.
