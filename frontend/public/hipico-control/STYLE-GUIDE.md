# Control Hípico — Style Guide canónica

Esta guía define la única línea visual permitida para la PWA y el wrapper Android. El manual de marca completo vive en `docs/brand/CONTROL_HIPICO_BRAND_MANUAL.md`.

## Autoridades canónicas

- `assets/css/app.css`: **autoridad global** de tokens, temas, layout, formularios, navegación, cards, tablas, dialogs, toasts, WhatsApp, acceso y Help Center.
- `assets/css/mobile-accessibility.css`: capa transversal de accesibilidad táctil y `reduced-motion`; no redefine marca ni tokens.
- `assets/css/operational-copy-center.css`: capa acotada al Copy Center operacional mediante clases `ops-*`.
- `assets/css/operational-access-guard.css`: guard visual fail-closed del Copy Center; sólo controla la visibilidad autorizada de `.ops-root`.
- `assets/js/ui.js`: **única biblioteca de primitivas visuales/comportamiento**. Ofrece Button, Card, Badge, Field, State, Dialog, iconos, toast y gestión accesible de foco.
- `assets/js/help-center.js`: manual de uso y ayuda contextual opt-in.

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

## Responsive

Verificar al menos 360, 390/393, 430, 768, 1024 y 1440 px. La barra móvil fija no cubre contenido. Ningún chip/tab impide `pan-y`. Tablas operativas se convierten en listas/cards cuando sea necesario. Los controles táctiles críticos conservan un mínimo de **44 px**; la capa `mobile-accessibility.css` amplía esa garantía hasta 900 px y también cuando el dispositivo reporta `pointer: coarse`.

## Accesibilidad

- foco visible;
- contraste legible light/dark;
- estado nunca comunicado sólo por color;
- controles sólo-icono con `aria-label`;
- dialogs con `role=dialog`, `aria-modal`, foco inicial, trap y retorno de foco;
- reduced motion;
- mensajes de error indican el siguiente paso.

## Contraseñas

Control Hípico **nunca almacena ni muestra una contraseña**. Supabase Auth conserva el hash. La aplicación sólo muestra estado no secreto: `Configurada`, `Requiere cambio` o `Sin verificar`, y permite enviar recuperación.

## Ayuda

El Help Center nunca se abre automáticamente. La ayuda contextual puede añadir `title`/descripciones a controles clave, pero no muestra popups por sí sola.

## WhatsApp

Durante QA: **SOURCE es sólo lectura** y **LAB es el único destino de escritura/simulación**. Ningún cambio visual o de ayuda puede relajar esta regla.

## Regla de mantenimiento

Antes de añadir una regla, usar los tokens/componente existentes. Un color dinámico de grupo puede entrar como dato de dominio; ningún otro hex arbitrario debe introducirse desde JS/HTML. Toda excepción se documenta y se cubre con prueba.
