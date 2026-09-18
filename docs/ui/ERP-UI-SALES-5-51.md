# 5/51 · Ventas React Cg/MUI

## Objetivo

Migrar `ventas` al renderer React canónico sin cambiar facturación, persistencia, fallback offline ni integración con Cotizaciones.

## Contratos preservados

- sincronización: `SupabaseSyncService.pullSales`;
- creación: `SupabaseSyncService.createSale`;
- fallback controlado: `RuntimePolicy.handlePersistenceFailure`;
- evidencia local: `create-sale-offline-fallback` en audit log;
- transferencia a cotizador: importe + observación y navegación a `cotizacion`.

## UI

La ruta usa un único `createRoot()`, `CgProvider`, PageHeader, botones, campos/selects controlados, estados, chips, money formatting y data table Cg*/MUI. El contenedor de tabla es explícitamente scrollable sin ampliar el documento.

## QA

Source contract/audit: requerido. Browser 360/390/430/768/1366 permanece `NOT_EXECUTED` mientras #134 bloquee runners.
