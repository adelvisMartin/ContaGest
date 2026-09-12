# Control Hípico — Design System canónico

## Propósito

Este documento es la autoridad visual y de interacción de Control Hípico. La PWA conserva identidad propia dentro del ecosistema ContaGest-VE: operación rápida, densidad controlada, mobile-first, offline-first y estados operativos visibles. No redefine el dominio hípico ni convierte la UI en fuente de verdad financiera.

## Autoridades

- `frontend/public/hipico-control/assets/css/app.css`: tokens, layout y primitives generales.
- `mobile-accessibility.css`: invariantes táctiles de 44 px para dispositivos compactos.
- `operational-copy-center.css`: estilos encapsulados del centro de copia operativo.
- `operational-access-guard.css`: visibilidad fail-closed del centro operativo.
- No se permiten hojas `vN`, overrides acumulativos ni nuevas autoridades visuales paralelas sin actualizar este documento y el gate Android/PWA.
- `android/hipico-control-v1130/scripts/sync-web.mjs` fija explícitamente la lista anterior y verifica hash/archivo contra la PWA canónica.

## Tokens

Los tokens `--hc-*` son la única fuente para superficies, texto, bordes, marca, estados, foco, radios, sombras, safe areas, navegación y touch targets. Un componente nuevo debe consumir tokens antes de introducir valores propios.

Estados semánticos:

- `--hc-success`: listo, sincronizado, acción confirmada.
- `--hc-warning`: degradado, pendiente, stale, revisión requerida.
- `--hc-danger`: fallo, conflicto bloqueante, rechazo.
- `--hc-info`: estado informativo sin acción requerida.
- `--hc-focus`: foco visible de teclado.

## Tema

Los modos admitidos son `system`, `light` y `dark`. El tema seleccionado vive en el workspace y se refleja en `data-theme`. `theme-bootstrap.js` conserva una copia no sensible en `localStorage` para aplicarla antes del primer paint y evitar flash de tema; el workspace vuelve a ser autoridad al terminar el arranque. Todos los componentes deben funcionar en los tres modos.

## Primitives

### Button

- Altura estándar 40 px; en móvil los controles críticos alcanzan 44 px.
- Variantes: normal, primary, success, danger, ghost.
- `:focus-visible` obligatorio.
- Disabled debe ser visible y no accionable.

### Card

- `card`, `card__head`, `card__body`.
- Sin nesting decorativo innecesario.
- Las cards operativas muestran título, evidencia/estado y acción; nunca un KPI decorativo sin fuente.

### Badge

- Variantes success/warning/danger/info.
- El color nunca es la única señal: siempre texto de estado.

### Form

- Label visible, input/select/textarea, ayuda opcional.
- Error junto al control y sin borrar el valor introducido.
- Teclado y foco no dependen del mouse/touch.

### Modal/Dialog

- `role=dialog`, `aria-modal=true`, título visible.
- Cierre explícito, Escape y restauración de foco manejados por la capa de accesibilidad.
- En móvil se presenta como bottom sheet sin bloquear el scroll de forma permanente.

## Patrones de estado

Cada pantalla o bloque conectado soporta:

1. `loading`: explica qué se está comprobando, sin falso éxito.
2. `empty`: ausencia real de datos, no error.
3. `error`: mensaje y reintento cuando sea seguro.
4. `success`: evidencia y timestamp cuando aplique.
5. `disabled`: acción visible pero bloqueada con causa.
6. `offline/stale`: los datos pueden mostrarse, pero se etiquetan como no confirmados.

`BLOCKED`, `NOT_EXECUTED`, `stale` y `offline` nunca se representan como PASS/ready.

## Command Center

El Command Center no replica métricas locales decorativas. Consulta `/api/hipico/command-center`, que valida la sesión Supabase en el BFF y delega a la API canónica `/api/v1/hipico/command-center`. La PWA nunca recibe `HIPICO_OPERATOR_CONTROL_TOKEN` ni `HIPICO_BOT_OPERATOR_TOKEN`.

Debe exponer como mínimo:

- backend y PostgreSQL;
- Bridge y última evidencia de evento;
- canales persistidos;
- providers;
- agente y modo cuando existe `groupId`;
- meeting activo, carrera actual y próxima carrera;
- documentos recientes y estado de extracción;
- cola, fallos y conflictos;
- alertas derivadas de evidencia real.

Toda lectura usa `Cache-Control: no-store`. El Service Worker no cachea `/api`, `/auth`, RPC ni metadata runtime. Si se pierde conexión se conserva únicamente la última lectura en memoria de la vista y se marca `stale`; nunca se presenta como estado vivo.

## Responsive

Breakpoints funcionales, no por dispositivo:

- Desktop: sidebar y topbar.
- <= 780 px: navegación inferior, header móvil, safe-area y touch target >= 44 px.
- <= 470 px: grids reducidos sin scroll horizontal documental.
- Gates explícitos: 360, 390 y 430 px; landscape; teclado abierto/viewport reducido; zoom 200%.

No se permite `overflow-x` global como sustituto de corregir un componente roto. Tablas realmente anchas pueden usar `.table-wrap` local.

## Accesibilidad

Objetivo WCAG 2.2 AA:

- contraste AA en texto/controles/estados;
- foco visible;
- orden de tabulación coherente;
- labels accesibles y roles semánticos;
- touch target >= 44 px en móvil;
- `aria-live` para estados que cambian;
- `prefers-reduced-motion: reduce` elimina animaciones/transiciones no esenciales;
- ningún estado se comunica solo por color.

## PWA y Android

- Navegación: network-first con fallback a shell offline.
- API/live/auth/runtime metadata: network-only/no-store.
- Shell estático: cache versionado y reemplazo atómico.
- `build-info.json`, `APP_VERSION`, meta HTML, Service Worker, release policy y Android deben conservar paridad de versión.
- Android copia la PWA canónica y valida lista de archivos y SHA-256; no mantiene una UI divergente.

## Regla de evolución

Antes de introducir un componente o estilo nuevo:

1. reutilizar token/primitive existente;
2. si falta primitive, agregarlo a la autoridad canónica y documentarlo aquí;
3. cubrir loading/empty/error/success/disabled cuando aplique;
4. probar teclado, foco, dark/light/system, 360/390/430, reduced motion y 200% zoom;
5. mantener PWA/Android parity;
6. no introducir un framework nuevo ni reescritura de arquitectura sin ADR explícito.
