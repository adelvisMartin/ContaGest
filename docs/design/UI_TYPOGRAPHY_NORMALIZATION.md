# ContaGest VE — contrato global de tipografía y métricas

Estado: **canónico para todos los módulos**.

Este contrato corrige una regresión visual en la que distintas capas históricas podían volver a introducir KPIs sobredimensionados, importes partidos y círculos/blobs decorativos detrás de las métricas. La fuente ejecutable del contrato es `frontend/src/styles/ui-normalization-v142.css`, cargada al final por `compact-enterprise-v1110.css`.

## Principios

1. **Una sola escala tipográfica para todo ContaGest.** Un módulo vertical puede cambiar color semántico o contenido, pero no inventar tamaños propios para títulos, tablas o KPIs.
2. **Los importes no se parten.** Valores monetarios, tasas, porcentajes y contadores usan números tabulares, una sola línea y tamaño compacto.
3. **Sin decoración circular en métricas.** Los KPI no usan `::before`/`::after` para círculos, halos o blobs. El único contenedor geométrico permitido es el pequeño icono funcional.
4. **Ningún KPI es tipográficamente especial.** El primer KPI no recibe una píldora oscura ni un tamaño distinto. La prioridad se expresa con color semántico del icono/estado, no rompiendo la jerarquía.
5. **La densidad ERP es consistente.** Página, sección, tabla, formulario y KPI deben verse parte del mismo producto en Contabilidad, Ventas, Compras, Inventario, Nómina, Reportes, verticales y administración.

## Escala canónica

| Elemento | Token / regla |
| --- | --- |
| Caption / tabla header | `--cg-type-caption: .6875rem` |
| Label / eyebrow / KPI label | `--cg-type-label: .75rem` |
| Cuerpo / tabla | `--cg-type-body: .8125rem` |
| Cuerpo global | `--cg-type-body-lg: .875rem` |
| Título de sección | `--cg-type-section: clamp(1rem, 1.15vw, 1.125rem)` |
| Título de página | `--cg-type-page: clamp(1.35rem, 1.65vw, 1.75rem)` |
| Valor KPI | `--cg-type-kpi: clamp(1rem, 1.15vw, 1.28rem)` |

Los valores KPI usan `font-variant-numeric: tabular-nums lining-nums`, `white-space: nowrap` y no pueden aplicar `word-break` o `overflow-wrap` que partan una cifra.

## Componentes cubiertos

El contrato normaliza de forma explícita las familias históricas y actuales:

- `.cgx-metric`
- `.kpi`
- `.pl-kpi`
- `.ds-kpi`
- `.cgv-kpi`
- `.admin-metric`
- `.cg-vertical-kpis article`
- `#kpiTotal`

Esto permite corregir todos los módulos progresivamente sin depender de que cada pantalla migre de inmediato al componente más nuevo.

## Reglas para nuevas vistas

- Reutilizar `MetricCard`, `MetricGrid`, `KpiCard` o primitives ERP existentes.
- No añadir `font-size` local a valores KPI salvo que se cree primero un token global aprobado.
- No utilizar `border-radius: 50%`, `border-radius: 999px` ni pseudo-elementos decorativos sobre el contenedor del KPI.
- No aplicar fondos especiales al primer elemento mediante `:first-child`.
- No usar `overflow-wrap:anywhere` o `word-break:break-all` en dinero, cantidades, RIF, tasas o contadores.
- Probar al menos 1280, 1024, 768, 390 y 360 px, además de zoom de navegador 125% y 150%.

## Gate de QA visual

Para cualquier cambio transversal de UI, verificar como mínimo:

1. Contabilidad / asiento / libros.
2. Ventas y compras.
3. Inventario / kardex.
4. Dashboard y reportes.
5. Nómina.
6. Administración/licencias.
7. Una vertical especializada.
8. Tema claro y oscuro.
9. Desktop, tablet y móvil.

Se considera regresión si reaparece cualquiera de estos síntomas:

- círculo grande detrás de un KPI;
- importe en dos líneas;
- primer KPI con una píldora/tamaño distinto sin razón funcional;
- tablas con una escala notablemente distinta entre módulos;
- títulos de página o sección que cambian de tamaño por vertical;
- valores que se salen del card en 125%/150% de zoom.

El test `tests/ui_typography_normalization.test.mjs` protege las invariantes principales para evitar que una capa legacy vuelva a ganar la cascada accidentalmente.
