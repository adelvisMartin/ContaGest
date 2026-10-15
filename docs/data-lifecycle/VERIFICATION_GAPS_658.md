# Ticket #658 · Verificación de políticas de ciclo de vida de datos

## Alcance del incremento

La autoridad existente es **#562** y no se reemplaza: matriz
`entity-retention-matrix.v1.json`, servicio
`backend/src/modules/data-lifecycle/data-lifecycle.service.ts`,
migración PostgreSQL y gate `data-lifecycle-v562.yml`.

Este incremento añade una regresión al test canónico de #562 para que la
matriz y las dos allowlists del runtime (**protected entities** y **purge
adapters**) no diverjan silenciosamente. No modifica tiempos de retención,
proveedores de almacenamiento, borrados ni permisos.

## Invariantes comprobables desde el código

| Categoría | Owner runtime | Retención o borrado permitido |
|---|---|---|
| Auditoría, contabilidad, fiscal, evidencia de cierre | `PROTECTED_ENTITIES` | Nunca purga genérica; no inferir duración legal |
| Media clínica y paciente clínico | `PROTECTED_ENTITIES` | No purga genérica; flujo clínico separado #567 |
| Analytics, import, notificaciones, geocoding | `PURGE_ADAPTER_ENTITIES` | Solo policy versionada con `retentionDays` explícito y tenant autorizado |
| Media estándar | Storage lifecycle guard | Borrado mediante política, antigüedad y legal hold; sin adapter genérico |

El test falla si se elimina del catálogo una entidad protegida o purgeable,
si se duplica una clave, si la duración declarada es inválida, si un tipo
protegido se hace purgeable, si un adapter contradice la matriz o si
`MediaObject` se incorpora erróneamente a la allowlist SQL genérica.

## Validación material que sigue pendiente

La prueba estática no demuestra comportamiento de una transacción. El gate
existente `.github/workflows/data-lifecycle-v562.yml` ejecuta PostgreSQL 17
efímero y el test `qa/data-lifecycle-v562.integration.test.ts`; su ejecución
**en el SHA exacto del candidato** es la evidencia requerida. Ejecutar además
negativos con fixtures A/B y legal holds activos, caducidad/cutoff de fecha,
borrado de datos financieros prohibido, crash/retry y concurrencia de workers,
inventario de objetos huérfanos, exportaciones y restauración.

### Riesgos para investigar (no afirmar como explotación probada)

- `executePurgeBatch` adquiere el lock de `resumeLifecycleJob` dentro de una
  transacción que finaliza antes del borrado y la persistencia de evidencia.
  Caracterizar con pruebas simultáneas y fallos inducidos antes de modificar
  transacciones, leases o locks.
- El DELETE, la fila de evidencia y el estado del job se realizan en
  operaciones independientes. Verificar recuperación ante interrupciones
  después de DELETE y antes de escribir evidencia para impedir pérdida de
  trazabilidad por una falla parcial.
- El API tenant-export actual devuelve un **manifiesto de conteos**, no una
  exportación de payload; no presentarlo como portabilidad completa.

Estas brechas pertenecen a #658 para caracterización y hardening posterior;
no se añaden caminos destructivos ni mock productivos en este incremento.

## Evidencia y criterios de cierre

- `node --test tests/data_lifecycle_v562_contract.test.mjs`: contrato estático.
- Gate exact-SHA `data-lifecycle-v562.yml`: PostgreSQL, storage sandbox,
  typecheck y backend build; consultar conclusión y logs de ese SHA.
- Verificación de las brechas de concurrencia/crash e integridad de evidencia:
  **NOT VERIFIED** hasta haber ejecutado negativos concretos.
- QA manual del propietario: fase final; no sustituye gates anteriores.

**Estado del issue: OPEN / PARTIAL.** No cambiar a DONE antes de satisfacer
los criterios y comprobar que las operaciones destructivas son seguras.
