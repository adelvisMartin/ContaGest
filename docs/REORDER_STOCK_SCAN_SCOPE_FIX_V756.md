# #756 — Reparación de error de alcance en la paginación del reporte de reposición

## Defecto comprobado en main

Tras la integración del preflight de inventario #1080, la ruta `GET /api/v1/reports/inventory/reorder` cambió la respuesta de `prisma.$transaction` de `{activeProducts, products, salesGroups}` a `{activeProducts, scan, salesGroups}`. Los productos sólo permanecen accesibles **dentro** del callback de la transacción; fuera se obtiene `const {rows, stockReview, reorderCandidates}=scan`.

Sin embargo, el código todavía referenciaba **dos veces** la variable fuera de alcance `products.length`: una en `reorderScanPageMeta({scannedProducts:...})` y otra en `meta.scannedProducts`. Ambas podían lanzar `ReferenceError: products is not defined` en cada ejecución exitosa del reporte, incluso sin evidencia opcional de ventas.

## Corrección

- Ambos campos ahora toman `rows.length` de **la misma página validada** dentro de la transacción. No modifica `scan`, los filtros, el orden, la paginación `take/skip`, `RepeatableRead`, el aislamiento por `tenantId`, `reports.view`, la clasificación de excepciones, las cantidades, la conciliación, el resumen ni la lógica de ventas opcional.
- Una nueva prueba de regresión inspecciona el **código real** de la ruta y exige que ambos `scannedProducts` provengan de `rows.length`, con ninguna referencia `products.length` fuera de la transacción.
- Otras dos pruebas verifican los metadatos con filas excepcionadas, coincidencias de candidatos y páginas vacías o finales, usando `prepareReorderStockPage` y `reorderScanPageMeta`.
- No hay cambio de esquema, migración, escritura de inventario, ledger, creación de órdenes ni configuración de CI.

## Verificación y evidencia

- Código revisado sobre la rama real de GitHub: blob `9b4a1e19c5ef8d798a0be780dfb60db5d0537b01` de `backend/src/modules/reports/reports.routes.ts`.
- Suite de regresión extendida: blob `b811d8b10e7015ad048e377f4d48637f0f24fcec` en `tests/reorder_stock_preflight_v756.test.mjs` (14 tests definidos: 11 anteriores + 3 nuevos).
- **13/13 SOURCE_VERIFIED**, pruebas de inspección estructural ejecutadas contra la fuente GitHub exacta: ambos conteos corregidos, variable de página en ámbito, RBAC, tenant de producto/factura, snapshot RepeatableRead, diagnóstico 409, reporte opcional y ruta de sólo lectura. Esto **no es** una ejecución de tests Node ni de PostgreSQL.
- **NOT_EXECUTED**: ejecución del runner oficial de 14 casos en el checkout completo, `npm ci`, build/typecheck monorepo, HTTP 200/401/403/409, PG17 multi-tenant, navegador/E2E. El contenedor no puede resolver `github.com` para clonar; no se llama PASS a esas puertas.
- Los estados de GitHub Actions `queued` o `skipped` se reportan como tales y no se sustituyen por evidencia local.

## Backlog, despliegue y rollback

Este PR corrige una regresión de alcance concreta del reporte paginado dentro de #756, pero **no cierra #756**, cuyo DoD aún requiere política persistente por producto/almacén, FEFO real #755, alertas/outbox y QA integral. El PR puede revertirse sin restaurar datos: son sólo la ruta, la suite de pruebas y este documento.

SOURCE_REUSE=NONE. No se modifica la política de checks ni las protecciones del branch principal.
