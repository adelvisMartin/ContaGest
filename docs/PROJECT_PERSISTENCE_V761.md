# ContaGest #761 — Primer incremento persistente de Proyectos

**Alcance:** crear y listar proyectos de una empresa usando almacenamiento PostgreSQL existente (`ModuleRecord`) con auditoría transaccional (`AuditLog`), sin modificar el schema ni introducir un motor alternativo de facturación.

## Activación controlada (fail-closed)

La ruta está **DESACTIVADA por defecto**; devuelve HTTP 503 aunque el servidor esté funcionando. Sólo una configuración explícita `CONTAGEST_PROJECTS_V761_ENABLE=true` habilita la API. Mantener la variable ausente o `false` en producción hasta completar una ejecución exact-SHA de PostgreSQL 17 con tenant A/B, sesión/licencia/RBAC, reintentos, rollback, contrato HTTP y revisión de seguridad. La bandera se evalúa en cada petición; no crea una dependencia externa ni altera el arranque general. No debe activarse sólo por tener el PR mergeado.

## API (requiere sesión, licencia y permiso `modules.manage`)

- `POST /api/v1/modules/projects` con `Idempotency-Key: <UUIDv4>` y JSON **estricto** `{ "name":"...", "clientId":"<UUID>", "description":"..." }`.
- `GET /api/v1/modules/projects?take=50&skip=0` (máximo 100 y offset máximo 10000) devuelve `items` + `pagination.hasMore/nextSkip`.

El tenant y el responsable **siempre** vienen de `requestContext` autenticado. No se aceptan tenantId, managerId, status, invoiceId ni montos en el cuerpo. La transacción verifica que el `Client` exista y siga activo en ese mismo tenant, verifica `UserProfile` activo del actor, inserta el proyecto en `ModuleRecord` con status `planning` y guarda `AuditLog` mínimo; si falla el audit, no se confirma el proyecto. Una misma clave UUIDv4 dentro del tenant produce un identificador determinista; la segunda inserción devuelve conflicto 409, no duplica proyectos. El registro se guarda bajo el namespace privado `project-workspace-v761` que NO pertenece al registro Stitch utilizado por el CRUD genérico.

`ModuleRecord` es **persistencia provisional y explícita** para el objeto Project. Antes de activar Task/TimeEntry, se debe validar el modelo final y sus constraints en PostgreSQL 17: migrar a un modelo tipado seguro o documentar la evolución transaccional con índices/RLS/constraints por tenant, relaciones y reversibilidad. La API actual **no permite** cambiar estados, asignar tareas ni registrar horas, aprobar facturación o alterar el ledger. El backend conserva la autoridad sobre los permisos; `modules.manage` no implica permisos de facturación.

## Límites y pruebas

`node --experimental-strip-types --test tests/project_record_persistence_v761.test.mjs` prueba con DB simulada las reglas de escritura, consistencia, rollback si el audit falla, intento repetido, tenant extranjero, ausencia de actor/cliente, paginación y aislamiento del CRUD genérico. No sustituye PostgreSQL real, licencia/RBAC con sesión, API HTTP, Playwright ni un ejercicio de recuperación; esos gates permanecen **NOT_EXECUTED** hasta ejecutarse en infraestructura apta.

Próximos incrementos de #761: crear Task y TimeEntry con FK compuestas, estados CAS, aprobaciones auditadas, snapshot de RateCard con Decimal exacto, y generación idempotente de **borradores** de SalesInvoice existente; jamás habilitar posting automático o aprobar un monto sin reglas explícitas de redondeo y retención.

**Rollback:** revertir el código y la ruta; los Project creados no se eliminan automáticamente para evitar pérdida silenciosa. El operador debe planificar export/migración de cualquier dato almacenado antes de retirar permanentemente el namespace. **No cerrar #761 con este incremento parcial.**


## Ciclo de vida del Proyecto con CAS (#761, incremento posterior)

Se añade `PATCH /api/v1/modules/projects/:id/status`, detrás de **la misma
bandera desactivada por defecto** `CONTAGEST_PROJECTS_V761_ENABLE`, de
`requireTenant`, `modules.manage` y una identidad de usuario verificable.
El cuerpo JSON estricto contiene solamente:

```json
{"nextStatus":"active","expectedUpdatedAt":"2026-10-15T17:40:00.000Z"}
```

El responsable que creó el proyecto debe conservar `UserProfile.active` en
el **mismo tenant**. La transición permitida es `planning → active`,
y luego `active → archived`. Archivado es terminal: no hay reapertura,
borrado físico, facturación ni modificación de entradas existentes mediante
esta ruta. Si hay dos cambios concurrentes, el `updateMany` compara
simultáneamente `id, tenantId, moduleSlug, status, updatedAt` en PostgreSQL.
Una actualización afectando cero filas devuelve HTTP 409 (relectura
obligatoria). El `AuditLog` mínimo se escribe en la **misma transacción**:
si no puede escribirse, se revierte el estado. El servicio relee el registro
tras escribir y verifica estado, tenant y namespace antes de devolver éxito.

Error 400: identificador/versión malformados; 403: usuario distinto del
responsable o inactivo; 404: proyecto ausente; 409: revisión obsoleta o
transición prohibida; 503: funcionalidad no habilitada. Nunca se acepta el
tenant o un supuesto `managerId` del cuerpo de la petición.

`node --experimental-strip-types --test
tests/project_status_transition_v761.test.mjs` añade regresiones
deterministas con DB simulada: CAS ganador/perdedor, audit fallido,
falsificación de identidad, referencias de otra empresa, transición terminal,
revisión inválida y prohibición de efectos monetarios. Los tests mock no
acreditan PostgreSQL17/tenant RLS y no autorizan la activación del módulo.
La aplicación permanece en **NO-GO** para activar la bandera hasta completar
PG17, autenticación/RBAC, QA HTTP/browser y recuperación exact-SHA.
