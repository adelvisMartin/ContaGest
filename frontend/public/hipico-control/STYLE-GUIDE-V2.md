# Control Hípico — Style Guide canónica

Esta guía define la única línea visual permitida para PWA, recovery y wrapper Android de Control Hípico.

## Principio

Control Hípico es una herramienta operativa, no una landing page. La interfaz prioriza lectura rápida, jerarquía, baja carga visual, accesibilidad y estados inequívocos. El color comunica acción o estado; no decora superficies sin necesidad.

## Arquitectura visual

- `assets/css/styles.css`: compatibilidad **estructural** temporal (grid, flex, responsive, overflow y layouts históricos todavía utilizados).
- `assets/css/ui-system.css`: **única autoridad visual** de tokens, tipografía, color, radios, sombras, botones, inputs, badges, cards, modales, toasts, navegación, auth y estados.
- No crear `theme-vN.css`, `components-vN.css`, `fixes.css`, overrides de release ni nuevas cadenas de CSS acumulativas.
- Toda nueva regla visual debe entrar en `ui-system.css` o ser un componente de dominio expresamente documentado.
- La migración de estructura desde `styles.css` debe ser progresiva y con pruebas; no se reintroducen reglas visuales allí.

## Identidad oficial

La identidad oficial es el diseño de **caballo negro con jinete, pista borgoña y acento dorado**.

Assets canónicos:

- `logo-control-hipico.png`: wordmark/logo horizontal.
- `icons/icon-192.png` y `icons/icon-512.png`: iconos PWA/app.
- `icons/icon-192-maskable.png` y `icons/icon-512-maskable.png`: variantes maskable.

No utilizar monogramas `HC`, caballos de ajedrez, texto “Triple Crown” ni marcas históricas como identidad del producto. Los nombres de grupos de clientes son datos configurables, no branding de la aplicación.

## Tipografía

| Rol | Tamaño | Peso | Uso |
| --- | --- | --- | --- |
| Caption / metadata | 12 px | 400–500 | horas, ids, ayuda secundaria |
| Label / compact UI | 13 px | 500 | labels, tabs, badges |
| Body / control | 14 px | 400–500 | párrafos, inputs, botones |
| Card title | 16 px | 600 | títulos internos |
| Section title | 20 px | 600 | bloques importantes |
| Page title | 22–28 px | 600 | encabezado principal |
| Display/auth | 26–32 px | 600 | acceso/onboarding |

Pesos permitidos en UI: 400, 500, 600 y 700. No usar 800/900 en badges, labels, botones, KPIs o párrafos. Body usa line-height 1.5; copy explicativo puede usar 1.6. Datos monetarios y resultados usan cifras tabulares.

## Color

- Superficies neutrales dominan la aplicación.
- Borgoña de marca se reserva para CTA principal, foco o selección relevante.
- Dorado se reserva para acentos puntuales/foco, nunca como fondo dominante.
- `success`, `warning`, `danger` e `info` sólo expresan semántica real.
- Evitar fondo + borde + texto + icono todos intensos al mismo tiempo.
- Dark mode usa carbón neutro, sin gradientes decorativos ni tintes verdes/azules dominantes.

## Espaciado y geometría

Escala base de 4 px. Usar preferentemente 8, 12, 16, 20, 24, 32, 40 y 48 px.

- Controles: radio 8 px.
- Cards/KPIs: radio 10 px.
- Modales: radio 12 px.
- Superficies excepcionales: máximo 14 px.
- Pill `999px`: sólo badges, chips, indicadores y controles que realmente lo requieran.
- Touch target principal: mínimo 44 px.

## Sombras

- Cards normales: sin sombra o sombra casi imperceptible.
- Elevación temporal: `--hc-shadow-2`.
- Modal: `--hc-shadow-dialog`.
- Prohibidas sombras grandes coloreadas y elevación ornamental.

## Botones e inputs

- Botón/control principal: 44 px mínimo.
- Texto de control: 14 px / 500.
- Un CTA primario dominante por contexto cuando sea posible.
- Destructivo y success pueden usar color de texto/borde; no necesitan bloques saturados.
- Hover no desplaza el layout.
- Label: 13 px / 500.
- Focus siempre visible mediante ring, no sólo color.
- Error incluye texto comprensible además de color.

## Badges

- Altura aproximada: 22–24 px.
- Texto: 12 px / 500.
- Variante neutral por defecto.
- Semánticos sólo para estados reales.
- No usar badges como decoración ni para repetir información ya evidente.

## Cards y KPIs

Fondo neutral y borde sutil. El KPI debe destacar el dato sin competir con el título de página. Danger se expresa preferentemente por borde/texto, no tiñendo toda la card.

## Modales / drawers

- Desktop: ancho contenido, radio 12 px, header/body/footer consistentes.
- Mobile: bottom sheet permitido, con radios superiores moderados.
- Backdrop oscuro sobrio, sin blur agresivo.
- Título 16 px / 600; body 14 px.
- Acción destructiva claramente separada.
- Scroll interno sólo si el contenido excede el viewport.

## Toasts

Patrón equivalente a react-hot-toast, sin incorporar la librería al runtime actual:

- superficie neutral;
- icono pequeño;
- título 13 px / 600;
- mensaje 12 px;
- color semántico puntual;
- cierre disponible;
- no bloquea navegación ni contenido crítico en mobile.

## Navegación

El estado activo se distingue sin grandes bloques de color. Icono y texto mantienen alineación constante. La navegación fija móvil nunca debe impedir el scroll vertical natural.

## Responsive

Diseñar mobile first y verificar como mínimo 360, 390/393, 430, 768, 1024 y desktop amplio. No truncar montos, nombres, estados o acciones críticas. Tablas grandes deben transformarse en cards/listas o usar scroll horizontal explícito, nunca overflow global.

## Accesibilidad

- Focus visible.
- Contraste suficiente en light/dark.
- Nunca depender sólo del color.
- `prefers-reduced-motion` elimina animación no esencial.
- Targets principales >=44 px.
- Estados disabled mantienen legibilidad y contexto.

## Auth y roles

Auth usa la misma jerarquía visual que el producto. Recuperación de contraseña no crea otra identidad gráfica. La pantalla de usuarios/roles usa controles estándar, badges compactos y mensajes explícitos; un rol nunca se comunica sólo por color.

## Regla de mantenimiento

Antes de introducir un nuevo valor visual, buscar un token/componente existente. No añadir hex, radios, sombras, pesos ni escalas arbitrarias en `styles.css`, HTML inline o JS generado salvo un dato de dominio dinámico (por ejemplo, color configurado de un grupo). Una excepción debe estar justificada y cubierta por prueba visual/funcional.
