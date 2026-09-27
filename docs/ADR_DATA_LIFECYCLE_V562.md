# ADR · #562 Data lifecycle authority

## Estado

Accepted para la implementación técnica de #562. Este ADR no sustituye la revisión legal externa de #29 ni fija plazos regulatorios venezolanos como hechos jurídicos.

## Decisión

PostgreSQL sigue siendo la autoridad del lifecycle de datos. El endpoint `/api/v1/data-lifecycle/*` sólo opera dentro del tenant autenticado y no acepta `tenantId` del cliente como autoridad.

La matriz `RETENTION_MATRIX` clasifica cada entidad como `immutable`, `soft-delete`, `archival` o `purgeable`. Las entidades financieras/auditables —ledger, audit log, documentos fiscales y evidencia de cierre— nunca entran en un purge genérico. Las políticas tenant pueden versionar retención únicamente para entidades cuya semántica base admite lifecycle; no pueden degradar `immutable` a `purgeable`.

## Política versionada

Las versiones y legal holds se persisten en `ModuleRecord`, una tabla PostgreSQL tenant-scoped ya canónica en el esquema Prisma. Esto evita introducir una segunda fuente de esquema o una migración redundante. La asignación de versión se serializa con advisory lock por `tenant + entityType`.

La versión 0 significa baseline técnico incorporado. Una versión tenant posterior conserva `source`, `documentation`, actor y días de retención. Los días builtin son defaults operacionales y no una afirmación de cumplimiento legal.

## Purge

El purge requiere `platform.manage`, `Idempotency-Key`, política efectiva y ausencia de legal hold. Sólo una allowlist cerrada puede ejecutar `deleteMany`, y todos los predicados incluyen `tenantId`. No existe SQL dinámico por nombre de tabla. `archival` sigue siendo semánticamente distinto de `purgeable`: una política tenant no convierte archivado en borrado físico.

`execute=false` produce un preview. `execute=true` elimina únicamente filas más antiguas que el cutoff server-side. El resultado persistido conserva conteos, cutoff, versión de política y actor, pero no copia el payload de las filas eliminadas. Así existe evidence sin retener datos que la política ordenó eliminar.

Los retries usan la autoridad de `IdempotencyRecord`; la misma key + request reconstruye el mismo job y no repite el efecto. Reutilizar una key con otro request sigue siendo conflicto.

## Legal hold

Un legal hold activo para una entidad bloquea la purga completa de ese tipo. Se prefiere fail-safe frente a intentar excluir silenciosamente registros individuales de un bulk purge. La liberación del hold es explícita, auditada y tenant-scoped.

## Storage y huérfanos

`reconcileStorageOrphans` opera contra un adapter con prefijo canónico `${tenantId}/`. Si el adapter devuelve una ruta fuera del prefijo solicitado, el proceso falla cerrado. El sandbox de QA demuestra detección/remediación de objetos huérfanos sin tocar objetos de otro tenant.

La escritura/firma de media sigue siendo responsabilidad del módulo `media`; lifecycle sólo gobierna detección/remediación. La integración con un proveedor real de storage debe usar el mismo adapter/prefijo y nunca inferir ownership por URL firmada.

## Tenant deletion/export

#562 no introduce un `DELETE Tenant` genérico. La presencia de datos `immutable` significa que un workflow de terminación debe primero exportar/retener según política y obtener autorización explícita. El purge por entidad no equivale a borrado legal completo de una empresa.

## Forward-only y rollback

No se modifica ni elimina ninguna migración aplicada. La implementación reutiliza tablas existentes (`ModuleRecord`, `IdempotencyRecord`) y es forward-only a nivel de comportamiento. El rollback de aplicación consiste en retirar las rutas/módulo; los registros lifecycle son metadata auditable tenant-scoped y no requieren DDL destructivo.

## Seguridad

- tenant viene de contexto autenticado;
- `platform.manage` es gate server-side;
- no `$queryRawUnsafe/$executeRawUnsafe`;
- ninguna ruta permite indicar tabla/SQL arbitrario;
- ledger/audit/fiscal evidence no tiene rama de delete;
- storage rechaza resultados cross-tenant;
- la evidencia de purge no conserva el contenido eliminado.

## Verificación

El gate dedicado ejecuta contrato estático y PostgreSQL 17 efímero. La regresión cubre immutable rejection, legal hold, preview, purge, retry idempotente, A→B isolation y storage sandbox; la evidencia se liga al `GITHUB_SHA` exacto. Un job no ejecutado nunca se registra como PASS.
