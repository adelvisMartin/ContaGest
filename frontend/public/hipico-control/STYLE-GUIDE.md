# Control Hípico — Style Guide canónica

Esta guía define la única línea visual permitida para la PWA y el wrapper Android. El manual de marca completo vive en `docs/brand/CONTROL_HIPICO_BRAND_MANUAL.md`.

## Autoridades únicas

- `assets/css/app.css`: **única hoja CSS global**. Es la materialización vigente de UI System v2 e incluye tokens, light/dark/system, layout, responsive, formularios, navegación, cards, tablas, dialogs, toasts, WhatsApp, acceso, centro operativo y Help Center.
- `assets/js/ui.js`: **única biblioteca de primitivas visuales/comportamiento**. Ofrece Button, Card, Badge, Field, State, Dialog, iconos, toast y gestión accesible de foco.
- `assets/js/help-center.js`: manual de uso y ayuda contextual opt-in.
- `assets/js/theme-bootstrap.js`: bootstrap visual previo al CSS. Sólo persiste `system`, `light` o `dark`; el workspace sigue siendo la autoridad funcional del tema.
- `assets/js/command-center.js`: renderer fail-closed del read model operativo; no aplica efectos ni autoridad financiera.
- `assets/js/command-center-shell.js`: adaptador UI que consume únicamente la clave local validada del grupo activo y nunca publica JID ni identidad SOURCE.

La deuda histórica no se resuelve agregando otra capa al final del cascade. No se permite crear `styles.css`, `ui-system*.css`, `theme-vN.css`, `components-vN.css`, `operations-pro.css`, `mobile-accessibility.css`, `operational-copy-center.css`, `fixes.css`, `overrides.css`, `legacy.css` ni otra hoja global paralela. Las excepciones de dominio deben integrarse en `app.css`, reutilizar tokens y quedar cubiertas por contratos.

## Identidad

Nombre oficial: **Control Hípico**.

Assets oficiales: `logo-control-hipico.png`, `icons/icon-192.png`, `icon-512.png` y variantes maskable. Los nombres de grupos son datos operativos configurables y no reemplazan la marca de la aplicación.

## Principios

1. Herramienta operativa, no landing page.
2. Superficies neutrales; borgoña para identidad, selección, foco y acción primaria.
3. Estados semánticos discretos y comprensibles. `success`, `warning`, `danger` e `info` sólo comunican significado real; no decoran superficies completas.
4. Pesos permitidos en UI común: **400 / 500 / 600 / 700**. `800/900` quedan reservados únicamente a una excepción de marca justificada; no se usan en controles, badges, labels ni microcopy.
5. Borde antes que sombra; elevación sólo para dialog, toast, menús flotantes y ayuda cuando hace falta separar planos.
6. Scroll vertical natural siempre, especialmente en móvil y captura.
7. Un CTA principal por contexto cuando sea posible.
8. Focus visible y soporte de `prefers-reduced-motion`.
9. Radius estándar de cards/controles: **8–12 px**. El pill completo se reserva para badges/chips y elementos geométricos no interactivos.
10. Ningún CSS de dominio puede redefinir tokens globales o convertirse en una autoridad visual posterior.
11. Un fallo de lectura nunca se presenta como cero, vacío sano o éxito.
12. SOURCE y LAB se distinguen por texto y estado, nunca sólo por color.

## Escala tipográfica

- Body: **14 px** base y `line-height: 1.5`; puede crecer de forma controlada hasta 16 px según superficie/viewport.
- Caption/metadata: **12 px**.
- Label/control: **13–14 px**.
- Card title: **14–16 px**.
- Page title: **22–28 px**.
- Display/login: **máximo 32 px en desktop**, menor en mobile.
- Modal/dialog title: **16–18 px**.

No se introducen escalas display de 40–72 px en superficies operativas.

## Color y superficies

- Fondo y cards permanecen neutrales en light y dark.
- La marca se reserva para CTA, selección y foco; no se usa como relleno decorativo repetido.
- Los estados semánticos priorizan icono, texto y borde sobre un fondo saturado.
- Light/dark conservan la misma geometría y jerarquía.
- Colores arbitrarios hard-coded fuera de los tokens están prohibidos, salvo el color de grupo validado como dato de dominio y excepciones de impresión/contraste explícitamente justificadas.

## Componentes

Las primitivas son equivalentes conceptualmente a shadcn/Radix sin introducir React dentro de la PWA independiente:

- Button: default/primary/success/danger/ghost, small/xl; 44 px de touch target cuando aplique.
- Card: header, descripción, cuerpo y acciones; radio 8–12 px, borde como separador y sombra mínima.
- Badge: neutral/success/warning/danger/info; **22–24 px**, **12 px / 500–600**, pill permitido aquí y semántica sólo cuando aporta significado.
- Field: label/control/ayuda; labels 13–14 px y foco visible.
- Tabs: compactas y desplazables cuando hace falta.
- Dialog: centrado en desktop con radio aproximado de **12 px** y bottom sheet en móvil con radio superior moderado; backdrop sin blur agresivo, foco atrapado y Escape.
- Toast: apilable, no bloqueante, superficie neutral, borde sutil, icono semántico pequeño, cierre manual y `aria-live`; nunca usa un bloque de color intenso por estado.
- State: loading/empty/error/info coherentes.
- KPI: jerarquía contenida, valores completos y semántica de color sólo para excepciones reales.
- Alert/notice: superficie neutral por defecto; significado mediante borde/icono/texto antes que relleno saturado.
- Centro operativo: usa los mismos tokens, radios, tipografía, foco y contratos touch de la aplicación; no mantiene una mini-guía visual separada.
- Contenido operativo largo: `details/summary` nativo cuando aporta expansión accesible por teclado sin ocultar la evidencia.

## Modales y toasts

Los modales mantienen header/body/footer con espaciado estable. En desktop se limitan por viewport y en mobile se convierten en bottom sheet sin impedir el scroll natural del contenido. No se añade blur fuerte al backdrop.

Los toasts se ubican de forma estable en un borde del viewport, permanecen fuera de la navegación móvil y no bloquean interacción. El icono es secundario al mensaje; éxito/error/advertencia/información cambian el acento semántico, no la superficie completa.

## Command Center — contrato #289

El Command Center es un **read model observable**, no una consola con autoridad implícita. Consume el BFF autenticado `/api/hipico/command-center`; el browser no recibe el token de operador del backend.

Estados de UI: `loading`, `empty`, `error`, `success`, `offline`, `stale`, `unavailable`, `not_configured` y `degraded`. Una lectura fallida se muestra como **No disponible**, nunca como cero. Backend, PostgreSQL, Bridge, Canal, Providers y Agente comunican estado mediante texto + badge. El botón de reintento conserva un target táctil mínimo de 44 px.

`SOURCE · SOLO LECTURA` significa observación/ingesta sin autosend productivo. `LAB · QA / SIMULACIÓN` es el único destino controlado de pruebas y no concede autoridad financiera. El shell sólo usa la clave local `[A-Za-z0-9._:-]{3,120}`; JID, `groupId` SOURCE, tokens y secretos no se publican en DOM ni storage visual.

## Tema `system` / `light` / `dark`

`theme-bootstrap.js` ejecuta antes de `app.css` para reducir el flash visual y sólo persiste el enum `system`, `light` o `dark`. Una vez cargado el workspace, `workspace.config.theme` conserva la autoridad. El objetivo de contraste es **WCAG AA** en light y dark; `system` respeta `prefers-color-scheme`.

## Responsive

Verificar al menos **360, 390/393, 430, 768, 1024 y 1440 px**. La barra móvil fija no cubre contenido. Ningún chip/tab impide `pan-y`. Tablas operativas se convierten en listas/cards cuando sea necesario. En dispositivos coarse/telefonía landscape, los controles críticos preservan un target mínimo de **44 px**.

El Command Center debe envolver texto y evitar anchos mínimos que fuercen scroll horizontal global. A **200% de zoom** deben conservarse navegación, foco, lectura de estados y acción de reintento. Safe areas, landscape, teclado virtual y scroll vertical natural forman parte del contrato móvil.

## Accesibilidad

- foco visible y retorno de foco;
- contraste legible light/dark con objetivo WCAG AA;
- estado nunca comunicado sólo por color;
- controles sólo-icono con `aria-label`;
- dialogs con `role=dialog`, `aria-modal`, foco inicial, trap y retorno de foco;
- `prefers-reduced-motion` / reduced motion, incluido scroll no animado;
- mensajes de error indican el siguiente paso;
- navegación completa por teclado; Enter/Espacio operan botones y `details/summary`;
- regiones dinámicas usan `aria-live`, `role=status` o `aria-busy` según corresponda.

## Contraseñas

Control Hípico **nunca almacena ni muestra una contraseña**. Supabase Auth conserva el hash. La aplicación sólo muestra estado no secreto: `Configurada`, `Requiere cambio` o `Sin verificar`, y permite enviar recuperación.

## Ayuda

El Help Center nunca se abre automáticamente. La ayuda contextual puede añadir `title`/descripciones a controles clave, pero no muestra popups por sí sola.

## WhatsApp / SOURCE / LAB

Durante QA: **SOURCE es sólo lectura** y **LAB es el único destino de escritura/simulación**. Ningún cambio visual, ayuda, agente o tema puede relajar esta regla.

## Evidencia y gates

Un cambio visual no se considera validado sólo por inspección. Para el SHA final se requieren, cuando el runner lo permita, evidencia de teclado/foco, 200% zoom, light/dark/system, reduced motion, 360/390/430/768/1024/1440 px, estados loading/empty/error/offline/stale/unavailable/retry, contraste WCAG AA, PWA offline/reconexión y paridad Android/PWA. Si un runner o navegador no ejecuta, el estado es `BLOCKED`/`NOT VERIFIED`, nunca PASS.

## Regla de mantenimiento

Antes de añadir una regla, usar los tokens/componente existentes y ubicarla dentro del propietario canónico correspondiente en `app.css`. Un color dinámico de grupo puede entrar como dato de dominio después de validarse; ningún otro hex arbitrario debe introducirse desde JS/HTML. Toda excepción se documenta y se cubre con prueba.

Los contratos `tests/hipico_ui_system_v2_issue_266.test.mjs`, `tests/hipico_ui_release_contract_277.test.mjs`, `tests/hipico_mobile_touch_targets_297.test.mjs` y `tests/hipico_command_center_289_contract.test.mjs` protegen esta arquitectura. Si una nueva funcionalidad necesita CSS, se amplía la capa canónica; **no se crea un stylesheet posterior para “ganar” el cascade**.
