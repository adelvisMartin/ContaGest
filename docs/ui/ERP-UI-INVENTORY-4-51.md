# 4/51 · Inventario React Cg/MUI

## Objetivo

Migrar la ruta `inventario` desde renderer HTML/DOM imperativo a un único React root sin modificar las invariantes de stock de #94.

## Autoridades preservadas

- catálogo/productos: `SupabaseSyncService`;
- movimientos/ajustes/reversos: `InventoryService`;
- fallback de persistencia de producto: `RuntimePolicy`;
- cálculo de resumen: `calculateInventory`;
- presupuesto: `Store` + navegación a `cotizacion`.

La UI no recalcula ni reescribe Kardex fuera de los servicios existentes.

## Cambio

- `InventoryPage.jsx` usa `CgProvider`, `CgPageHeader`, `CgButton`, `CgTextField`, `CgSelect`, `CgStatusChip`, `CgDataTable`, `CgDialog` y `CgMoney`;
- formularios y estados pasan a React controlado;
- el prompt de reverso se reemplaza por diálogo accesible;
- tablas viven dentro de contención horizontal explícita para evitar overflow del documento;
- `InventoryPage.js` se retira después de mover el registry;
- `audit:erp-ui-inventory` impide reintroducir lifecycle DOM legacy.

## QA

Source contracts: requeridos.
Browser 360/390/430/768/1366: `NOT_EXECUTED` mientras #134 continúe bloqueando runners.
