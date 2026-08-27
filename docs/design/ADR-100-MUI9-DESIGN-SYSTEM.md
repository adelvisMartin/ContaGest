# ADR #100 — ContaGest Design System sobre Material UI 9

Status: **ACCEPTED FOR INCREMENTAL FOUNDATION**  
Issue: #100

## Decision

```text
ContaGest Design System
        ↓
semantic tokens / visual contract
        ↓
createContaGestMuiTheme()
        ↓
Material UI 9
        ↓
Cg* domain/presentation components
```

Material UI 9 es la única librería React generalista del ERP. La estética sigue siendo ContaGest; no se adopta Material Design por defecto como identidad visual.

No se migra el catálogo completo en este PR. El kit HTML/string continúa como capa de compatibilidad durante la transición y se retira por consumidores, nunca por borrado masivo.

## Theme authority

La factoría canónica existente es:

```text
frontend/src/components/muiRuntime.js
  createContaGestMuiTheme(mode)
```

Los primitives `Cg*` consumen exactamente esa factoría mediante `CgProvider`. No se define una segunda paleta ni un theme competitivo.

Light/dark cambian color, no geometría. El theme conserva:

- control 38 px desktop;
- touch target 44 px en mobile cuando aplica;
- tipografía Inter / Segoe UI fallback;
- fondo/surface/text/border/brand semánticos;
- foco MUI visible;
- radios compactos;
- overlays y diálogos MUI;
- tablas densas.

## Styling order

Orden de decisión:

1. `sx` para ajuste local y pequeño;
2. `styled()` para wrapper reusable cuando `sx` repetido lo justifique;
3. `theme.components` para defaults/variants globales;
4. owners CSS canónicos para geometría/contrato transversal existente.

No se crea CSS page-specific para corregir una primitive que debe resolverse en theme/componente.

## CSS owners

#100 respeta `AGENTS.md`: no introduce un séptimo owner visual. Los seis owners vigentes continúan siendo la autoridad CSS. Los primitives de este foundation no añaden un stylesheet propio.

## Initial Cg* set

Implementado en `frontend/src/components/ui/cg/CgPrimitives.jsx`:

- `CgProvider`;
- `CgButton`;
- `CgIconButton` con accessible name obligatorio;
- `CgTextField`;
- `CgSelect`;
- `CgDialog`;
- `CgPageHeader`;
- `CgStatusChip`;
- `CgEmptyState`;
- `CgState`;
- `CgMoney` **sólo presentación**;
- `CgDataTable` sobre MUI Table para el foundation.

No se crean primitives especulativos fuera de repetición real.

## Money boundary

`CgMoney` formatea una representación recibida; no calcula impuestos, saldos, ledger ni rounding. Las reglas monetarias permanecen en el dominio/contratos Decimal del backend. No se permite que una primitive visual se convierta en autoridad contable.

## Permission boundary

Los componentes Cg pueden representar disabled/hidden states de UX, pero no otorgan permisos. RBAC, tenant isolation, licencia y reglas financieras permanecen server-side.

## MUI X Community decision

**Evaluación: aprobada para spikes/pilotos data-heavy; no añadida todavía al lockfile de este foundation.**

Razón:

- MUI Table cubre el piloto actual sin dependency delta;
- Data Grid Community se justificará cuando una pantalla real necesite virtualización, sorting/filtering/pagination y estado de columnas;
- evitar dependencia/bundle antes de demostrar el caso.

Pro/Premium: **fuera de alcance**. Pinning, licencia/costo y funciones comerciales requieren spike separado antes de cualquier incorporación.

Candidatos futuros a `CgDataGrid`:

- inventario extenso;
- auditoría;
- importaciones con miles de filas;
- reportes administrativos densos.

`CgDataGrid` sólo se crea cuando al menos uno de esos consumidores tenga requisitos medibles.

## MUI MCP / official skills decision

`@mui/mcp` y skills oficiales se reconocen como inputs potenciales de ingeniería, **pero este PR no los instala ni ejecuta**. Motivos:

- el repo exige pin exacto y revisión de supply-chain;
- no se debe usar `@latest` como dependencia persistente;
- no se necesita MCP para que el runtime use MUI 9 correctamente;
- Playwright MCP continúa siendo la autoridad browser/evidence.

La incorporación futura debe revisar fuente/licencia, fijar versión/commit exactos, mantener `executeUpstreamScripts:false` y pasar `skills:check`.

## Pilots

Dos superficies de bajo riesgo:

1. `marca` / Brand Guidelines: showcase de header, field, select, status, money, table, dialog e icon button.
2. `ayuda`: búsqueda/form controls Cg* sin modificar un workflow financiero o de datos.

Los pilotos tienen `data-no-mui` en el mount host para evitar que el promotor legacy monte simultáneamente otro control sobre la misma función.

No se migran cierre, ledger, bancos, impuestos ni otras superficies críticas en esta ola.

## Accessibility

#99 es el guard de accesibilidad. Además el contrato local exige:

- `CgIconButton` siempre tiene label;
- fields tienen label;
- dialog tiene título accesible;
- controls son keyboard-operable por primitives MUI;
- touch size proviene del theme;
- reduced motion y foco continúan sujetos al gate global.

Un `0 violations` automático no constituye certificación WCAG completa.

## Migration roadmap

Después del foundation:

1. Forms y validation messages;
2. dialogs/confirmations;
3. navigation/command palette;
4. tables y eventual `CgDataGrid` Community;
5. CRUD administrativos no financieros;
6. módulos operativos;
7. superficies financieras sólo con caracterización y regresión de dominio.

Cada ola debe retirar duplicación **después** de migrar todos sus consumidores.

## Negative rules

- no segundo ThemeProvider con otra paleta;
- no shadcn/COSS/Ant/Chakra/Mantine/PrimeReact;
- no MUI X Pro/Premium por conveniencia;
- no native visible + MUI visible para la misma entrada;
- no page CSS nuevo para el piloto;
- no permisos o cálculos financieros en `Cg*`;
- no migración masiva de 58 rutas.

## Rollback

Revertir este foundation elimina los Cg primitives y los dos mount pilots. El kit legacy continúa intacto; no hay migración DB, cambio de API ni dato persistente que revertir.
