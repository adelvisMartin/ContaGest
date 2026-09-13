# Control Hípico — Design System canónico

Este documento es la especificación normativa de diseño de la PWA Control Hípico y del wrapper Android. La implementación de referencia vive en `frontend/public/hipico-control/assets/css/app.css`, `assets/css/mobile-accessibility.css` y `assets/js/ui.js`. `frontend/public/hipico-control/STYLE-GUIDE.md` es la guía práctica de uso y no puede contradecir este documento.

## Principios

- Herramienta operativa, no landing page ni dashboard decorativo.
- Una lectura fallida nunca se representa como cero sano, vacío sano o éxito.
- SOURCE es **solo lectura**. LAB es el contexto de QA/simulación.
- Ninguna decisión visual concede autoridad financiera, autosend, settlement ni ejecución de tools.
- Estado, severidad y disponibilidad se comunican siempre con texto además de color.
- `app.css` es la autoridad visual global. No se crean hojas `theme-vN`, `fixes`, `overrides`, `legacy`, `components-vN` ni capas globales paralelas.

## Color

Todos los colores de producto salen de tokens `--hc-*` en `app.css`. Los tokens semánticos mínimos son `--hc-bg`, `--hc-surface`, `--hc-surface-subtle`, `--hc-border`, `--hc-text`, `--hc-text-muted`, `--hc-brand`, `--hc-success`, `--hc-warning`, `--hc-danger`, `--hc-info` y `--hc-focus`, con variantes `*-soft` cuando corresponda. El contraste objetivo es **WCAG 2.2 AA** en light y dark. Un color dinámico de grupo es dato de dominio y no sustituye la semántica de estado.

## Tipografía

La familia canónica es Inter con fallback `ui-sans-serif/system-ui`. Pesos permitidos: 400–700. La interfaz prioriza legibilidad operacional sobre densidad extrema. Texto de ayuda y metadata puede usar 12px; controles usan tamaño equivalente a 1rem para evitar zoom inesperado en móvil. Código, hashes y trazas usan monospace.

## Spacing

El spacing se compone en múltiplos de 4px y usa principalmente 8, 10, 12, 14, 16, 18, 24, 32 y 40px. Las pantallas deben conservar scroll vertical natural; nunca se compensa falta de espacio bloqueando `overflow-y` global. Safe areas usan `env(safe-area-inset-*)`.

## Radius

Los radius canónicos son `--hc-radius-xs`, `--hc-radius-sm`, `--hc-radius-md`, `--hc-radius-lg` y `--hc-radius-xl`. Badges/chips pueden usar forma pill. Ningún módulo crea su propia escala paralela.

## Shadows

Se prefiere borde antes que sombra. `--hc-shadow-sm` sirve para cards/superficies ligeras y `--hc-shadow-md` para dialog, toast y overlays. No se usan sombras decorativas para comunicar estado.

## Iconos

Los iconos deben ser SVG o assets canónicos existentes, heredar color cuando sea posible y no ser el único contenido de una acción. Todo botón solo-icono requiere `aria-label`. Los iconos de estado acompañan texto; no lo reemplazan.

## Botones

Primitiva `.button` con variantes primary, success, danger, ghost, small y xl. Un CTA principal por contexto cuando sea posible. En superficies táctiles y móvil, toda acción crítica conserva **44px** mínimos de alto/ancho efectivo. `disabled` y `aria-disabled=true` deben ser visibles, no accionables y conservar explicación contextual.

## Formularios

Toda entrada tiene label visible o nombre accesible equivalente, ayuda opcional y error accionable. Inputs/select/textarea usan tokens canónicos, `focus-visible` claro y no dependen de placeholder como etiqueta. Errores dicen qué corregir o qué paso sigue.

## Tablas y registros

Tablas densas sólo se usan donde aportan comparación real. En móvil se convierten a registros/cards cuando el ancho no permite lectura. Texto largo y evidencia operacional se puede exponer con `details/summary` para conservar navegación por teclado y 200% de zoom sin truncar la única evidencia disponible.

## Dialogs

Dialogs usan `role="dialog"`, `aria-modal="true"`, heading accesible, foco inicial, focus trap, Escape y retorno de foco al invocador. En desktop se centran; en móvil pueden presentarse como bottom sheet mientras mantengan los mismos contratos de teclado y foco.

## Status y badges

Estados visuales canónicos: `ready`, `degraded`, `unavailable`, `not_configured`, `connected`, `disconnected`, `failed` y `disabled`. El Command Center añade estados de lectura `idle`, `loading`, `success`, `empty`, `error`, `offline` y `stale`. `unavailable` significa fallo de lectura; `not_configured` significa capacidad ausente; `degraded` significa configurado sin evidencia suficiente; nunca son equivalentes.

## Cards

`.card` es la superficie operacional base. El encabezado separa título, contexto y badge/acción. KPIs sólo se permiten cuando representan un dato operativo real; no se crean números decorativos. Las cards de System, PostgreSQL, Bridge, Channel, Providers y Agent muestran texto de estado y reason cuando exista.

## Navegación

Desktop usa sidebar y topbar canónicos; móvil usa header/nav existentes. La navegación nunca bloquea scroll vertical, no tapa contenido con barras fijas y conserva estado de foco. A **200%** de zoom debe seguir siendo posible llegar a todas las acciones críticas.

## Responsive

Matriz mínima de validación: **360**, **390/393**, **430**, **768**, **1024** y **1440** px, además de landscape móvil y viewport reducido por teclado. Ninguna vista crítica puede crear clipping u overflow horizontal global. `pan-y` debe permanecer disponible. Targets críticos mantienen **44px** mediante `mobile-accessibility.css` hasta 900px y dispositivos `pointer: coarse`.

## Temas

Los temas soportados son `system`, `light` y `dark`. `theme-bootstrap.js` aplica el tema antes de cargar `app.css` para reducir flash; posteriormente `workspace.config.theme` es la autoridad funcional. No se persisten tokens, sesiones, JID, grupos SOURCE ni datos operativos en la clave visual.

## Accesibilidad

Objetivo: **WCAG 2.2 AA**. Requisitos: teclado completo, `:focus-visible`, headings/landmarks coherentes, labels, `aria-live` para cambios dinámicos, `role="status"` para feedback, `aria-busy` durante carga, dialogs accesibles, contraste AA y `prefers-reduced-motion`. La interfaz nunca usa sólo color para comunicar severidad. Los controles críticos conservan 44px y deben poder operarse con Enter/Espacio donde aplique.

## Motion / reduced motion

Las transiciones son breves y funcionales. Con **reduced motion** (`prefers-reduced-motion: reduce`) animaciones/transiciones se reducen prácticamente a cero y `scroll-behavior` vuelve a `auto`. No hay animaciones esenciales para comprender estado.

## Command Center

El Command Center es un read-model observable del backend canónico. El browser envía sólo `groupKey`; `groupId`/JID se resuelve **server-side** y nunca se expone al browser. Si no existe identidad única, Agent se muestra `not_configured` o `unavailable` con reason explícito. Sus estados son:

- `loading`: lectura activa, `aria-busy=true`.
- `success`: evidencia disponible.
- `empty`: lectura válida sin carreras/documentos/canales/alertas operativas.
- `error`: lectura fallida sin snapshot previo.
- `offline`: sin red y sin snapshot previo.
- `stale`: existe snapshot en memoria pero ya no puede confirmarse.
- `disabled`: no existe un grupo local válido seleccionado.
- `unavailable`: sublectura falló.
- `not_configured`: capacidad no configurada.
- `degraded`: capacidad configurada sin evidencia suficiente para `ready`.

SOURCE se muestra literalmente como **SOURCE · SOLO LECTURA**. LAB se muestra como **LAB · QA / SIMULACIÓN**. La UI no ofrece promoción de Agent, autosend ni mutaciones financieras.

## PWA y offline

El Service Worker puede cachear shell/assets estáticos, pero **nunca** respuestas `/api/hipico/command-center` ni `/api/v1/hipico/*`; esas rutas son network-only con `cache: no-store`. El último read-model vive sólo en memoria. Offline con snapshot previo se representa `stale`; offline sin snapshot se representa `offline`.

## Android

`android/hipico-control-v1130/scripts/sync-web.mjs` exige assets del Command Center/theme y compara hash SHA-256 de todos los archivos fuente/target. El wrapper Android no mantiene una copia funcional divergente de la PWA.

## Evidencia y QA

El gate #289 debe ejecutar sobre SHA exacto: contratos, backend typecheck/tests, Playwright Chromium, responsive 360/390/430/768/1440, landscape, teclado, focus, 44px, 200% zoom, system/light/dark, reduced motion, offline/stale, Service Worker/no-cache y Android parity. Screenshots/reportes se conservan como artifacts cuando el runner los produce. Si GitHub Actions devuelve `steps=[]` o `runner_id=0`, el estado es BLOCKED/NOT VERIFIED, nunca PASS.
