# ContaGest #761 — Persistencia de borradores manuales de tiempo

**Estado:** incremento acotado integrado en el módulo de Proyectos. **NO APTO PARA HABILITACIÓN EN PRODUCCIÓN** hasta completar pruebas reales PostgreSQL 17 con tenants A/B, autenticación/licencia/CSRF, HTTP y browser. No cierra el ticket #761. `SOURCE_REUSE=NONE`.

## Autoridad y rutas

Bajo la ruta existente `/api/v1/modules/projects`, ambas operaciones **heredan la bandera** `CONTAGEST_PROJECTS_V761_ENABLE`, que está apagada por defecto (HTTP 503). No cambiar esta configuración por el mero hecho de fusionar el PR.

- `POST /api/v1/modules/projects/:projectId/tasks/:taskId/time-entries`, `Idempotency-Key: UUIDv4`, body estricto: `{"source":"manual","startedAt":"2026-11-01T01:30:00-04:00","endedAt":"2026-11-01T01:30:00-05:00","recordedMinutes":60}`.
- `GET /api/v1/modules/projects/:projectId/tasks/:taskId/time-entries?take=50&skip=0`: listado privado de borradores por usuario de tarea, con paginación 1–100, offset 0–10000.
- Ambas requieren `requireTenant`, sesión autenticada, permiso `modules.manage` y licencia de ese permiso. Tenant, miembro, proyecto y tarea **no se aceptan del body**; se resuelven desde contexto seguro y datos del servidor. Sólo el asignado a la tarea puede crear o consultar sus propias horas.

`time-entry-record-store.ts` usa `normalizeProjectTimePeriod` de #761 para calcular duración real en UTC, incluso cruces de horario de verano. No confía en minutos declarados que no coincidan. La creación exige `Project.active`, `Task.in_progress`, relación correcta proyecto–tarea–cliente, `Client.active` y `UserProfile.active` del actor dentro del mismo tenant. Todo ocurre en una transacción Prisma con aislamiento `Serializable`. Se crea `ModuleRecord` con namespace privado `project-time-entry-v761` y `AuditLog` dentro de la misma transacción; un error de auditoría provoca rollback. Identificador derivado de empresa + proyecto + tarea + UUIDv4 de intento: duplicados y conflictos de serialización regresan 409, nunca un segundo efecto bajo la misma clave.

## Restricciones contables y de seguridad

El estado persistido es **siempre `draft` y `billable:false`**, revisión 1, `linkedInvoiceId:null`, sin revisor ni fecha de aprobación. El resultado no tiene importe, tarifa, número de factura ni asiento contable. No existe todavía aprobación persistente, edición/corrección auditada, timer real, verificación de sesiones de temporizador, control de solapamiento de períodos diferentes ni autorización para facturar. Un segundo intento con **otra** clave de idempotencia puede producir horas solapadas; no generar facturas a partir de estos borradores hasta implementar controles de superposición/doble facturación, aprobación CAS y política fiscal explícita. `source:timer` se rechaza porque un cliente no puede probar haber ejecutado un temporizador confiable.

El namespace no pertenece al registro Stitch del CRUD genérico y no se permite modificarlo por esa vía. El listado valida la empresa, el cliente, el proyecto, la tarea, el miembro y la coherencia de timestamps/duración incluso frente a filas corruptas o mal escopadas.

## Reproducir evidencia local

```bash
# Con las dependencias del backend y tsx disponibles:
cd backend
npx tsx --test ../tests/project_time_entry_store_v761.test.mjs
```

En un entorno Node 22 sin checkout/dependencias se compilaron `time-entry-period.ts` y `time-entry-record-store.ts` a JS adyacente mediante `tsc --strict --module NodeNext` y se ejecutó el archivo **real** de tests con `node --experimental-strip-types --test`: 13 casos positivos/negativos. Los JS emitidos son sólo auxiliares locales de prueba y **no** se agregaron al PR. Ese resultado no equivale al `npm run typecheck` completo ni a la verificación de PostgreSQL, Playwright, ACL/RLS o HTTP reales.

Próximos incrementos: persistencia aprobada de `TimeEntry` con revisión optimista y segregación de funciones, análisis de intervalos superpuestos, `RateCard` con snapshot decimal y moneda, política de prorrateo/redondeo, generación **idempotente** de borradores de `SalesInvoice` y UI/QA de flujos completos. No habilitar `CONTAGEST_PROJECTS_V761_ENABLE=true` sin PG17 + seguridad/HTTP/QA exact-SHA.

Rollback: revertir nuevos módulos, endpoints y documentación. No borrar automáticamente `ModuleRecord` o `AuditLog` si hubo escrituras previas: exportar/migrar explícitamente antes de retirar el namespace.
