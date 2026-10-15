# #761 · Intentos de revisión de tiempo por proyecto (v1)

**Estado de este incremento:** política de dominio pura con regresiones ejecutables; no es un workflow desplegado, transacción de BD, aprobación persistida ni autoridad de facturación. `SOURCE_REUSE=NONE`.

## Objetivo

Antes de incorporar el modelo `Project/Task/TimeEntry`, establecer un contrato seguro de propuestas de cambios de estado, separando autor y revisor y evitando que reintentos, referencias de otro tenant o entradas ya vinculadas a factura modifiquen el estado.

El módulo `backend/src/modules/projects/time-entry-review-intent.ts` acepta una fila **obtenida por el servidor**, un principal **autenticado y autorizado por RBAC** y la versión de revisión esperada. Las transiciones propuestas son:

| Acción | Origen | Destino | Actor requerido |
|---|---|---|---|
| `submit` | `draft` | `submitted` | miembro del registro |
| `withdraw` | `submitted` | `draft` | miembro del registro |
| `revise` | `rejected` | `draft` | miembro del registro |
| `approve` | `submitted` | `approved` | revisor distinto del miembro, con grant backend |
| `reject` | `submitted` | `rejected` | revisor distinto del miembro, con grant backend |

Un registro `approved` es terminal para estas operaciones; los registros con `linkedInvoiceId` no permiten ninguna transición. La separación entre autor y revisor se adopta como valor conservador para este contrato v1; un cambio de política requiere ADR y tests antes de habilitarlo.

El resultado es **únicamente un intento inmutable** (`persisted:false`, `invoiceAuthorized:false`, `billableAuthorized:false`) con `expectedRevision` y `proposedRevision`. **No demuestra** que la transición haya ocurrido, ni autoriza un cargo. El backend debe hacer `UPDATE ... WHERE tenant_id = ? AND id = ? AND revision = ?` dentro de una transacción; aceptar exactamente una fila, persistir actor y auditoría, verificar `linked_invoice_id IS NULL` en el mismo punto de serialización y rechazar conflictos sin `last write wins`. La capa de API nunca debe aceptar `canReviewTime`, `tenantId` o `entry` del JSON cliente como hechos autenticados. Debe resolver actor/tenant en el middleware existente y cargar los registros en la misma transacción.

## Validación y límites

```sh
node --experimental-strip-types --test tests/project_time_review_intent_v761.test.mjs
node --experimental-strip-types --test tests/project_time_period_v761.test.mjs
tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext backend/src/modules/projects/time-entry-review-intent.ts
```

Las regresiones incluyen revisión legítima, devolución para corrección, separación autor/revisor, ACL simulada denegada, prohibición de autoaprobación, coherencia de tenant, optimistic locking por revisión, estados desconocidos, vinculación a factura y resultados sin autoridad monetaria. Un test puro **no sustituye** integración con RBAC real, transacciones PostgreSQL17, índice/CAS, auditoría, escenarios de concurrencia ni browser/API E2E.

## Siguiente fase de #761

Persistir Project/Task/TimeEntry con tenant+client+member y versionado, integrar este contrato detrás de un servicio seguro, guardar `approvedAt/approvedBy` con auditoría y aplicar exact-decimal `rate snapshot` y moneda al aprobar. Sólo después, generar borradores de `SalesInvoice` de forma idempotente reutilizando la autoridad contable existente; no crear un billing engine adicional. Las correcciones tras facturación siguen la política canónica de reversos/nota de crédito, no reabrir registros facturados.

**Rollback:** revertir este helper, test y documento. No hay DDL, dependencias, datos persistidos ni rutas nuevas. El ticket #761 permanece abierto hasta cumplir su DoD completo.
