# ERP Mobile Migration #181

## Estrategia

La migración se aplica en el owner canónico `cg.visual.responsive` sobre `.cgx-module-standard`, clase que `app.js::normalizeVisuals()` añade a cada ruta renderizada. Esto evita 58 parches independientes y conserva un único contrato responsive.

## Primera ola

Las capturas de dispositivo mostraron fricción clara en:

- `gimnasio` / `rutinas` / `nutricion` — todos usan `GymManagementPage.js`;
- `inventario` — usa `InventoryPage.js`.

El adapter corrige navegación horizontal, separación icono/texto, grids, formularios, acciones, targets táctiles y ownership de overflow.

## Contrato global de 58 rutas

Todas las rutas del catálogo `MODULE_VISUAL_CATALOG` heredan:

- `min-width:0` / `max-width:100%` en el root normalizado;
- overflow horizontal sólo en tablas/nav explícitos;
- navs con scroll táctil y targets >=44px;
- form grids de una columna en mobile;
- inputs/selects/textarea mobile >=44px y 16px de fuente;
- actions con wrap;
- KPI de dos columnas en mobile;
- cards/listas capaces de envolver texto largo.

## QA

`qa/erp-mobile-58-v181.spec.mjs` visita las 58 rutas en 360×800, 390×844 y 430×932 y falla por document overflow, elementos fuera del viewport, touch height <44 o botones con icono/texto sin separación.

La suite necesita navegador real. Mientras #134 impida obtener runner, su ejecución en Actions es BLOCKED/NOT_EXECUTED, no PASS.
