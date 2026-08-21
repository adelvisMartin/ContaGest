# ContaGest Unified Enterprise UI Kit

Este directorio contiene los componentes visuales compartidos del ERP. El objetivo no es producir una plantilla llamativa, sino mantener una interfaz operacional compacta, consistente y legible en todos los módulos.

## Autoridad visual

La fuente canónica de tokens, tipografía, densidad, cards, formularios, tablas, responsive, theming y motion es:

```text
frontend/src/styles/contagest-visual-system-v12.css
```

`erp-runtime.css` es el único entrypoint importado por `app.js` y carga ese archivo al final de la cascada. No crear nuevos `*-vNN.css` para corregir problemas visuales compartidos; corregir el sistema canónico.

## Componentes estables

- `Button`: acciones primaria/secundaria/riesgo con altura y tipografía comunes.
- `PageHeader`: encabezado compacto de módulo con eyebrow, título, descripción, metadatos y acciones.
- `MetricGrid` / `MetricCard`: KPIs financieros y operativos densos, sin blobs ni cifras gigantes.
- `Section`: panel estándar con header/body consistente.
- `DataTable`: tabla financiera con cabecera sticky, números tabulares y overflow propio.
- `Field`, `Select`, `Textarea`: anatomía de formulario con label estático y control responsive.
- `Badge`: estado semántico, nunca decoración principal.
- `Toolbar`: búsqueda + acciones sin romper en móvil.
- `Timeline`: actividad/auditoría compacta.
- `EmptyState`: explicación útil sin hero gráfico sobredimensionado.

## Escala obligatoria

| Rol | Token | Rango |
| --- | --- | --- |
| Título de página | `--cg-v-text-page` | 20–26 px desktop; 18–22 px móvil |
| Título de sección | `--cg-v-text-section` | 16–18 px |
| KPI | `--cg-v-text-kpi` | 16–20 px; 16 px móvil |
| Texto normal | `--cg-v-text-md` | 14 px |
| Texto denso / tabla | `--cg-v-text-sm` | 13 px |
| Etiqueta | `--cg-v-text-xs` | 12 px |
| Metadata | `--cg-v-text-2xs` | 11 px |

Un módulo operacional no debe introducir títulos de 32–64 px ni métricas tipo landing page.

## Reglas de layout

1. Todo hijo de `grid`/`flex` que pueda contener texto o tablas debe admitir `min-width:0`.
2. La página nunca posee scroll horizontal. Solo tablas/tabs/carouseles explícitos pueden usar `overflow-x:auto`.
3. Desktop puede usar dos columnas; en `<=1023px` las columnas principales colapsan a una.
4. Los KPI usan `auto-fit` y en `<=520px` pasan a una columna.
5. Acciones se envuelven; en móvil los botones críticos ocupan ancho disponible en lugar de solaparse.
6. Formularios usan grids auto-fit de mínimo ~210 px y una columna en teléfono.
7. Valores monetarios usan `tabular-nums` y no se parten en dos líneas.

## Theming

Solo existen dos geometrías globales: `light` y `dark`. Un vertical puede cambiar un acento semántico, pero no tamaños, spacing, radios, ancho de sidebar, tipografía de KPI ni densidad de tablas.

Usar siempre tokens (`--cg-v-*`). No agregar hex sueltos para superficies o texto dentro de una vista nueva salvo un activo de marca documentado.

## Assets

- Marca global: `frontend/public/brand/`.
- Iconos PWA/app: `frontend/public/icons/`.
- Producto Control Hípico: `frontend/public/hipico-control/` y no se mezcla con assets del ERP.
- Iconografía funcional de la UI: Font Awesome mediante `icon()` del kit; no insertar SVG decorativos por vista para resolver jerarquía.

## Motion

El sistema usa transiciones cortas de 120–170 ms solo para feedback de interacción. Nada de rebotes, grandes desplazamientos o animaciones que retrasen formularios. `prefers-reduced-motion` es obligatorio.

## QA mínimo

Antes de entregar una vista:

```bash
npm test
npm run test:browser
```

Además revisar al menos 360, 390, 430, 768, 1024 y 1440 px. Los tests de `qa/responsive-all-routes.spec.mjs` verifican overflow y solapamientos; `qa/visual-system-v12.spec.mjs` verifica escala visual y geometría compartida.
