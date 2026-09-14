# Control Hípico — Style Guide canónica

Esta guía define la única línea visual permitida para la PWA y el wrapper Android. El manual de marca completo vive en `docs/brand/CONTROL_HIPICO_BRAND_MANUAL.md`.

## Autoridades únicas

- `assets/css/app.css`: **única hoja CSS global**. Es la materialización vigente de UI System v2 e incluye tokens, light/dark/system, layout, responsive, formularios, navegación, cards, tablas, dialogs, toasts, WhatsApp, acceso, centro operativo y Help Center.
- `assets/js/ui.js`: **única biblioteca de primitivas visuales/comportamiento**. Ofrece Button, Card, Badge, Field, State, Dialog, iconos, toast y gestión accesible de foco.
- `assets/js/help-center.js`: manual de uso y ayuda contextual opt-in.
- `assets/js/theme-bootstrap.js`: bootstrap mínimo previo al CSS. Sólo recuerda `system`, `light` o `dark`; al cargar la aplicación completa `workspace.config.theme` vuelve a ser la autoridad funcional.
- `assets/js/command-center.js`: renderer fail-closed del estado operativo canónico; no aplica efectos ni autoridad financiera.
- `assets/js/command-center-shell.js`: adaptador UI que consume únicamente la clave local visible del grupo activo y monta el Command Center sin publicar JID ni identidad SOURCE.

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
11. Un fallo de lectura nunca se representa como cero, vacío sano o éxito.
12. SOURCE y LAB deben diferenciarse por texto y estado, nunca sólo por color.

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
- Fila expandible: `details/summary` nativo para contenido largo; Enter/Espacio funcionan sin JavaScript adicional y el contenido permanece disponible a 200% de zoom.

## Modales y toasts

Los modales mantienen header/body/footer con espaciado estable. En desktop se limitan por viewport y en mobile se convierten en bottom sheet sin impedir el scroll natural del contenido. No se añade blur fuerte al backdrop.

Los toasts se ubican de forma estable en un borde del viewport, permanecen fuera de la navegación móvil y no bloquean interacción. El icono es secundario al mensaje; éxito/error/advertencia/información cambian el acento semántico, no la superficie completa.

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

Las tarjetas de Backend, PostgreSQL, Bridge, Canal, Providers y Agente comunican estado mediante texto + badge. Para alertas o documentos con texto grande se usa expansión nativa mediante `details/summary`; no se trunca la única evidencia disponible.

La identidad de grupo enviada por el shell es sólo la clave local validada `[A-Za-z0-9._:-]{3,120}`. El browser no publica ni deriva JID, `groupId` SOURCE ni secretos del backend. Si el backend no puede resolver la identidad necesaria para el agente, el estado correcto es `GROUP_ID_NOT_SELECTED` / `not_configured`.

## Tema `system` / `light` / `dark`

`theme-bootstrap.js` corre antes de `app.css` para reducir el flash visual. Ese bootstrap sólo persiste el enum visual. Una vez cargado el workspace, `workspace.config.theme` es la autoridad y actualiza `data-theme`; el bootstrap refleja ese valor para la próxima carga. No se persisten tokens, sesiones, grupo SOURCE ni datos operativos en esa clave.

El contraste objetivo es **WCAG AA** tanto en `light` como en `dark`. `system` sigue `prefers-color-scheme` a través de las reglas canónicas existentes. La validación visual real de contraste sigue siendo un gate de QA y no puede sustituirse por esta documentación.

## Responsive

Verificar al menos **360, 390/393, 430, 768, 1024 y 1440 px**. La barra móvil fija no cubre contenido. Ningún chip/tab impide `pan-y`. Tablas operativas se convierten en listas/cards cuando sea necesario. En dispositivos coarse/telefonía landscape, los controles críticos preservan un target mínimo de **44 px**.

En Command Center, matrices y listas deben envolver texto sin imponer ancho mínimo a la página. Alertas y documentos grandes son expandibles. A **200% de zoom** deben conservarse navegación, foco, estado y acción de reintento sin scroll horizontal de página.

## Accesibilidad

- foco visible;
- contraste legible light/dark con objetivo WCAG AA;
- estado nunca comunicado sólo por color;
- controles sólo-icono con `aria-label`;
- dialogs con `role=dialog`, `aria-modal`, foco inicial, trap y retorno de foco;
- `prefers-reduced-motion`, incluido scroll no animado;
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

Un cambio visual no se considera validado sólo por inspección de fuente. El gate de #289 debe conservar evidencia del SHA exacto para teclado/foco, 200% de zoom, light/dark/system, reduced motion, viewports objetivo, estados loading/empty/error/offline/stale/unavailable/not_configured/retry, contraste WCAG AA, PWA offline/reconexión y paridad Android/PWA.

Si un runner, navegador, Android build o proveedor no ejecuta, el estado se reporta `BLOCKED`/`NOT VERIFIED`; nunca como PASS.

## Regla de mantenimiento

Antes de añadir una regla, usar los tokens/componente existentes y ubicarla dentro del propietario canónico correspondiente en `app.css`. Un color dinámico de grupo puede entrar como dato de dominio después de validarse; ningún otro hex arbitrario debe introducirse desde JS/HTML. Toda excepción se documenta y se cubre con prueba.

Los contratos `tests/hipico_ui_system_v2_issue_266.test.mjs`, `tests/hipico_ui_release_contract_277.test.mjs` y `tests/hipico_mobile_touch_targets_297.test.mjs` protegen esta arquitectura. Si una nueva funcionalidad necesita CSS, se amplía la capa canónica; **no se crea un stylesheet posterior para “ganar” el cascade**.