# #761 — Selector de tarifa efectiva para horas aprobadas

Incremento puro de dominio sin conexión nueva a API ni autorización financiera. Reutiliza las tarifas inmutables persistidas por el PR #1114, pero **no** carga directamente PostgreSQL: la capa autorizada deberá pasarle registros previamente consultados con filtros de tenant.

`selectEffectiveRateForApprovedTime({tenantId,entry,cards})` exige que la entrada esté operativamente `approved`, con revisión válida, `billable:false` y sin factura vinculada. Comprueba identificadores tenant/proyecto/cliente/trabajador en todas las tarifas, versiones positivas únicas y consecutivas, vigencias UTC estrictamente crecientes, moneda única y tarifas decimales exactas de dos posiciones. Selecciona la versión efectiva a la hora **inicial** y rechaza cualquier nueva versión que comience a mitad del período; no divide automáticamente un turno entre tarifas.

El resultado incluye rateCardId, revisión, tarifa horaria exacta y moneda, con `persisted:false`, `billableAuthorized:false` e `invoiceAuthorized:false`. **No es un snapshot grabado**, no aplica impuesto, redondeo, FX, facturación, pago ni contabilidad. Tampoco demuestra que los registros de entrada hayan sido recuperados de una fuente confiable: esa validación y la transacción de snapshot persistente aún faltan.

Prueba local focalizada: `node --experimental-strip-types --test tests/project_effective_rate_selection_v761.test.mjs` (12 casos) y `tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext backend/src/modules/projects/project-effective-rate-selection.ts`. Repetir contra el SHA final y completar PostgreSQL17/HTTP/RBAC/browser antes de activar el módulo. No se tocaron `SalesInvoice`, ledger, esquemas ni Actions.

**Estado de entrega:** parcial de #761, no cerrar el issue. `CONTAGEST_PROJECTS_V761_ENABLE` permanece desactivada por defecto. Rollback: revertir estos tres archivos, sin migraciones ni datos que borrar.
