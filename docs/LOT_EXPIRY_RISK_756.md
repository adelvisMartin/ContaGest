# #756 — Lot expiry risk, review-only

Base inicial: main 80658cbfa64707c00de4aff7df215fc7c84c70d8. Continuación del propietario del issue #756. Sin migraciones ni alteración de inventario.

## Ruta

GET /api/v1/reports/inventory/expiry?daysAhead=30&includeExpired=false&take=25&skip=0

- Tenant y permiso `reports.view` validados por el router de informes; InventoryLot.tenantId y Product.tenantId se filtran explícitamente en servidor, y sólo se incluyen lotes y productos activos.
- Se consultan exclusivamente `InventoryLot.expiresAt`, identidad/fecha de recepción y nombre/SKU/unidad de Product, sin notas, secretos ni códigos de cliente.
- Rango de vencimiento 0–365 días UTC, inclusivo de hoy y del día de corte. `includeExpired=true` incluye vencidos anteriores. `take` 1–100, `skip` 0–1.000.000. Orden determinista (expiresAt, id), paginación acotada. `cache-control: no-store`.
- Salida: expired / due_today / near_expiry, días naturales UTC relativos a fecha de consulta, versión `lot-expiry-risk-v1`, evidencia `LOT_CATALOG_DATE_ONLY`.
- Nunca asumir que un lote tiene existencias actuales, que sus unidades están disponibles, ni que puede asignarse/expedirse: `onHandExact=null`, `allocatableQuantityExact=null`, `allocationAllowed=false`, `requiresManualVerification=true`. Estos datos dependen del ledger de lotes y almacenes #755.

## Pruebas y verificación

- El módulo `backend/src/modules/reports/lot-expiry-risk.ts` fue compilado aisladamente con TypeScript 5.8.3 sin errores y ejecutado con Node 22.16.0: 8/8 pruebas locales de ventanas UTC, cambio de día/huso, límites, clasificación, datos excluidos, campos de existencias no inventados, entradas inválidas y fecha de recepción futura. Hash Git local = GitHub blob `861c2671feb456d743f5e33b886ab5a16ba80e21`.
- Nueve tests formales están en `tests/lot_expiry_risk_v756.test.mjs`; se agregaron a `backend/package.json` `test:reports`. El noveno test comprueba fuente estática del router, no se ejecutó en el sandbox local aislado.
- Suite oficial completa, typecheck de todo el monorepo, PostgreSQL17 real, tenant A/B HTTP, Playwright/UX: **NOT_EXECUTED** por checkout de GitHub no disponible y dependencias del backend ausentes. La cola de GitHub Actions nunca equivale a PASS. Se requieren pruebas exact-SHA antes de cerrar el ticket.

Comandos en entorno con dependencias: `npm ci`, `npm run typecheck`, `npm --workspace backend run test:reports`, `npm run build`; luego PostgreSQL17 efímero con roles/tenant A/B, filtros/UTC, 403/404 y paginación concurrente.

## Backlog que sigue abierto

El ticket #756 incluye políticas por producto/location (reorder point/qty/safety stock/lead time), ledger y FEFO físico #755, conciliación de lotes, stock ageing real, slow-moving, alertas/outbox y QA. Este PR sólo permite **screening de fecha de vencimiento**, no libera lotes para venta y no satisface por sí mismo el DoD. Dejar #756 OPEN.

Rollback: revertir únicamente helper, endpoint, test y script/documentación de reportes. No hay escrituras, cambios DDL ni auto-compra.
