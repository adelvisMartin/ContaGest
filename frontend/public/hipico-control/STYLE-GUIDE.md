# Control Hípico — Style Guide canónica

Esta guía define la única línea visual permitida para la PWA y el wrapper Android. El manual de marca completo vive en `docs/brand/CONTROL_HIPICO_BRAND_MANUAL.md`.

## Autoridades únicas

- `assets/css/app.css`: **autoridad visual global**. Define tokens, light/dark/system, layout, responsive base, formularios, navegación, cards, tablas, dialogs, toasts, WhatsApp, acceso y Help Center.
- `assets/css/mobile-accessibility.css`: capa canónica y acotada de accesibilidad táctil/móvil. Conserva el contrato mínimo de **44 px** para controles críticos, `touch-action` y `prefers-reduced-motion` sin redefinir la identidad visual.
- `assets/css/operational-copy-center.css`: estilos exclusivamente del Copy Center operativo.
- `assets/css/operational-access-guard.css`: estilos exclusivamente de estados y bloqueos del guard operativo.
- `assets/js/ui.js`: **única biblioteca de primitivas visuales/comportamiento**. Ofrece Button, Card, Badge, Field, State, Dialog, iconos, toast y gestión accesible de foco.
- `assets/js/help-center.js`: manual de uso y ayuda contextual opt-in.

Estas cuatro hojas CSS son las únicas capas de producto autorizadas. `app.css` sigue siendo la fuente de verdad de tokens e identidad; las otras tres son capas funcionales deliberadas y no pueden convertirse en temas, overrides o sistemas visuales paralelos.

No se permite crear `styles.css`, `ui-system*.css`, `theme-vN.css`, `components-vN.css`, `fixes.css`, `overrides.css`, `legacy.css` ni otra hoja global paralela.

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
9. Todo control táctil crítico conserva un objetivo mínimo de **44 px** de alto/ancho efectivo en móvil o puntero grueso.

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

Verificar al menos 360, 390/393, 430, 768, 1024 y 1440 px. La barra móvil fija no cubre contenido. Ningún chip/tab impide `pan-y`. Tablas operativas se convierten en listas/cards cuando sea necesario. La capa móvil cubre teléfonos verticales y landscape hasta 900 px, además de dispositivos con `(pointer: coarse)`.

## Accesibilidad

- foco visible;
- contraste legible light/dark;
- estado nunca comunicado sólo por color;
- controles sólo-icono con `aria-label`;
- objetivo táctil crítico mínimo de 44 px;
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
