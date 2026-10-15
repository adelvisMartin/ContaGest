# #756 · Excepciones de integridad de stock en reposición (fail-closed)

## Objetivo

La ruta `GET /api/v1/reports/inventory/reorder` antes podía proponer una cantidad de reposición cuando `Product.reserved > Product.stock`, mostrando disponibilidad negativa dentro del candidato. Esta condición exige **conciliación del inventario**, no una sugerencia normal de compra. El incremento separa esas situaciones sin ocultar productos ni modificar saldos.

## Comportamiento

- Se agrega `planning.stockExceptions` a la respuesta de reporte y `planning.stockExceptionCount`, con alcance `planning.exceptionsScope='SCANNED_CATALOG_PAGE_ONLY'`. No se añade una tabla ni una autoridad paralela al inventario.
- `NEGATIVE_STOCK`: existencias canónicas negativas. `NEGATIVE_RESERVED`: reservas negativas. `RESERVED_EXCEEDS_STOCK`: reserva superior al stock. `NEGATIVE_MINIMUM`: mínimo canónico negativo. Cada excepción incluye `productId`, `sku` y tres cantidades exactas; declara `manualReconciliationRequired=true`, `autoPurchaseEnabled=false`.
- Se valida para **cada producto examinado**, incluso si `needsReorder=false`, la identidad, formato decimal `Decimal(18,3)` y la igualdad exacta `available = stock - reserved` mediante `BigInt`. Un desfase matemático retorna 409 `REORDER_STOCK_PROJECTION_CONFLICT` en la ruta, sin inventar disponibilidad.
- Los productos coherentes siguen produciendo `planning.reorderCandidates` en el orden y formato original. Los inconsistentes se **excluyen** de esa lista y de la búsqueda opcional de ventas facturadas como candidatos, pero **permanecen** en `rows` y `summary` originales para que el operador vea el problema. Por ello `summary.needsReorder` puede superar `planning.reorderCandidates.length`: el primero cuenta señales del catálogo y el segundo sólo recomendaciones revisables para stocks reconciliables.
- La comparación con facturas/leadTime sigue siendo opt-in y no requiere SQL adicional en modo normal; los candidates enviados a ella excluyen previamente excepciones. `Product` e invoices siguen tenant-scoped, con `requireTenant`, `reports.view` y `RepeatableRead`.
- No se corrigen existencias, reservas, asientos, libros, lotes, FEFO, órdenes, políticas ni alertas automáticamente. El resultado es **diagnóstico de conciliación manual**, sin transacciones de escritura, migraciones ni cambios de permisos.

## Evidencia y límites

- Módulo puro `backend/src/modules/reports/replenishment-candidates.ts` compilado con TypeScript 5.8.3 `tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --skipLibCheck`: **PASS**. Blob Git exacto de fuente local ejecutada y archivo de GitHub: `518902475bf7b19acc4d2dd8889370ba0b62bf7d`.
- `tests/reorder_stock_exceptions_v756.test.mjs`: **11/11 pruebas Node.js 22.16.0 ejecutadas y PASS**, blob exacto `0ad45b458abff61f8de300b9f4427fa5b8d0e501`; cubre over-reserved, valores negativos, Decimal(18,3), overflow, catálogo mixto, integridad de identidades y exclusión de candidaturas inseguras.
- `tests/replenishment_candidates_v756.test.mjs` actualiza la regresión anterior de disponible negativo para exigir **exclusión** del candidato. Ambas suites se integran a `backend/package.json` `test:reports`; la suite oficial completa y el test de inspección de router no se ejecutaron localmente sin checkout completo.
- Se verifican predicados de tenant/RBAC, `RepeatableRead` y lectura sin escritura por inspección de fuente GitHub. `npm ci`, typecheck/compilación monorepo, PostgreSQL17 (incluyendo tenant A/B y 401/403), API HTTP y Playwright: **NOT_EXECUTED** en sandbox sin acceso al checkout/dependencias. Los workflows GitHub queued/skipped no son PASS.

## Pendiente para cierre real #756

Políticas persistentes por producto/warehouse, seguridad por ubicaciones, FEFO físico y lotes #755, lead time con demanda reconciliada, alertas outbox, conciliación negativa con datos PostgreSQL reales y QA integral. **Mantener #756 en backlog funcional**; un PR fusionado no prueba el DoD completo.

**Rollback:** revertir los archivos del PR. No hay DDL ni datos que restaurar. SOURCE_REUSE=NONE.
