# Control Hípico — Design System canónico

## Propósito

Este documento es la autoridad de diseño e interacción para la PWA independiente **Control Hípico** y su wrapper Android. El producto está orientado a operación rápida, auditable, mobile-first y offline-first. La UI representa el estado operativo; nunca sustituye la autoridad del dominio, PostgreSQL, evidencias oficiales ni las reglas financieras.

## Autoridades visuales

- `frontend/public/hipico-control/assets/css/app.css` es el **único entrypoint CSS enlazado por la aplicación**.
- `frontend/public/hipico-control/assets/css/_foundation.css` es un partial interno importado por `app.css`; concentra tokens, temas, layouts y primitivas base, pero no se enlaza como segunda autoridad global.
- `frontend/public/hipico-control/assets/js/ui.js` concentra primitivas de UI/comportamiento reutilizables.
- `frontend/public/hipico-control/assets/js/theme-bootstrap.js` aplica el tema antes del primer paint.
- `frontend/public/hipico-control/assets/js/dialog-accessibility.js` refuerza el contrato de diálogos y foco.
- `frontend/public/hipico-control/assets/js/command-center.js` proyecta el Command Center a partir de contexto local y del read-model remoto.

No se permiten hojas globales paralelas del tipo `fixes.css`, `overrides.css`, `theme-vN.css`, `components-vN.css`, `mobile-accessibility.css` ni capas acumulativas equivalentes. Una excepción visual debe incorporarse al entrypoint canónico y quedar cubierta por pruebas.

## Principios

1. Herramienta operativa, no landing ni dashboard decorativo.
2. Estado real antes que ornamentación: desconocido, offline, degradado o no expuesto nunca se pinta como éxito.
3. Borgoña identifica marca y acción primaria; los estados usan tokens semánticos.
4. Borde antes que sombra; elevación reservada para dialog, toast y ayudas superpuestas.
5. Scroll vertical natural; nunca se bloquea globalmente para ocultar un problema de layout.
6. Un CTA primario por contexto cuando sea posible.
7. Navegación, captura y cierres deben seguir funcionando con teclado, touch y 200 % de zoom.
8. No se introduce React/MUI u otro framework dentro de esta PWA sin ADR separado que demuestre impacto positivo en bundle, offline, Android y regresión.

## Tokens

Los tokens `--hc-*` definidos en `_foundation.css` son la fuente canónica de color, superficies, texto, borde, foco, radio, sombra, espaciado, navegación y objetivos táctiles. Los colores configurables de un grupo son datos de dominio y constituyen la única excepción prevista a no introducir hex arbitrarios desde JS/HTML.

Estados semánticos:

- `--hc-success`: listo, confirmado, sincronizado.
- `--hc-warning`: degradado, pendiente, stale o revisión requerida.
- `--hc-danger`: fallo, rechazo o conflicto bloqueante.
- `--hc-info`: información neutral o estado todavía no verificado.
- `--hc-focus`: foco visible de teclado.
- `--hc-touch`: objetivo táctil mínimo; su valor operativo de referencia es 44 px.

El color nunca es la única señal de estado: badge, copy o etiqueta textual debe acompañarlo.

## Tema Light / Dark / System

Los únicos modos válidos son `system`, `light` y `dark`. El workspace conserva la preferencia funcional; `theme-bootstrap.js` mantiene una copia local no sensible para aplicar el tema antes del primer paint y evitar flash. Al terminar el arranque, el workspace vuelve a ser la autoridad.

Todo componente nuevo debe verificarse en los tres modos. Un componente que sólo es legible en uno de ellos se considera incompleto.

## Tipografía y densidad

- Familia: stack de sistema/Inter disponible, sin dependencia crítica de red.
- Pesos permitidos normalmente entre 400 y 700.
- Texto de estado y ayuda no puede caer por debajo de una legibilidad razonable en móvil o a 200 % de zoom.
- La densidad compacta de escritorio no puede reducir objetivos táctiles críticos por debajo de 44 × 44 px en móvil o coarse pointer.

## Componentes canónicos

### Button

Variantes: default, primary, success, danger y ghost; tamaños compactos y amplios sólo cuando el contexto lo requiere. Debe disponer de `:focus-visible`, estado disabled perceptible y objetivo táctil >=44 px en móvil/coarse pointer. Un botón disabled debe comunicar por qué no puede ejecutarse cuando la causa no es obvia.

### Card

Estructura base: `card`, `card__head`, `card__body`. Las cards operativas muestran título, evidencia/estado y acciones relevantes. No se usan para KPIs sin una fuente real de datos.

### Badge

Variantes neutral/success/warning/danger/info. El texto del badge explica el estado; el color es redundante, nunca la única señal.

### Field

Label visible asociado al control, input/select/textarea y ayuda opcional. Un error aparece junto al control sin borrar el valor introducido. El flujo debe poder completarse sin mouse.

### Tabs

Compactas y desplazables sólo dentro de su propio contenedor cuando sea imprescindible. No deben interceptar el gesto vertical de la página.

### Dialog

Debe usar semántica de diálogo, `aria-modal`, título accesible, cierre explícito, Escape, foco inicial/trap y retorno al elemento invocador. En móvil puede presentarse como bottom sheet, sin dejar `overflow` global bloqueado al cerrarse.

### Toast / aria-live

Los avisos transitorios son no bloqueantes y se publican en la región `aria-live`. Un toast no sustituye un error persistente cuando el operador debe tomar una decisión.

### State

Los patrones conectados deben representar explícitamente, cuando apliquen:

- `loading`: qué se está comprobando;
- `empty`: ausencia real de información;
- `error`: fallo y siguiente acción segura;
- `success`: evidencia de estado satisfactorio;
- `disabled`: acción visible pero bloqueada;
- `offline/stale`: información local o previa, no confirmación viva;
- `unknown/not_exposed`: capacidad que no está verificada o no está publicada por el backend.

`BLOCKED`, `NOT_EXECUTED`, `offline`, `stale` y `unknown` nunca equivalen a PASS/ready.

## Command Center

El Command Center combina contexto local del workspace con un read-model remoto sin convertir la UI en autoridad. Debe mostrar como mínimo:

- System;
- Bridge;
- Channel;
- Database;
- Providers;
- Agent;
- grupo activo;
- jornada/meeting;
- carrera actual;
- próxima carrera;
- Documents;
- Queue;
- Conflicts;
- Alerts.

El contexto local deriva el grupo, jornada y carreras del workspace activo. La parte remota consulta `/api/hipico/command-center` con `cache: no-store`. Ese BFF está **deshabilitado por defecto** y sólo responde lecturas remotas cuando `HIPICO_COMMAND_CENTER_ENABLED=true`; usa el token interno de operador exclusivamente del lado servidor para consultar `/api/v1/hipico-bot/*`. Ningún token interno se envía a la PWA.

El read-model remoto devuelve proyecciones agregadas de estado. No debe entregar destinatarios de outbox, texto de mensajes, secretos ni payloads sensibles. Si el backend no publica todavía una capacidad —por ejemplo documentos— se representa como `not_exposed`, no como ready.

Cuando no hay conexión o la consulta remota falla, el Command Center puede conservar el contexto local pero debe marcar la parte remota como offline/no verificada. Nunca debe simular una lectura viva.

## Responsive

Breakpoints se eligen por comportamiento, no por marca de dispositivo:

- desktop: sidebar + topbar;
- <=900 px/coarse pointer: objetivos táctiles >=44 px;
- <=780 px aproximadamente: navegación/header móvil y safe areas;
- <=470 px: grids reducidos y contenido reflow sin clipping.

Gates obligatorios del producto: 360, 390 y 430 px; además landscape, viewport reducido por teclado y zoom 200 %. Se debe verificar que la barra inferior fija no cubra contenido y que no exista scroll horizontal global. Una tabla genuinamente ancha puede usar un contenedor local de overflow.

## Accesibilidad WCAG 2.2 AA

Contrato mínimo:

- landmarks y jerarquía de headings coherentes;
- labels/nombres accesibles;
- contraste AA;
- `:focus-visible` perceptible;
- orden de tabulación lógico;
- controles sólo-icono con `aria-label`;
- dialogs con foco atrapado y retorno de foco;
- estados dinámicos en `aria-live` cuando corresponda;
- objetivos táctiles críticos >=44 × 44 px;
- estado nunca comunicado sólo por color;
- `prefers-reduced-motion: reduce` reduce o elimina animación/transición no esencial;
- zoom 200 % sin pérdida funcional, solapamiento ni clipping crítico.

## Motion

El movimiento sólo se usa para continuidad espacial o feedback corto. Con `prefers-reduced-motion: reduce`, las transiciones/animaciones no esenciales se reducen prácticamente a cero y se deshabilita el smooth scrolling. Ningún proceso funcional depende de una animación para terminar.

## PWA / Service Worker

- Navegación: network-first con fallback al shell offline.
- API, auth, webhook, RPC, datos vivos y metadata runtime: network-only/no-store.
- Shell estático: cache versionado; al activar una nueva versión se eliminan caches anteriores de Control Hípico.
- `build-info.json` y `runtime-config.js` no se almacenan indefinidamente.
- Una diferencia entre `APP_VERSION` y `build-info.json` produce alerta explícita de version mismatch antes de operaciones críticas.
- El shell offline debe incluir los módulos necesarios para tema, Command Center local, accesibilidad y recuperación, sin incluir antiguas hojas de patches retiradas.

## Android

El wrapper Android consume la PWA canónica mediante `sync:web` y valida paridad con `verify:web`. No mantiene una UI alternativa. Deben coincidir versión y metadatos entre:

- `products/hipico-control/release-policy.json`;
- `frontend/public/hipico-control/build-info.json`;
- `assets/js/config.js` (`APP_VERSION`);
- meta `application-version` del HTML;
- `CACHE_VERSION` del Service Worker;
- `android/hipico-control-v1130/package.json`;
- metadata raíz del `android/hipico-control-v1130/package-lock.json`.

El build Android no se considera PASS por la sola paridad de archivos: el workflow dedicado debe construir y verificar el APK del SHA candidato.

## WhatsApp SOURCE / LAB

Durante shadow/QA, SOURCE permanece sólo lectura y LAB es el destino soportado para simulación/escritura. Ningún componente visual, Command Center, helper o acción rápida puede relajar esa separación ni convertir datos de provider/WhatsApp en autoridad financiera.

## Evolución del sistema

Antes de agregar o modificar un componente:

1. reutilizar token y primitive existente;
2. si falta, agregarlo al entrypoint/partial canónico y documentarlo aquí;
3. cubrir estados loading/empty/error/success/disabled/offline cuando apliquen;
4. probar teclado, foco, light/dark/system, reduced motion, 360/390/430 y zoom 200 %;
5. comprobar que datos live no quedan cacheados indefinidamente;
6. mantener paridad PWA/Android y contratos de versión/protocolo;
7. no introducir una segunda autoridad visual ni framework nuevo sin ADR y evidencia.

## Gate de mantenimiento

Un cambio de UX/UI no se considera terminado sólo porque renderiza. Debe tener contrato automatizado cuando sea razonable, browser evidence del SHA final y revisión de que no se introdujeron secretos, datos sintéticos presentados como reales, bypasses de seguridad, bloqueo de scroll global o degradación de accesibilidad.
