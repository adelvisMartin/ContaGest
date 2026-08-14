# ContaGest-VE — Style Guide v11.15

## Propósito

Este documento es la fuente de verdad visual para el shell y los módulos de ContaGest-VE. Su prioridad es productividad ERP, legibilidad, accesibilidad y consistencia en desktop, tablet y móvil. No se deben introducir estilos aislados que contradigan estos tokens sin justificarlo y cubrirlo con QA.

## Principios

1. **La información manda sobre la decoración.** Un ERP no debe parecer una colección de tarjetas promocionales.
2. **Responsive significa reordenar, no encoger desktop.** Las columnas colapsan, las tablas hacen scroll interno y la página nunca desborda el viewport.
3. **Jerarquía sobria.** Se evita el abuso de `900/950`; el énfasis se consigue con escala, espacio, color y contraste.
4. **Una acción, una semántica.** Los iconos decorativos ambiguos se eliminan.
5. **Dos temas oficiales.** Claro y Oscuro. Menos variantes reduce deuda visual y amplía la cobertura QA.
6. **Interacción comprobable.** `click → focus → action → estado persistente` forma parte del gate visual.

## Tipografía

Familia principal:

```css
font-family: Inter, system-ui, -apple-system, "Segoe UI", sans-serif;
```

Escala y pesos objetivo:

| Uso | Peso | Tamaño orientativo |
| --- | ---: | ---: |
| Body | 400–450 | 13–16 px |
| Texto secundario | 450–500 | 11–14 px |
| Labels / botones | 600–620 | 11–14 px |
| Encabezado de sección | 650–680 | 16–22 px |
| Título de página | 700 | 20–32 px |
| KPI / display | 700–740 | 18–34 px |

Evitar nuevos usos de `font-weight: 800`, `900` o `950` salvo logotipo/marca o un caso excepcional documentado.

Números contables pueden usar tipografía tabular/monoespaciada cuando ayude a comparar columnas, no como estilo decorativo general.

## Color semántico

### Claro

- Canvas: `#F3F6FB`
- Surface: `#FFFFFF`
- Surface secundaria: `#F7F9FC`
- Texto principal: `#0B1526`
- Texto secundario: `#34465D`
- Muted: `#5F7188`
- Border: `#D8E1EC`
- Primary: `#215FD1`
- Accent: `#4F46E5`
- Success: `#12805C`
- Warning: `#A96308`
- Danger: `#B42318`

### Oscuro

- Canvas: `#06101E`
- Surface: `#0D1B2D`
- Surface secundaria: `#12243A`
- Texto principal: `#F7FBFF`
- Texto secundario: `#D8E5F2`
- Muted: `#AEC0D2`
- Border: `#29435F`
- Primary: `#60A5FA`
- Accent: `#818CF8`

No introducir texto oscuro sobre superficies oscuras ni texto de contraste insuficiente.

## Espaciado

Escala base de 4 px:

```text
4 / 8 / 12 / 16 / 20 / 24 / 32
```

Tokens de uso frecuente:

- micro-gap: 4 px
- control gap: 8 px
- card internal: 12–16 px
- section gap: 16–20 px
- page major gap: 20–24 px

Evitar valores arbitrarios cuando exista un token equivalente.

## Radios

- Control pequeño: `10px`
- Control/card estándar: `14px`
- Card principal / modal: `18px`
- Pill/círculo: `999px`

No mezclar esquinas de 4, 8, 22 y 26 px dentro de la misma zona sin intención visual clara.

## Controles

Altura táctil estándar: **42 px**.

- Inputs: mínimo 40–42 px.
- Botones principales: mínimo 42 px.
- Icon button: 40–42 px.
- Controles touch deben ofrecer área suficiente aunque el icono sea de 16–20 px.

## Iconografía

Preferencias:

1. SVG inline/vectorial de una misma familia visual para controles críticos.
2. Material Symbols Outlined para iconografía de módulos.
3. Font Awesome legacy únicamente donde ya esté integrado y no provoque inconsistencia.

No mezclar tres familias de iconos dentro del mismo control.

Iconos deben comunicar función. Si el texto ya explica la acción y el icono no agrega significado, se elimina.

## Header / shell

### Desktop

Prioridad:

`marca → búsqueda → contexto secundario → acciones → cuenta`

La tasa BCV es secundaria y no debe dominar el header.

### Mobile

Dos filas:

```text
[ menú + ContaGest-VE                         tema + cuenta ]
[ búsqueda                                                   ]
```

Se ocultan del shell móvil:

- tasa BCV;
- fuente de tasa;
- botón actualizar BCV;
- selectores de modo/idioma.

Esas funciones viven en contextos de dashboard/configuración donde hay espacio y contexto suficientes.

## Navegación rápida móvil

- Horizontal por gesto táctil.
- `scroll-snap` opcional.
- **Sin botones flotantes izquierda/derecha.**
- No sticky si tapa KPI o contenido.
- Tabs con truncado controlado, nunca forzar el ancho de la página.

## Breakpoints

- `≤ 380px`: teléfono pequeño.
- `≤ 760px`: teléfono.
- `761–1023px`: tablet / layout intermedio.
- `≥ 1024px`: desktop.

Las reglas deben funcionar también entre breakpoints; no diseñar exclusivamente para un modelo de teléfono.

## Grids

En móvil:

- forms: 1 columna;
- page actions: 1 columna cuando no caben cómodamente;
- KPI: 2 columnas flexibles; 1 columna bajo 380 px;
- dashboards/sections: 1 columna;
- settings/admin/brand layouts: 1 columna;
- componentes nunca deben conservar `min-width` que fuerce el viewport.

## Tablas

Contrato obligatorio:

- el wrapper puede hacer `overflow-x:auto`;
- la tabla puede mantener un ancho mínimo útil;
- **document/body no deben aumentar su `scrollWidth`** por una tabla;
- no usar flechas flotantes para simular scroll de tabla en móvil;
- cabeceras y celdas mantienen legibilidad y touch scrolling.

## Formularios

- Labels breves y legibles.
- Una columna en móvil.
- Inputs nunca exceden `100%`.
- Errores cerca del campo y con texto, no solo color.
- Focus visible.
- No reemplazar/re-renderizar el nodo enfocado por timers, analytics, CAPTCHA o refrescos de datos.

## Temas

Temas soportados en UI:

- `light`
- `dark`

Presets históricos (`sky`, `soft-blue`, `spectrum`, `enterprise`, `executive`, `finance`) quedan deprecados. Datos persistidos se normalizan a Claro/Oscuro.

El botón de tema del header debe alternar **Claro ↔ Oscuro** en un solo click.

## Motion

Duraciones recomendadas:

- feedback inmediato: `120–160ms`
- control/menu: `160–200ms`
- reveal deliberado: `200–260ms`

Preferir `opacity` y `transform`.

Respetar siempre:

```css
@media (prefers-reduced-motion: reduce)
```

No animar tablas, importes contables o formularios de forma que retrase el trabajo.

## Assets de marca

Usar assets canónicos del repositorio:

- `/brand/contagest-logo.svg`
- `/icons/contagest-app.svg`

No recrear el logotipo con texto/iconos genéricos si existe el asset oficial.

## QA responsive obligatorio

Viewports mínimos:

- `360×800`
- `390×844`
- `430×932`
- tablet `768×1024`
- desktop `1366×768`
- desktop `1440×900`

Por ruta crítica validar:

- `document.documentElement.scrollWidth <= innerWidth + 1`
- controles visibles y clicables;
- tablas solo desbordan dentro de su wrapper;
- tema alterna y persiste;
- menú de cuenta abre/cierra;
- navegación a Configuración funciona;
- títulos no se cortan;
- botones no se solapan;
- no existen overlays invisibles interceptando clicks;
- contraste en claro y oscuro.

## Regla de release

Un screenshot bonito no sustituye la prueba funcional.

Para aprobar una entrega visual:

```text
build correcto
+ navegador real
+ viewport real
+ interacción real
+ ausencia de overflow global
+ regresión de rutas críticas
```
