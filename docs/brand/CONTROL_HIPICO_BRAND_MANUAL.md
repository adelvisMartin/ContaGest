# Manual de Marca y Sistema Visual — Control Hípico

**Estado:** canónico para PWA, Android/APK, documentación y material operativo.  
**Producto:** Control Hípico  
**Principio:** precisión operativa, calma visual, trazabilidad y legibilidad antes que decoración.

## 1. Nombre e identidad

El nombre oficial del producto es **Control Hípico**. Debe escribirse siempre en ese orden y con tilde. La aplicación no utiliza nombres históricos como marca del producto. Los nombres de grupos, clubes o clientes configurados por el usuario son **datos operativos** y no sustituyen la identidad de la aplicación.

La identidad visual usa el logo oficial suministrado: **caballo negro con jinete**, borgoña como color principal y dorado apagado como acento. No se deben usar caballos de ajedrez, emojis como logotipo, gradientes decorativos, sombras de neón ni reinterpretaciones de color del logo.

### Archivos oficiales

- `frontend/public/hipico-control/logo-control-hipico.png`: wordmark/logo principal.
- `icons/icon-192.png` y `icons/icon-512.png`: iconos PWA.
- `icons/icon-192-maskable.png` y `icons/icon-512-maskable.png`: iconos maskable.
- Android genera launcher normal, redondo y adaptativo desde estos assets mediante `configure-branding.mjs`.

### Área de seguridad

Alrededor del logo debe conservarse un espacio libre mínimo equivalente a **1/4 de la altura del isotipo**. No debe pegarse a bordes, textos, badges ni botones. El logo no se estira, no se recorta y no se coloca sobre fondos de bajo contraste.

## 2. Personalidad visual

Control Hípico debe sentirse como una **herramienta operativa profesional**, no como una landing page ni un juego. La interfaz prioriza:

1. lectura rápida;
2. jerarquía clara;
3. acciones previsibles;
4. estados semánticos discretos;
5. densidad suficiente para trabajo real;
6. consistencia entre escritorio, PWA y Android.

Se evita: exceso de color, tarjetas gigantes, pesos 800/900, sombras profundas, blur decorativo, bordes redondeados excesivos, animaciones llamativas y duplicación de componentes.

## 3. Paleta canónica

Los únicos tokens globales de UI viven en `assets/css/app.css` y usan prefijo `--hc-`.

### Tema claro

| Rol | Valor | Uso |
|---|---|---|
| Fondo | `#f7f7f6` | lienzo principal |
| Superficie | `#ffffff` | cards, dialogs, inputs |
| Superficie sutil | `#f2f2f0` | estados secundarios |
| Texto | `#202221` | contenido principal |
| Texto secundario | `#6b706d` | ayudas y metadatos |
| Borde | `#deded9` | separación estructural |
| Borgoña | `#721522` | marca y acción primaria |
| Dorado apagado | `#8d7545` | acento/foco selectivo |
| Éxito | `#35705a` | confirmación/estado sano |
| Advertencia | `#8a682f` | revisión requerida |
| Error | `#9b4750` | bloqueo/error real |
| Información | `#526f86` | dato informativo |

### Tema oscuro

El tema oscuro usa fondo carbón y superficies neutrales. El borgoña se eleva a una variante más clara para mantener contraste. No se introducen fondos radiales, glow ni gradientes decorativos.

### Regla de color semántico

Verde significa éxito/seguro; amarillo o dorado significa revisión/advertencia; rojo significa error/peligro; azul significa información. No se usan estos colores sólo para adornar.

Los colores configurables de cada grupo se emplean únicamente como **acento local** para identificarlo, nunca para redefinir toda la aplicación.

## 4. Tipografía

Fuente de interfaz: `Inter` cuando está disponible, con fallback a la pila del sistema.

- texto pequeño/metadatos: 10–12 px;
- texto operativo: 13–14 px;
- encabezado de sección: 17–21 px;
- encabezado principal: 22–30 px;
- login excepcional: hasta 48 px en escritorio.

Pesos recomendados: **400, 500, 600 y 700**. No se usan 800/900 como recurso de jerarquía habitual.

Los datos monoespaciados, chat crudo, JSON y planos usan `ui-monospace / SFMono-Regular / Consolas`.

## 5. Espaciado, radios y sombras

Escala práctica: 4, 6, 8, 10, 12, 14, 16, 18, 24, 28, 38 px.

Radios canónicos:

- 6 px: microelementos;
- 8 px: tabs/chips;
- 10 px: inputs y botones;
- 12 px: cards/dialogs habituales;
- 14 px: contenedores principales.

Sombras: sólo para elevación real (dialog, toast, help center). Cards comunes usan borde y una sombra mínima.

## 6. Componentes canónicos

La PWA es JavaScript directo y no incorpora React sólo para obtener componentes. `assets/js/ui.js` implementa primitivas de comportamiento y markup inspiradas en shadcn/Radix, manteniendo la arquitectura independiente de Control Hípico.

Primitivas obligatorias:

- `Button`: default, primary, success, danger, ghost, small/xl.
- `Card`: header, description, body y acciones.
- `Badge`: neutral, success, warning, danger, info.
- `Field`: label + control + ayuda.
- `Tabs`: navegación local compacta.
- `Dialog/Sheet`: mismo componente; en móvil se presenta como bottom sheet.
- `Toast`: notificación apilable, no bloqueante, equivalente funcional a react-hot-toast.
- `State`: loading/empty/error/info sin inventar layouts por pantalla.
- Help Center: asistencia opt-in.

### Regla de gobernanza

No se permite crear `*-v2.css`, `*-v3.css`, `fixes.css`, `overrides.css`, `legacy.css` ni otra hoja global paralela. Una necesidad nueva debe resolverse dentro del componente o de `app.css` con selector acotado.

## 7. Botones y acciones

Una pantalla debe tener como máximo una acción primaria dominante por contexto. Acciones secundarias usan botón neutro o ghost. Acciones destructivas usan danger y, cuando tienen consecuencias irreversibles, confirmación.

Targets táctiles: aproximadamente **40–44 px** en los controles principales. Los iconos nunca sustituyen una etiqueta cuando el significado no sea obvio; icon-only exige `aria-label`.

## 8. Formularios

Cada input debe tener `label` visible o nombre accesible inequívoco. La ayuda breve se coloca debajo del campo. Los errores explican qué corregir; no se debe usar sólo color.

Contraseñas:

- nunca se almacenan en `hipico_users` ni tablas de aplicación;
- nunca se muestran al administrador;
- Supabase Auth conserva el hash bcrypt;
- la UI sólo muestra `Configurada`, `Requiere cambio` o `Sin verificar` y ofrece recuperación segura.

## 9. Dialogs, sheets y toasts

Dialogs:

- desktop: centrados;
- móvil: sheet desde la parte inferior;
- `role="dialog"`, `aria-modal="true"`;
- foco entra al abrir, queda atrapado dentro y vuelve al elemento de origen al cerrar;
- Escape cierra cuando la operación lo permite.

Toasts:

- no bloquean la pantalla;
- duran ~4.2 s normalmente y más en error;
- título + mensaje breve;
- cierre manual;
- `role=status` o `alert` según severidad.

## 10. Responsive y móvil

El diseño es mobile-first en comportamiento aunque comparta markup con escritorio.

Reglas críticas:

- **scroll vertical natural siempre**;
- la barra inferior permanece fija sin cubrir contenido;
- ningún chip, tab o selector captura el gesto vertical de la página;
- tablas complejas cambian a cards responsivas;
- dialogs se vuelven bottom sheets;
- grids pasan 4→2→1 columnas según el espacio;
- no hay contenido horizontal obligatorio para operar.

## 11. Accesibilidad

- foco visible y contraste legible;
- `prefers-reduced-motion` elimina animaciones innecesarias;
- regiones live sólo para mensajes importantes;
- iconos decorativos son `aria-hidden`;
- controles sólo-icono llevan `aria-label`;
- modal conserva foco y cierre por teclado;
- no se comunica estado sólo por color.

## 12. Ayuda y onboarding

La aplicación incorpora un **Manual de uso bajo demanda** mediante `help-center.js`.

Nunca se abre automáticamente. El usuario puede:

- abrir Ayuda cuando la necesite;
- buscar por concepto;
- navegar por módulos;
- activar/desactivar ayuda contextual sutil.

La ayuda contextual sólo añade descripciones/títulos a controles clave; no muestra popups ni interrumpe captura.

## 13. WhatsApp: lenguaje de seguridad

Durante QA:

- **SOURCE = sólo lectura**;
- **LAB = único destino de escritura/simulación**;
- una sugerencia del parser no equivale a aprobación monetaria;
- casos ambiguos o monetarios pasan por revisión humana según los gates vigentes.

La UI debe expresar esta separación de forma directa y estable.

## 14. Iconografía

La iconografía usa SVG lineal de 1.8 px desde la biblioteca interna de `ui.js`. Se evita mezclar familias visuales o usar emojis como controles primarios.

## 15. Microcopy

Preferir textos breves y operativos:

- “Guardar” en vez de “Proceder a guardar cambios”.
- “Requiere revisión” en vez de “Advertencia importante”.
- “Sin carrera abierta” en vez de un mensaje técnico.

Mensajes de error deben indicar el siguiente paso posible.

## 16. Control de cambios visuales

Toda modificación visual debe verificar:

- light/dark/system;
- 360/390/430/768/1024/1440 px;
- scroll vertical;
- teclado y foco;
- modal/toast;
- loading/empty/error/success/disabled;
- PWA y paridad Android.

`app.css` y `ui.js` son las únicas autoridades globales. Si una regla antigua reaparece, el contrato zero-legacy debe fallar.
