# ContaGest VE · Visual System v12

Estado: **canónico para todo el ERP compartido**.

Este documento define la guía visual única de ContaGest. Las vistas pueden diferir por flujo de trabajo y semántica del negocio, pero no por escala tipográfica, densidad, geometría base, responsive, controles o jerarquía de información.

## 1. Objetivo

ContaGest es una herramienta operacional, no una landing page. El diseño debe permitir leer, comparar, registrar y auditar datos con rapidez. La prioridad es:

```text
contexto correcto → acción correcta → números legibles → tablas/forms densos → feedback claro
```

No se priorizan hero banners, cifras gigantes, gradientes, vidrio, blobs decorativos ni cards de marketing.

## 2. Fuente de verdad

```text
frontend/src/styles/erp-runtime.css
frontend/src/styles/contagest-visual-system-v12.css
frontend/src/components/ui/
```

`app.js` importa únicamente `erp-runtime.css`. Ese entrypoint carga compatibilidad histórica y termina con `contagest-visual-system-v12.css`, que manda sobre shared UI.

Todo nuevo patrón compartido debe entrar al sistema canónico. No crear otro archivo `*-vNN.css` para arreglar visuales comunes.

## 3. Design tokens

Todos los tokens nuevos usan prefijo `--cg-v-`.

### Tipografía

| Uso | Token | Desktop | Mobile |
| --- | --- | ---: | ---: |
| Título de página | `--cg-v-text-page` | 20–26 px | 18–22 px |
| Título de sección | `--cg-v-text-section` | 16–18 px | 16 px |
| KPI / cifra destacada | `--cg-v-text-kpi` | 16–20 px | 16 px |
| Texto normal | `--cg-v-text-md` | 14 px | 14 px |
| Texto denso | `--cg-v-text-sm` | 13 px | 13 px |
| Label | `--cg-v-text-xs` | 12 px | 12 px |
| Metadata | `--cg-v-text-2xs` | 11 px | 11 px |

Fuente: Inter / Segoe UI Variable / system UI. Para códigos y referencias técnicas se usa el stack mono del sistema.

Los importes usan `tabular-nums lining-nums`.

### Peso

- 400: body y datos ordinarios.
- 500: navegación y énfasis moderado.
- 600: labels, botones, headers de tabla y secciones.
- 700: título de página y KPI.

Evitar 800/900 dentro de pantallas operacionales.

### Spacing

Base 4 px:

```text
4 / 8 / 12 / 16 / 20 / 24 / 32
```

Cards, grids, forms y toolbars deben derivar de esa escala.

### Radios

```text
6 / 8 / 10 / 12 px
```

Un card operacional normal no debe usar radios de 20–32 px.

### Controles

- Desktop: 38 px.
- Touch/mobile: 44 px.
- Icon button desktop: 34–38 px según shell.

## 4. Colores y theming

Solo existen dos temas globales:

```text
light
dark
```

Los tokens semánticos son:

```text
--cg-v-bg
--cg-v-surface
--cg-v-surface-2
--cg-v-surface-3
--cg-v-text
--cg-v-text-muted
--cg-v-text-subtle
--cg-v-border
--cg-v-border-strong
--cg-v-brand
--cg-v-success
--cg-v-warning
--cg-v-danger
--cg-v-info
--cg-v-focus
```

Un vertical puede modificar el acento semántico. No puede modificar globalmente tamaños de fuente, spacing, radios, KPI, formularios, tablas o shell.

## 5. Página

Una vista estándar tiene:

```text
PageHeader
MetricGrid opcional
Section principal
Section secundaria(s)
```

El título de página es compacto. La descripción no supera ~76 caracteres visuales por línea. Los metadatos usan chips discretos.

Los botones principales deben estar visibles sin depender de un hero enorme.

## 6. KPI

Un KPI es un resumen, no el elemento visual dominante.

Contrato:

- min-height aproximado: 72–76 px;
- icono 26–30 px;
- valor 16–20 px;
- label 11–12 px;
- hint 11 px;
- border + sombra mínima;
- sin pseudo-elementos decorativos;
- sin círculos grandes;
- sin gradiente;
- el primer KPI no recibe geometría especial;
- el importe no se parte en dos líneas.

Grid:

- desktop: `auto-fit` con mínimo ~180 px;
- tablet: se reajusta automáticamente;
- móvil medio: dos columnas cuando cabe;
- <=520 px: una columna.

## 7. Cards y secciones

Usar `Section` o cards del kit.

Header de sección:

- padding 13–15 px;
- título 16–18 px;
- subtítulo 12 px;
- acciones envuelven.

Body:

- padding 14–15 px;
- sin nested cards innecesarios;
- sin box-shadow fuerte.

## 8. Formularios

Anatomía:

```text
label estático
control
helper/error opcional
```

Nunca usar label flotante/absolute como solución universal.

Grids usan `auto-fit minmax(210px,1fr)`. En teléfonos estrechos todo pasa a una columna.

Estados obligatorios:

- default;
- hover;
- focus;
- disabled;
- error;
- loading si el flujo lo requiere.

## 9. Tablas

Las tablas son una superficie central del ERP.

- Cabecera sticky.
- Header: 11 px uppercase.
- Body: 13 px.
- Filas densas ~42 px.
- Números alineados a la derecha y tabulares.
- La tabla posee su propio `overflow-x:auto`.
- La página nunca se ensancha por una tabla.
- Muchas columnas pueden establecer ancho mínimo del table, no del documento.

## 10. Responsive

Breakpoints operacionales:

```text
1440 desktop amplio
1024 laptop/tablet landscape
768 tablet
430 phone grande
390 phone estándar
360 phone estrecho
```

Reglas:

- Toda estructura grid/flex con contenido variable necesita `min-width:0`.
- Layout principal de dos columnas pasa a una en tablet.
- Acciones usan wrap.
- Botones críticos ganan ancho en móvil.
- Forms pasan a una columna.
- KPI pasan a una columna <=520 px.
- Tablas/tabs pueden scrollear; el documento no.
- Safe areas se respetan en móvil/PWA.

## 11. Shell

El shell es estable para todas las rutas:

- sidebar con una geometría única;
- topbar compacta;
- quick navigation horizontal controlada;
- menú de usuario y command palette sin solapar;
- navegación activa por surface/brand-soft, no por gradiente.

Un vertical no puede repintar geometría del shell.

## 12. Assets

Estructura canónica:

```text
frontend/public/brand/        marca global
frontend/public/icons/        PWA/app icons
frontend/public/hipico-control/ producto Control Hípico
```

No copiar el logo a cada módulo. No colocar SVG globales en carpetas de páginas. La iconografía funcional de la UI usa el helper `icon()` del kit.

## 13. Motion

Inspirado en motion engineering funcional:

- 120 ms para feedback inmediato;
- hasta 170 ms para transición normal;
- propiedades: color, border, shadow, opacity, pequeños transforms;
- no usar rebotes ni transiciones que retrasen captura de datos;
- `prefers-reduced-motion` obligatorio.

## 14. Patrones prohibidos

Dentro de pantallas ERP:

- títulos 32–64 px;
- KPI con números 36–72 px;
- iconos circulares gigantes;
- primer KPI gigante o oscuro sin razón funcional;
- blobs/pseudo-elementos decorativos;
- gradientes de marketing;
- glassmorphism como superficie por defecto;
- cards anidadas sin propósito;
- ancho fijo que provoque overflow móvil;
- `position:absolute` para labels de formularios compartidos;
- scroll horizontal del documento;
- hex duplicados cuando existe token semántico;
- CSS versionado nuevo para corregir un problema compartido.

## 15. Skills/agentes

Orden sugerido para cambios UI:

1. `contagest-erp-orchestrator` — alcance/gates.
2. `contagest-ui-audit` — distill/typeset/normalize/layout/responsive/harden.
3. Impeccable pinned — crítica detallada.
4. Taste pinned — detectar aspecto genérico, nunca copiar marca.
5. `contagest-motion`/Emil — movimiento después de estabilizar layout.
6. Playwright — validar rutas reales.

## 16. QA

Static:

```bash
npm test
```

Browser:

```bash
npm run test:browser
```

Suites visuales clave:

```text
qa/responsive-all-routes.spec.mjs
qa/erp-style-system.spec.mjs
qa/visual-system-v12.spec.mjs
```

Antes de `PRODUCTION READY`, comprobar light/dark, 360/390/430/768/1024/1440, títulos, KPI, forms, tables, modals, menu, toolbars, estados vacíos, strings largos y montos grandes.

## 17. Migración de CSS histórico

Los estilos históricos continúan cargándose temporalmente para no romper módulos antiguos. La estrategia es:

1. el sistema v12 normaliza shared UI al final de la cascada;
2. cada módulo migrado reemplaza clases legacy por componentes/tokens del kit;
3. cuando un archivo legacy deja de tener consumidores, se elimina;
4. nunca agregar otro hotfix global para compensar un hotfix previo.

El objetivo final es reducir progresivamente `erp-runtime.css` a shell/context + sistema v12 + excepciones verticales realmente justificadas.
