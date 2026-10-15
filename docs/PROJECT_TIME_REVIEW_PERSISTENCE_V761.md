# #761 · Revisión persistente de horas con segregación de funciones

**Incremento acotado:** estados de revisión reales en `ModuleRecord` privado, no facturación. **NO ACTIVAR EN PRODUCCIÓN** ni cerrar #761 sin la evidencia PostgreSQL 17/HTTP/seguridad/QA exact-SHA.

## API

`PATCH /api/v1/modules/projects/:projectId/tasks/:taskId/time-entries/:entryId/review`

Body JSON estricto: `{"action":"submit","expectedRevision":1}`. Acciones permitidas: `submit`, `withdraw`, `revise`, `reject`, `approve`. Las rutas de horas heredan `requireTenant`, autenticación, `modules.manage` (incluida licencia), controles CSRF del request middleware y `CONTAGEST_PROJECTS_V761_ENABLE` **OFF por defecto**.

No se aceptan `actorId`, `tenantId`, `memberId`, `canReviewTime`, `approvedBy`, `approvedAt`, `billable`, tarifa ni datos de factura del navegador. El servidor resuelve la identidad de la sesión y consulta el proyecto/tarea/cliente/perfil del tenant. **Revisor = responsable activo del proyecto, distinto del miembro de la tarea**. Ni un usuario con permiso genérico `modules.manage` puede aprobar horas sin ser el responsable real. La comparación contra ese responsable se realiza en la capa de servicio, no se basa en un booleano remitido por el cliente.

| Acción | Estado previo | Nuevo estado | Autoridad |
|---|---|---|---|
| `submit` | `draft` | `submitted` | autor/miembro |
| `withdraw` | `submitted` | `draft` | autor/miembro |
| `revise` | `rejected` | `draft` | autor/miembro |
| `reject` | `submitted` | `rejected` | responsable activo, distinto del autor |
| `approve` | `submitted` | `approved` | responsable activo, distinto del autor |

`approved` es terminal bajo esta política. La aprobación **no** transforma el tiempo en facturable: conserva `billable:false`, `linkedInvoiceId:null`, minutos e intervalos originales; guarda responsable y fecha **generados por el servidor** y conserva una entrada mínima en `AuditLog`. No asigna tarifa, dinero, moneda, impuestos ni `SalesInvoice`. Es una aprobación de revisión operativa, no aprobación fiscal o contable.

## Persistencia y concurrencia

`transitionTimeEntryReview` carga `Project`, `Task`, `Client`, `UserProfile` y `TimeEntry` en la misma transacción Prisma `Serializable`, valida tenant/relaciones, autor y revisor, y ejecuta `prepareProjectTimeReviewIntent` (política de #761 previa). El `updateMany` compara simultáneamente `id,tenantId,moduleSlug,status,updatedAt,payload.revision,payload.projectId,payload.taskId,payload.memberId` y sólo acepta exactamente una fila. Se incrementa `payload.revision`, escribe auditoría en la misma transacción y verifica relectura antes de devolver respuesta. Versiones obsoletas o serialización P2034 => HTTP 409; autorrevisión/usuario ajeno => 403; datos inválidos => 400; padre/cliente ausente => 404.

La lectura existente de horas incluye ahora `draft/submitted/rejected/approved`, conservando el historial para el miembro asignado; sigue limitada a su tenant y verificaciones de integridad. No se introducen ediciones del intervalo, timer ni un motor adicional de facturación.

## Evidencia y NO-GO

En la sandbox aislada se ejecutaron con **Node 22.16.0** `tests/project_time_review_persistence_v761.test.mjs`, `tests/project_time_entry_store_v761.test.mjs` y `tests/project_time_overlap_v761.test.mjs`: **40/40 PASS (15+13+12)** contra los archivos de código que coinciden exactamente con los blobs GitHub. Los módulos de review/persistencia/período superaron `tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext` con TypeScript global 5.8.3. El runner NodeNext requirió JS auxiliar emitido **sólo localmente** para imports `.js`; no se subieron archivos compilados.

**NOT_EXECUTED:** `npm ci` del monorepo, TypeScript 5.9.3 del lock, build/release QA, PostgreSQL 17 real con 2 tenants y carreras `updateMany`/revision JSON/SSI, sesiones HTTP/licencia/CSRF, Playwright/browser y despliegue. Las Actions en cola/omitidas no son PASS. La falta de crédito de GitHub Actions no está verificada como causa; no desactivar workflows/checks obligatorios para obtener una apariencia de aprobación.

**Pendiente #761:** pruebas PG17/HTTP exactas, control de solapamiento bajo carreras reales, snapshot persistente de tarifas/currency, política Decimal/redondeo, factura borrador idempotente usando autoridad `SalesInvoice` existente, UI y QA completo. Mantener `CONTAGEST_PROJECTS_V761_ENABLE` **OFF** hasta entonces. Rollback: revertir servicio, rutas, serializers/test/docs; preservar/exportar datos y auditoría existentes, no borrarlos automáticamente.
