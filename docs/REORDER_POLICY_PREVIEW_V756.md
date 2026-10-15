# #756 · Simulación de política de reposición (solo lectura)

## Funcionalidad

`GET /api/v1/reports/inventory/reorder/preview?productId=<UUID>&reorderPointExact=5.000&targetStockExact=20.000&safetyStockExact=2.000&orderMultipleExact=6.000&leadTimeDays=7`

Nueva consulta de **escenario hipotético** por producto. No almacena políticas, no modifica saldos, no solicita compras y no reemplaza la autoridad física por lote/almacén de #755. No altera `GET /inventory/reorder` ni sus consumidores.

El router existente exige sesión/tenant válidos y `reports.view`. El producto activo se lee del servidor filtrando `id + tenantId`, sin aceptar un `tenantId` del cliente. Se usan sus cantidades canónicas `Product.stock`, `Product.reserved`, `Product.minStock`, leídas juntas en una consulta.

## Validación y matemáticas exactas

- `reorderPointExact` y `targetStockExact` son obligatorios. `safetyStockExact` es opcional, valor predeterminado `0.000`. `orderMultipleExact` opcional, predeterminado `1.000`. `leadTimeDays` opcional, predeterminado `0`, máximo `365`.
- Las cantidades deben ajustarse a `Decimal(18,3)` no negativo, formato decimal simple, sin notación exponencial ni miles; máximo 15 dígitos enteros.
- Se exige `0 <= safetyStock <= reorderPoint < targetStock` y `orderMultiple > 0`. Si reservas exceden stock, se rechaza en estado `409` sin simular disponibilidad negativa.
- `available = stock - reserved`. Se activa revisión cuando `available <= reorderPoint`. La propuesta informativa es `ceil((targetStock-available)/orderMultiple) * orderMultiple`; si no se alcanza el punto de pedido, es `0`. Se usan `BigInt` en milésimas, con límite de precisión tras redondeo.
- Cantidades inviables, parámetros mal formados, prioridades inconsistentes y múltiplos cero se rechazan con HTTP 400 (forma de consulta) o 422 (reglas); producto fuera del tenant/inexistente responde 404. No se devuelven filas de otros tenants.
- La salida comunica `mode=WHAT_IF_READ_ONLY`, `policyPersistence=NOT_STORED`, `scope=PRODUCT_TOTAL_NO_LOCATION_OR_LOT`, `requiresManualApproval=true`, `autoPurchaseEnabled=false`, `demandForecastAvailable=false`.
- `leadTimeDays` se muestra como un supuesto informativo, **no afecta la cantidad estimada** sin un modelo validado de demanda. El parámetro `safetyStock` es un límite de consistencia ya contenido en el punto de pedido, no se suma por segunda vez. El mínimo canónico `Product.minStock` se expone sólo para comparación: el usuario no lo actualiza con esta consulta.

## Evidencia ejecutada y pendientes

- TypeScript 5.8.3: `tsc --noEmit --target es2022 --module nodenext --moduleResolution nodenext --skipLibCheck backend/src/modules/reports/reorder-policy-preview.ts` PASS.
- Node.js v22.16.0: 13/13 tests TAP PASS ejecutados localmente en `tests/reorder_policy_preview_v756.test.mjs`, incluyendo reservas, redondeo a múltiplos, umbrales, precisión de BigInt, overflow y parámetros adversariales.
- Hash Git de archivo probado localmente = blob GitHub del módulo `762c5c23d4d1ab10bbda2d5113f8e67c93e02cb9`; pruebas = `c1435f9d254d520e59cc74016f8b62a5aa7891d3`.
- La suite de 13 pruebas está integrada a `backend/package.json` `test:reports`. El contrato de ruta se inspecciona contra GitHub; no se debe presentar como una prueba HTTP/DB ejecutada.
- `npm ci`, compilación completa, PostgreSQL17 multiempresa/RBAC, HTTP 400/403/404, concurrencia E2E, navegador y CI exact-SHA: **NOT_EXECUTED** por falta de checkout completo y dependencias del backend en el sandbox. Workflows GitHub en cola u omitidos no equivalen a PASS.

## Backlog y reversión

Quedan pendientes del issue #756 políticas persistentes por producto/ubicación, configuración autorizada y auditada, lead time integrado a demanda validada, FEFO/lotes reales #755, outbox de alertas, QA de integración y pruebas de PostgreSQL17. **El issue no se cierra por este incremento**.

Rollback: revertir el PR (módulo, ruta de sólo lectura, test, entrada de `test:reports` y documentación). No hay migraciones ni datos que restaurar. SOURCE_REUSE=NONE.
