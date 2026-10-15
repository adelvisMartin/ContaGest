# ContaGest #761 — Tareas persistentes dentro de proyectos

**Estado:** incremento implementado en código; NO activado ni certificado para producción. El ticket #761 permanece **OPEN** hasta incorporar TimeEntry, aprobaciones auditadas, tarifas, facturas existentes y QA PostgreSQL/HTTP/UI.

## API y autorización

La ruta existente `/api/v1/modules/projects` conserva la bandera **desactivada por defecto**: sin `CONTAGEST_PROJECTS_V761_ENABLE=true` el servidor responde HTTP 503, incluidos los nuevos endpoints.

- `POST /api/v1/modules/projects/:projectId/tasks`: requiere sesión válida, licencia y permiso `modules.manage`; cabecera `Idempotency-Key` con UUIDv4 y JSON estricto `{"title":"Preparar informe","assigneeId":"<UUID>","description":"Opcional"}`.
- `GET /api/v1/modules/projects/:projectId/tasks?take=50&skip=0`: lectura paginada `take<=100`, `skip<=10000`; responde `items`, `hasMore`, `nextSkip` y `consistency:REQUEST_SNAPSHOT_ONLY`.

La identidad `tenantId` y `actorId` vienen del middleware autenticado, jamás del cuerpo del navegador. Sólo el **responsable activo de un proyecto activo** puede crear tareas. Dentro de una transacción Prisma `Serializable`, el backend relee el `ModuleRecord` de proyecto en la empresa actual, valida su `clientId`, valida que el cliente siga activo, comprueba los perfiles activos del responsable y del asignado dentro del mismo tenant, inserta la tarea en el namespace privado `project-task-v761` y registra `AuditLog` dentro de la misma transacción. La lectura permite el historial de tareas de proyectos archivados.

El identificador de tarea se deriva de tenant + proyecto + clave UUIDv4 de intento, evitando duplicados por reintento. Los conflictos de unicidad y serialización se traducen en HTTP 409; el cliente debe releer, no reenviar cambios ciegamente. Un error de auditoría cancela también la creación de tarea.

El namespace `project-task-v761` **no forma parte de** `module-registry.json`, por lo que el CRUD genérico de Stitch no puede editar ni borrar estas tareas. La tarea se crea en estado `todo`. Su progreso se gestiona mediante la ruta protegida descrita más abajo; todavía no existe temporizador ni registro horario. No se llama a SalesInvoice, tarifas, Ledger ni posting.

## Ejecución de regresiones y límites

```bash
node --experimental-strip-types --test tests/project_task_persistence_v761.test.mjs
```

El test Node 22 del servicio puro verifica 15 escenarios: creación y auditoría atómicas, aislamiento serializable, proyecto activo, responsable/cliente/asignado, referencias cruzadas de tenants, replay/serialización, entradas maliciosas, listado y límites. Una base de datos *simulada* no prueba claves foráneas, aislamiento real PostgreSQL17, RLS/tenant negativo, licencia/CSRF, ruta HTTP o Chromium. **Mantener desactivada la bandera** hasta completar esas pruebas en el SHA desplegado.

Esta persistencia es temporal en `ModuleRecord` con JSON privado, no equivale a un modelo tipado final de `Project`/`Task`. Antes de habilitar producción debe decidirse y probarse el modelo duradero (constraints/FK, RLS, migraciones reversibles). La próxima implementación es el registro de tiempo `TimeEntry` ligado a proyectos/tareas con revisión optimista y auditoría, sin invocar la autoridad de facturación hasta aprobar reglas monetarias y datos persistidos.

**Rollback:** revertir ruta, store, test y documentación. Nunca borrar automáticamente registros ya creados en `ModuleRecord` ni auditorías; se requiere migración/exportación explícita y autorizada.


## Cambio de estado seguro (incremento de ciclo de vida)

`PATCH /api/v1/modules/projects/:projectId/tasks/:taskId/status` exige la misma
bandera `CONTAGEST_PROJECTS_V761_ENABLE=true` (OFF por defecto), tenant
autenticado, licencia/permiso `modules.manage` y JSON estricto como:

```json
{"nextStatus":"in_progress","expectedUpdatedAt":"2026-10-15T18:00:00.000Z"}
```

La secuencia es `todo → in_progress → done`; `done` es terminal,
sin vuelta a `todo` ni saltos directos. Sólo el **responsable activo del
proyecto activo** puede cambiar el estado. Una transacción `Serializable`
relee proyecto y tarea por tenant/namespace, compara `id,tenantId,moduleSlug,
status,updatedAt,projectId` en el `updateMany` y escribe `AuditLog` en
la misma unidad atómica. Se verifica la lectura posterior. Un conflicto
de revisión/serialización devuelve 409; una tarea ajena no se publica.
El listado de tareas ya no filtra sólo `todo`: incluye también
`in_progress` y `done` para preservar la historia.

Los tests nativos `node --experimental-strip-types --test
tests/project_task_lifecycle_v761.test.mjs` cubren secuencia, estados
terminales, manager/tenant, concurrencia, auditoría y preservación del
historial. Todavía hace falta PG17 real con transacciones concurrentes,
licencia/CSRF y QA HTTP/browser antes de habilitar la bandera o cerrar #761.
