# #756 · Recorrido paginado del catálogo para reportes de reposición

## Alcance

Incremento de solo lectura en `GET /api/v1/reports/inventory/reorder`: corrige la imposibilidad de recorrer productos posteriores al `take` inicial, preserva el cálculo canónico `buildInventoryStockHealth` y el modo `REVIEW_ONLY`. No introduce compras, migraciones, nuevas autoridades de stock ni cambios de saldo.

## API

Ejemplo: `GET /api/v1/reports/inventory/reorder?take=100&skip=100&onlyNeedsReorder=true`

- `take`: 1–1000, por defecto **500** (valor heredado).
- `skip`: 0–1.000.000, por defecto **0**.
- `onlyNeedsReorder`: `true`/`false`, por defecto `false`. Mantiene compatibilidad con mayúsculas anteriores; las listas, objetos, números no válidos y claves adicionales se rechazan con HTTP 400.
- La consulta de número de productos activos y la lectura de página comparten un único snapshot de PostgreSQL `RepeatableRead`; ambas se filtran con `tenantId` autenticado y `active:true` bajo `requireTenant` + `reports.view`.
- Orden determinista: `sku ASC, id ASC`, con `skip` y `take` aplicados a la colección **completa de productos activos**. Los cálculos de necesidad de reposición se aplican a la página recibida.
- Se conservan los campos `rows`, `summary`, `planning.reorderCandidates` y `meta` para consumidores anteriores, y se añade `pagination`: `skip`, `take`, `scannedProducts`, `totalActiveProducts`, `matchesInPage`, `hasMore`, `nextSkip`, `truncated`, `pageScoped`, `consistency` y `matchingScope`.
- Si `onlyNeedsReorder=true` y la página actual no tiene candidatos, `hasMore` puede seguir siendo verdadero. **Una página sin candidatos NO representa fin de búsqueda**. Continuar con `nextSkip` hasta `hasMore=false`.
- `truncated=true` indica que la respuesta no representa el catálogo completo, porque faltan páginas anteriores o posteriores. Las estadísticas y candidatos son **sólo de la página**. `meta.activeProducts` conserva el conteo total de productos activos.
- `REQUEST_SNAPSHOT_ONLY`: `count` y `findMany` son consistentes en la misma petición; páginas obtenidas en peticiones separadas no comparten snapshot. Si el catálogo cambia entre peticiones, la paginación offset puede repetir o saltar productos. Para un export consistente global se requiere snapshot/cursor estable aparte.

## Evidencia y QA

- `backend/src/modules/reports/reorder-scan-page.ts`: helper puro TypeScript 5.8.3 compilado sin error (`tsc --noEmit --target es2022 --module nodenext --moduleResolution nodenext --skipLibCheck`). SHA del blob GitHub idéntico al archivo probado localmente: `6040bddf082e8e7118ef809893402cb8bcffd05c`.
- Prueba versionada `tests/reorder_scan_page_v756.test.mjs`, blob idéntico en GitHub y local: `c13ba5f4e09138d3dd5dd28beda564acf4352475`. Se ejecutaron 12/12 casos **unitarios puros** en Node22.16 (12 PASS); el caso 13 inspecciona la ruta real y no pudo ejecutarse localmente por faltar el archivo de backend en checkout aislado, por lo que queda **NOT_EXECUTED**. Está enlazado a `backend/package.json` `test:reports`.
- Verificación de fuente del PR: ruta con tenant de servidor, permiso `reports.view`, count+findMany tenant-scoped bajo `RepeatableRead`, `skip` y `take` aplicados en Prisma, sin API de mutación. Esta inspección **no sustituye** pruebas de integración.
- Ejecuciones pendientes (NOT_EXECUTED): suite oficial completa, `npm ci`, typecheck total, Postgres17 multiempresa, comparativa de páginas con inserciones concurrentes, HTTP 400/401/403 y navegador. Sandbox sin checkout completo/dependencias y GitHub Git inaccesible por DNS. Estados queued/skipped de Actions no son PASS.

## Restante del ticket #756

La política persistente de reabastecimiento por producto/ubicación, safety stock, lead time, FEFO/lotes físicos #755, outbox, conciliación completa en DB y QA final siguen abiertos. **No marcar #756 DONE por este incremento.**

**Rollback:** revertir los cinco archivos de esta rama. La funcionalidad anterior de primera página se recupera; no hay modificación de datos, índices ni DDL.
