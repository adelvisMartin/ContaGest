# Control Hípico — UI System v2

Esta guía es la autoridad visual para nuevas pantallas y para la migración gradual de estilos legacy.

## Principio

Control Hípico es una herramienta operativa, no una landing page. La interfaz debe priorizar lectura rápida, jerarquía, baja carga visual y estados inequívocos. El color comunica acción o estado; no se usa como decoración general.

## Tipografía

| Rol | Tamaño | Peso | Uso |
| --- | --- | --- | --- |
| Caption / metadata | 12 px | 400–500 | horas, ids, ayuda secundaria |
| Label / compact UI | 13 px | 500 | labels, tabs, badges |
| Body / control | 14 px | 400–500 | párrafos, inputs, botones |
| Card title | 16 px | 600 | títulos internos |
| Section title | 20 px | 600 | bloques importantes |
| Page title | 22–28 px | 600 | encabezado principal |
| Display/auth | 26–32 px | 600 | sólo acceso/onboarding |

Reglas:

- Pesos normales: 400, 500, 600 y 700.
- 800/900 quedan reservados a arte de marca si fuese imprescindible; no se usan en badges, labels, botones o párrafos.
- Body usa line-height 1.5; textos explicativos pueden usar 1.6.
- Datos monetarios/resultados usan cifras tabulares.
- No reducir texto funcional por debajo de 12 px.

## Color

- `surface` y `surface-muted` dominan la interfaz.
- `brand` se reserva para CTA principal, foco o selección relevante.
- `success`, `warning`, `danger` e `info` se usan sólo cuando existe semántica real.
- Un estado no necesita simultáneamente fondo fuerte + borde fuerte + texto fuerte + icono fuerte.
- Preferir superficie neutra + una señal semántica pequeña.
- Dark mode usa carbón neutro, no fondos verde/azul saturados.

## Spacing

La escala parte de 4 px. Preferencias comunes:

- 8 px: relación muy cercana.
- 12 px: controles compactos.
- 16 px: padding estándar de cards.
- 20–24 px: modal/section spacing.
- 32 px+: separación entre secciones completas.

No introducir valores arbitrarios si la escala existente resuelve el caso.

## Radios

- Controles: 8 px.
- Cards: 10 px.
- Modales: 12 px.
- Superficies grandes especiales: máximo 14 px.
- `999px` sólo para badges/chips/dots.

## Sombras

- Cards normales: sin sombra o `shadow-1` casi imperceptible.
- Elevación temporal: `shadow-2`.
- Modal: `shadow-dialog`.
- Evitar sombras grandes coloreadas.

## Botones

- Altura táctil mínima: 44 px en controles principales.
- Fuente: 14 px / 500.
- Primary: un único CTA dominante por contexto cuando sea posible.
- Success/danger no deben convertirse en grandes bloques coloreados; puede bastar texto/borde semántico.
- Hover no debe mover el layout (`translateY` queda desaconsejado).

## Inputs

- Altura mínima: 44 px.
- Texto: 14 px.
- Label: 13 px / 500.
- Focus usa ring visible; no depende sólo de cambio de color.
- Error debe incluir mensaje textual además del color.

## Badges

- Altura aproximada: 22–24 px.
- Texto: 12 px / 500.
- Variante neutral por defecto.
- Variantes semánticas sólo para estados reales.
- Un badge no reemplaza un título ni un botón.

## Cards y KPIs

- Fondo neutro, borde sutil.
- KPI usa tamaño suficiente para el dato pero no compite con el título de página.
- Danger/alerta se expresa primero por borde/texto; evitar teñir toda la card salvo emergencia real.

## Modales / drawers

- Desktop: ancho contenido, radio 12 px, header/body/footer consistentes.
- Mobile: bottom sheet permitido; sólo radios superiores moderados.
- Backdrop sin blur agresivo.
- Título 16 px / 600; body 14 px.
- Acción destructiva claramente separada.
- Scroll interno sólo cuando el contenido excede el viewport.

## Toasts

Patrón visual equivalente a react-hot-toast: breve, discreto y no bloqueante.

- Superficie neutra.
- Icono pequeño.
- Título 13 px / 600.
- Mensaje 12 px.
- Color semántico sólo en el icono/progreso/borde necesario.
- No tapar navegación móvil.
- Debe poder cerrarse.

## Navegación

- Estado activo distinguible sin un gran bloque de color.
- Icono y texto mantienen alineación y espacio constante.
- Mobile conserva targets táctiles adecuados.
- La navegación nunca debe impedir scroll vertical natural del documento.

## Responsive

- Mobile first para cambios nuevos.
- Verificar 360, 390/393, 430, 768, 1024 y desktop amplio cuando aplique.
- Evitar texto truncado si contiene monto, participante, estado o acción crítica.
- Las tablas que no caben deben convertirse en lista/card o scroll horizontal explícito, nunca provocar overflow global.

## Accesibilidad

- Focus visible.
- Contraste suficiente en light/dark.
- No usar sólo color para estado.
- `prefers-reduced-motion` elimina animaciones no esenciales.
- Touch targets principales >=44 px.

## Regla de arquitectura

`assets/css/ui-system-v2.css` se carga al final y actúa como autoridad temporal mientras se elimina deuda legacy. Nuevo código no debe añadir redefiniciones globales de `:root`, colores hex repetidos, pesos 800/900, radios arbitrarios o nuevas capas de override sin justificación.

Cuando un componente requiera una excepción de dominio, debe basarse en estos tokens y documentar la razón.
