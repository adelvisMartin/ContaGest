# Control Hípico — Style Guide canónica

Esta guía define la única línea visual permitida para la PWA y el wrapper Android. El manual de marca completo vive en `docs/brand/CONTROL_HIPICO_BRAND_MANUAL.md`.

## Autoridades canónicas

- `assets/css/app.css`: **autoridad global** de tokens, temas, layout, formularios, navegación, cards, tablas, dialogs, toasts, WhatsApp, acceso y Help Center.
- `assets/css/mobile-accessibility.css`: capa transversal de accesibilidad táctil y `reduced-motion`; no redefine marca ni tokens.
- `assets/css/operational-copy-center.css`: capa acotada al Copy Center operacional mediante clases `ops-*`.
- `assets/css/operational-access-guard.css`: guard visual fail-closed del Copy Center; sólo controla la visibilidad autorizada de `.ops-root`.
- `assets/js/ui.js`: **única biblioteca de primitivas visuales/comportamiento**. Ofrece Button, Card, Badge, Field, State, Dialog, iconos, toast y gestión accesible de foco.
- `assets/js/help-center.js`: manual de uso y ayuda contextual opt-in.
- `assets/js/theme-bootstrap.js`: bootstrap mínimo previo al CSS. Sólo recuerda `system`, `light` o `dark`; al cargar la aplicación completa `workspace.config.theme` vuelve a ser la autoridad funcional.
- `assets/js/command-center.js`: renderer fail-closed del estado operativo canónico; no aplica efectos ni autoridad financiera.
- `assets/js/command-center-shell.js`: adaptador UI que consume únicamente la clave local visible del grupo activo y monta el Command Center sin publicar JID ni identidad SOURCE.

Las cuatro hojas CSS anteriores forman el set canónico explícito. No se permite crear `styles.css`, `ui-system*.css`, `theme-vN.css`, `components-vN.css`, `fixes.css`, `overrides.css`, `legacy.css` ni otra hoja global paralela. Las capas auxiliares deben permanecer acotadas a su responsabilidad y consumir los tokens de `app.css`.

## Identidad

Nombre oficial: **Control Hípico**.

Assets oficiales: `logo-control-hipico.png`, `icons/icon-192.png`, `icon-512.png` y variantes maskable. Los nombres de grupos son datos operativos configurables y no reemplazan la marca de la aplicación.

## Principios

1. Herramienta operativa, no landing page.
2. Superficies neutrales; borgoña para identidad/acción primaria.
3. Estados semánticos discretos y comprensibles.
4. Pesos 400–700; no 800/900.
5. Borde antes que sombra; elevación sólo para dialog/toast/help.
6. Scroll vertical natural siempre, especialmente en móvil y captura.
7. Un CTA principal por contexto cuando sea posible.
8. Focus visible y soporte de `prefers-reduced-motion`.
9. Un fallo de lectura nunca se representa como cero, vacío sano o éxito.
10. SOURCE y LAB deben diferenciarse por texto y estado, nunca sólo por color.

## Componentes

Las primitivas son equivalentes conceptualmente a shadcn/Radix sin introducir React dentro de la PWA independiente:

- Button: default/primary/success/danger/ghost, small/xl.
- Card: header, descripción, cuerpo y acciones.
- Badge: neutral/success/warning/danger/info.
- Field: label/control/ayuda.
- Tabs: compactas y desplazables cuando hace falta.
- Dialog: centrado en desktop y bottom sheet en móvil; foco atrapado y Escape.
- Toast: apilable, no bloqueante, cierre manual y aria-live.
- State: loading/empty/error/info coherentes.
- Fila expandible: `details/summary` nativo para contenido largo; Enter/Espacio funcionan sin JavaScript adicional y el contenido permanece disponible a 200% de zoom.

## Command Center — contrato #289

El Command Center es un **read model observable**, no una consola con autoridad implícita. Se monta en el resumen del grupo activo y consulta exclusivamente el BFF autenticado `/api/hipico/command-center`.

Estados admitidos en UI:

- `loading`: lectura en curso; `aria-busy=true`.
- `success`: evidencia canónica disponible.
- `empty`: consulta válida sin entidades; se explica la ausencia.
- `error`: consulta fallida con acción de reintento.
- `offline`: sin red y sin lectura previa.
- `stale`: existe una lectura anterior pero ya no puede confirmarse.
- `unavailable`: un componente o métrica no pudo leerse; se muestra `No disponible`, nunca `0`.
- `not_configured`: la capacidad no está configurada; no equivale a fallo.
- `degraded`: configurado pero sin evidencia suficiente para afirmar `ready`.

Las tarjetas de Backend, PostgreSQL, Bridge, Canal, Providers y Agente deben comunicar estado mediante texto + badge. Para alertas o documentos con texto grande se usa expansión nativa mediante `details/summary`; no se trunca la única evidencia disponible.

La identidad de grupo enviada por el shell es sólo la clave local validada `[A-Za-z0-9._:-]{3,120}`. El browser no publica ni deriva JID, `groupId` SOURCE ni secretos del backend. Si el backend no puede resolver la identidad necesaria para el agente, el estado correcto es `GROUP_ID_NOT_SELECTED` / `not_configured`.

## Tema `system` / `light` / `dark`

`theme-bootstrap.js` corre antes de las hojas de estilo para reducir el flash visual. Ese bootstrap sólo persiste el enum visual. Una vez cargado el workspace, `workspace.config.theme` es la autoridad y actualiza `data-theme`; el bootstrap refleja ese valor para la próxima carga. No se persisten tokens, sesiones, grupo SOURCE ni datos operativos en esa clave.

El contraste objetivo es **WCAG AA** tanto en `light` como en `dark`. `system` sigue `prefers-color-scheme` a través de las reglas canónicas existentes. La validación visual real de contraste sigue siendo un gate de QA y no puede sustituirse por esta documentación.

## Responsive

Verificar al menos **360, 390/393, 430, 768, 1024 y 1440 px**. La barra móvil fija no cubre contenido. Ningún chip/tab impide `pan-y`. Tablas operativas se convierten en listas/cards cuando sea necesario. Los controles táctiles críticos conservan un mínimo de **44 px**; la capa `mobile-accessibility.css` amplía esa garantía hasta 900 px y también cuando el dispositivo reporta `pointer: coarse`.

En Command Center, matrices y listas deben envolver texto sin imponer ancho mínimo a la página. Alertas y documentos grandes son expandibles. A **200% de zoom** deben conservarse navegación, foco, estado y acción de reintento sin scroll horizontal de página.

## Accesibilidad

- foco visible;
- contraste legible light/dark con objetivo WCAG AA;
- estado nunca comunicado sólo por color;
- controles sólo-icono con `aria-label`;
- dialogs con `role=dialog`, `aria-modal`, foco inicial, trap y retorno de foco;
- `prefers-reduced-motion` / reduced-motion;
- mensajes de error indican el siguiente paso;
- navegación completa por teclado; Enter/Espacio operan botones, `details/summary`, tabs y acciones;
- regiones de estado dinámico usan `aria-live`, `role=status` o `aria-busy` según corresponda.

## SOURCE / LAB

Durante QA: **SOURCE es sólo lectura** y **LAB es el único destino de escritura/simulación**. Esta diferencia debe aparecer literalmente en el Command Center además de cualquier semántica visual. Ningún cambio de UI, ayuda, agente o tema puede relajar esta regla.

- `SOURCE · SOLO LECTURA`: observación/ingesta; nunca autosend productivo desde esta UI.
- `LAB · QA / SIMULACIÓN`: destino controlado de pruebas; no concede autoridad financiera.

## Contraseñas

Control Hípico **nunca almacena ni muestra una contraseña**. Supabase Auth conserva el hash. La aplicación sólo muestra estado no secreto: `Configurada`, `Requiere cambio` o `Sin verificar`, y permite enviar recuperación.

## Ayuda

El Help Center nunca se abre automáticamente. La ayuda contextual puede añadir `title`/descripciones a controles clave, pero no muestra popups por sí sola.

## Evidencia y gates

Un cambio visual no se considera validado sólo por inspección de fuente. El gate de #289 debe conservar evidencia del SHA exacto para:

- teclado y foco visible;
- 200% de zoom;
- light/dark/system;
- reduced motion;
- 360, 390/393, 430, 768, 1024 y 1440 px;
- loading, empty, error, offline, stale, unavailable, not_configured y retry;
- contraste WCAG AA;
- PWA offline/reconexión;
- paridad Android/PWA.

Si un runner, navegador, Android build o proveedor no ejecuta, el estado se reporta `BLOCKED`/`NOT VERIFIED`; nunca como PASS.

## Regla de mantenimiento

Antes de añadir una regla, usar los tokens/componente existentes. Un color dinámico de grupo puede entrar como dato de dominio; ningún otro hex arbitrario debe introducirse desde JS/HTML. Toda excepción se documenta y se cubre con prueba.
