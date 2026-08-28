# ContaGest Design System · runtime canónico

Issue foundation: #100  
ADR: `docs/design/ADR-100-MUI9-DESIGN-SYSTEM.md`

La interfaz prioriza lectura rápida de datos, captura segura, teclado, consistencia y densidad empresarial. **Material UI 9 es el engine React generalista; la identidad visual es ContaGest.**

## Arquitectura

```text
semantic product tokens
        ↓
createContaGestMuiTheme(light|dark)
        ↓
Material UI 9
        ↓
Cg* presentation/domain components
        ↓
module surfaces
```

El kit HTML/string histórico continúa únicamente como compatibilidad incremental. Un nuevo módulo React no debe crear una segunda biblioteca de primitives ni una paleta paralela.

## Owners visuales reales

El runtime conserva exactamente los owners definidos por `AGENTS.md`:

```text
frontend/src/styles/contagest-visual-system-v12.css
frontend/src/styles/erp-runtime.css
frontend/src/styles/module-adapters.css
frontend/src/styles/runtime-primitives-v13.css
frontend/src/styles/shell-contract.css
frontend/src/styles/shell-stability-v1127.css
```

No usar como autoridad referencias históricas a `vertical-contexts.css` o `erp-system.css`. No crear un séptimo owner sin ADR + migración contractual.

## Theme

Factoría canónica:

```text
frontend/src/components/muiRuntime.js#createContaGestMuiTheme
```

Light y dark conservan la misma geometría. El theme gobierna:

- palette semántica;
- typography;
- spacing/density de primitives MUI;
- radius/border/shadow;
- buttons/fields/select/menu/tabs;
- tables;
- dialogs/tooltips;
- 38 px desktop y 44 px touch cuando aplica.

## Styling

Preferencia:

1. `sx` local;
2. `styled()` reusable;
3. `theme.components` para defaults/variants globales;
4. CSS owner canónico cuando el contrato es transversal y no específico de una primitive React.

No usar global overrides para arreglar una pantalla aislada.

## Primitives Cg*

Foundation:

```text
frontend/src/components/ui/cg/CgPrimitives.jsx
```

Incluye `CgButton`, `CgIconButton`, `CgTextField`, `CgSelect`, `CgDialog`, `CgPageHeader`, `CgStatusChip`, `CgEmptyState`, `CgState`, `CgMoney` y `CgDataTable`.

Reglas:

- `CgIconButton` exige accessible name;
- label/error/helper pertenecen al field;
- un control visible no tiene un segundo control visible para el mismo valor;
- `CgMoney` sólo presenta; no calcula contabilidad;
- `CgDataTable` foundation usa MUI Table. MUI X Community se evaluará cuando exista caso real para Data Grid.

## Tipografía

- page title: 20–25 px desktop / 18–22 mobile;
- section title: 16–18 px;
- body/operational: 12–14 px;
- KPI/value: 14–18 px con `font-variant-numeric: tabular-nums`;
- button/label compacto sin sacrificar legibilidad.

Importes, RIF y documentos nunca se cortan como decoración cuando existe espacio/scroll owner apropiado.

## Palette semántica

La UI consume propósito, no colores sueltos:

- background/canvas;
- surface/surface2;
- text/text-muted;
- border/border-strong;
- brand/primary;
- success;
- warning;
- error;
- info.

El color no es el único medio para comunicar estado.

## Spacing, radius y elevation

- densidad compacta y consistente;
- radios 8–12 px en controles/surfaces;
- bordes de 1 px como separación principal;
- sombras mínimas;
- sin gradients, glass, blobs o adornos de dashboard en rutas operativas.

## Buttons

- una acción primaria por contexto cuando sea posible;
- secondary/outlined para acciones alternativas;
- destructive usa semántica error + copy explícito;
- icon-only requiere label/title accesible;
- disabled debe mantener significado comprensible.

## Fields y forms

- label persistente;
- helper/error asociado al control;
- no duplicar native + MUI visible;
- validación de UX no sustituye validación backend;
- Enter/Space/Escape según primitive/semántica;
- focus visible y restauración de foco en overlays.

## Dialogs / drawers

- title accesible;
- Escape/cierre según riesgo;
- confirmación destructiva inequívoca;
- focus trap y restore cubiertos por MUI + gate #99;
- no esconder errores de validación detrás del cierre.

## Tables / grids

MUI Table es suficiente para tablas pequeñas/medias sin interacciones avanzadas.

Crear `CgDataGrid` sobre **MUI X Community** sólo con requisitos reales: virtualización, sorting, filtering, pagination, column visibility o state server-side. Pro/Premium no se incorpora sin spike comercial/técnico separado.

Números se alinean de manera estable y no dependen de color para signo/estado.

## Estados

Cada módulo nuevo debe diseñar explícitamente:

- loading;
- empty;
- error;
- success;
- permission denied;
- disabled;
- offline cuando aplique.

No declarar una pantalla verificada usando un dataset vacío si el componente crítico nunca renderizó.

## Accessibility

Guard: issue #99.

Mínimos:

- keyboard-only;
- focus visible y no oculto;
- accessible name/role/state;
- labels y describedby/error;
- contraste AA cuando aplique;
- zoom 200%;
- reduced motion;
- touch targets;
- table headers/semántica.

Automation + MUI no equivale a certificación WCAG.

## Responsive

Gates principales:

```text
360
390
430
768
1024
1440
```

El documento no posee overflow horizontal. Tables/calendar/kanban/tabs pueden poseer scroll explícito.

## Motion

Motion es funcional, breve y reducible. `prefers-reduced-motion` tiene prioridad. No añadir movimiento antes de estabilizar geometría y flujo.

## MUI MCP / skills

No se instala `@mui/mcp` ni skills persistentes en #100 sin pin exacto y supply-chain review. Playwright MCP sigue siendo autoridad de browser evidence. Cualquier incorporación futura mantiene `executeUpstreamScripts:false` y `skills:check`.

## Pilotos #100

- `marca`: showcase Cg* completo, sin workflow financiero;
- `ayuda`: fields/button/status Cg* en una segunda superficie de bajo riesgo.

No se migran cierre, ledger, bancos ni fiscal en esta foundation.

## Roadmap

1. canonical forms;
2. dialogs/confirm patterns;
3. navigation/command palette;
4. tables/DataGrid por caso real;
5. CRUD administrativos no financieros;
6. módulos operativos;
7. finanzas por ola con caracterización/regresión.

Cada ola retira legacy sólo después de migrar todos sus consumidores y pasar 58-route smoke + accessibility + visual/bundle gates.
