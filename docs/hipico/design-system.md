# Control Hípico — Design System canónico

Este documento es la especificación normativa de diseño de la PWA Control Hípico y del wrapper Android. La implementación visual de referencia vive en `frontend/public/hipico-control/assets/css/app.css`; `frontend/public/hipico-control/STYLE-GUIDE.md` es la guía práctica y no puede contradecir este documento.

## Principios

- Herramienta operativa, no landing page ni dashboard decorativo.
- Una lectura fallida nunca se representa como cero sano, vacío sano o éxito.
- SOURCE es **solo lectura**. LAB es el contexto de QA/simulación.
- Ninguna decisión visual concede autoridad financiera, autosend, settlement ni ejecución de tools.
- Estado, severidad y disponibilidad se comunican siempre con texto además de color.
- `app.css` es la única autoridad visual global. No se crean hojas `theme-vN`, `fixes`, `overrides`, `legacy`, `components-vN`, `mobile-accessibility.css` ni capas globales paralelas.

## Color

Todos los colores de producto salen de tokens `--hc-*` en `app.css`. Los tokens semánticos mínimos incluyen `--hc-bg`, `--hc-surface`, `--hc-surface-subtle`, `--hc-border`, `--hc-text`, `--hc-text-muted`, `--hc-brand`, `--hc-success`, `--hc-warning`, `--hc-danger`, `--hc-info` y `--hc-focus`, con variantes `*-soft` cuando corresponda. El contraste objetivo es **WCAG 2.2 AA** en light y dark.

## Tipografía

La familia canónica es Inter con fallback `ui-sans-serif/system-ui`. Pesos permitidos: 400–700. Texto de ayuda y metadata puede usar 12px; controles usan tamaño equivalente a 1rem para evitar zoom inesperado en móvil. Código, hashes y trazas usan monospace.

## Spacing, radius y shadows

El spacing se compone en múltiplos de 4px. Las pantallas conservan scroll vertical natural y safe areas con `env(safe-area-inset-*)`. Los radius canónicos provienen de `--hc-radius-*`; badges/chips pueden usar forma pill. Se prefiere borde antes que sombra y las sombras se reservan para separar planos funcionales.

## Iconos, botones y formularios

Los iconos usan SVG/assets canónicos y nunca son la única señal de estado. Todo botón sólo-icono requiere `aria-label`. La primitiva `.button` mantiene variantes canónicas y toda acción crítica conserva **44px** mínimos de target efectivo en móvil/touch mediante reglas integradas en `app.css`. Toda entrada tiene label o nombre accesible, `focus-visible` claro y errores accionables.

## Tablas, dialogs, status y cards

Tablas densas se convierten en registros/cards cuando el ancho no permite lectura. Texto largo puede usar `details/summary`. Dialogs mantienen `role="dialog"`, `aria-modal="true"`, foco inicial, focus trap, Escape y retorno de foco. Estados visuales canónicos: `ready`, `degraded`, `unavailable`, `not_configured`, `connected`, `disconnected`, `failed` y `disabled`. El Command Center añade `idle`, `loading`, `success`, `empty`, `error`, `offline` y `stale`.

Las `.card` y cards de System, PostgreSQL, Bridge, Channel, Providers y Agent muestran texto de estado y reason cuando exista; los KPIs sólo se usan con datos operativos reales.

## Navegación y responsive

Desktop usa sidebar/topbar canónicos y móvil usa la navegación existente. La matriz mínima de validación es **360**, **390/393**, **430**, **768**, **1024** y **1440** px, además de landscape móvil y viewport reducido por teclado. A **200%** de zoom deben seguir disponibles navegación, foco y acciones críticas, sin overflow horizontal global ni clipping.

## Temas

Los temas soportados son `system`, `light` y `dark`. `theme-bootstrap.js` aplica el tema antes de cargar `app.css` para reducir flash; posteriormente `workspace.config.theme` es la autoridad funcional. No se persisten tokens, sesiones, JID, grupos SOURCE ni datos operativos en la clave visual.

## Accesibilidad y motion

Objetivo: **WCAG 2.2 AA**. Se exige teclado completo, `:focus-visible`, headings/landmarks coherentes, labels, `aria-live`, `role="status"`, `aria-busy`, dialogs accesibles, contraste AA y `prefers-reduced-motion`. Con reduced motion las transiciones se reducen prácticamente a cero y `scroll-behavior` vuelve a `auto`.

## Command Center

El Command Center es un read-model observable del backend canónico. El browser envía sólo `groupKey`; `groupId`/JID se resuelve **server-side** y nunca se expone al browser. Cero coincidencias producen `GROUP_ID_NOT_CONFIGURED`/`not_configured`; múltiples coincidencias producen `GROUP_ID_AMBIGUOUS`/`unavailable`; nunca se selecciona una identidad arbitraria.

Estados del Command Center:

- `loading`: lectura activa, `aria-busy=true`.
- `success`: evidencia disponible.
- `empty`: lectura válida sin carreras/documentos/canales/alertas operativas.
- `error`: lectura fallida sin snapshot previo.
- `offline`: sin red y sin snapshot previo.
- `stale`: existe snapshot en memoria pero ya no puede confirmarse.
- `disabled`: no existe un grupo local válido seleccionado.
- `unavailable`: una sublectura falló.
- `not_configured`: capacidad no configurada.
- `degraded`: capacidad configurada sin evidencia suficiente para `ready`.

SOURCE se muestra literalmente como **SOURCE · SOLO LECTURA**. LAB se muestra como **LAB · QA / SIMULACIÓN**. La UI no ofrece promoción de Agent, autosend ni mutaciones financieras.

## PWA y offline

El Service Worker puede cachear shell/assets estáticos, pero **nunca** respuestas `/api/hipico/command-center` ni `/api/v1/hipico/*`; esas rutas son network-only con `cache: no-store`. El último read-model vive sólo en memoria. Offline con snapshot previo se representa `stale`; offline sin snapshot se representa `offline`.

## Android

`android/hipico-control-v1130/scripts/sync-web.mjs` exige los assets del Command Center/theme y compara hash SHA-256 de todos los archivos fuente/target. El wrapper Android no mantiene una copia funcional divergente de la PWA.

## Evidencia y QA

El gate #289 debe ejecutar sobre SHA exacto: contratos, backend typecheck/tests, Playwright Chromium, responsive **360/390/393/430/768/1024/1440**, landscape, teclado, focus, 44px, 200% zoom, system/light/dark, reduced motion, offline/stale, Service Worker/no-cache y Android parity. Screenshots/reportes se conservan como artifacts cuando el runner los produce. Si GitHub Actions devuelve `steps=[]` o `runner_id=0`, el estado es BLOCKED/NOT VERIFIED, nunca PASS.
