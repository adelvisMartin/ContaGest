# ContaGest Design System v11.15

Fecha de referencia: 2026-08-09.

## Principios

1. **Enterprise moderno, no plantilla genérica.** Interfaz sobria, limpia, densa cuando corresponde y con jerarquía clara.
2. **Contraste semántico.** En superficies oscuras siempre se usan textos claros; los colores de estado nunca sustituyen texto o iconografía.
3. **Mobile first real.** Ningún control crítico depende de hover, no se aceptan botones cortados, scroll horizontal de página ni banners que tapen contenido operativo.
4. **Consistencia.** Logo, iconografía, radios, sombras, campos, tablas, botones y estados siguen los mismos tokens.
5. **Accesibilidad.** Objetivo WCAG AA para texto normal; foco visible de 3 px; controles táctiles de al menos 44 px cuando el espacio lo permite.

## Marca

- Símbolo oficial: `/icons/contagest-app.svg`.
- Iconos PWA: `/icons/contagest-app-192.svg` y `/icons/contagest-app-512.svg`.
- Logotipo horizontal: `/brand/contagest-logo.svg`.
- Concepto: una **C** abierta representa control/ContaGest; las tres barras ascendentes representan crecimiento, analítica y gestión financiera.
- No deformar, recolorear arbitrariamente ni colocar sobre fondos sin contraste.

## Tokens semánticos

Los tokens implementados viven en `frontend/src/styles/theme-v1115.css`.

### Tema claro

| Token | Valor | Uso |
|---|---:|---|
| Fondo | `#F3F6FB` | página |
| Superficie | `#FFFFFF` | cards/modales |
| Superficie secundaria | `#F7F9FC` | campos/bloques suaves |
| Texto principal | `#0B1526` | títulos/datos |
| Texto secundario | `#34465D` | contenido |
| Muted | `#5F7188` | ayudas/metadatos |
| Borde | `#D8E1EC` | divisores/campos |
| Primary | `#215FD1` | acciones principales |
| Accent | `#4F46E5` | énfasis/selección |
| Success | `#12805C` | confirmado/activo |
| Warning | `#A96308` | atención |
| Danger | `#B42318` | errores/destructivo |

### Tema oscuro

| Token | Valor | Uso |
|---|---:|---|
| Fondo | `#06101E` | página |
| Superficie | `#0D1B2D` | cards/modales |
| Superficie secundaria | `#12243A` | campos/bloques |
| Texto principal | `#F7FBFF` | títulos/datos |
| Texto secundario | `#D8E5F2` | contenido |
| Muted | `#AEC0D2` | ayudas/metadatos |
| Borde | `#29435F` | divisores/campos |
| Primary | `#60A5FA` | acciones/enlaces |
| Accent | `#818CF8` | selección |
| Success | `#6EE7B7` | confirmado/activo |
| Warning | `#FBBF24` | atención |
| Danger | `#FDA4AF` | errores/destructivo |

## Tipografía

- Fuente: `Inter`, con fallback `system-ui`, `Segoe UI`, `Arial`.
- Títulos: 750–900 de peso; tracking ligeramente negativo.
- Cuerpo: 600–700 en UI compacta.
- Microcopy: nunca menor a 11 px en información necesaria para operar.
- Números financieros: tabular cuando aplique.

## Componentes

### Botón primario

Gradiente azul → índigo y texto blanco. No se permite texto oscuro sobre primary/accent.

### Botón secundario

Superficie del tema + borde semántico + texto principal.

### Cards

Radio base 16 px. Sombra ligera. No usar más de dos niveles de elevación simultáneos en una misma sección.

### Formularios

Campos de 44 px o más, borde visible, placeholder distinto del texto real y foco azul de 3 px.

### Tablas

Header contrastado; filas con divisores sutiles. En móvil la tabla puede tener scroll horizontal **interno**, nunca debe provocar overflow de toda la página.

### KPI

Primer KPI puede usar superficie de alto contraste; el resto conserva fondo neutro. Una métrica nunca depende solo del color.

### CAPTCHA

El reto usa fondo azul profundo. `RESUELVE` usa azul claro legible y la operación matemática usa blanco con peso 900. Nunca usar opacidad baja para texto esencial.

## Responsive

Breakpoints funcionales:

- `<= 420px`: teléfonos compactos.
- `<= 760px`: teléfonos.
- `761–1100px`: tablet / laptop compacta.
- `> 1100px`: escritorio.

Reglas:

- Acciones del encabezado hacen wrap en móvil.
- Cards pasan a una columna cuando la densidad lo requiere.
- Carruseles/KPI usan scroll interno y scroll-snap.
- Formularios de registro usan una columna en teléfono.
- El aviso de instalación PWA solo aparece sin sesión autenticada; no puede cubrir módulos operativos.

## Assets y marketing

- No se publican afirmaciones técnicas que no estén verificadas en producción.
- Integraciones futuras deben rotularse como `Planificada`, `Beta` o `Disponible` según estado real.
- La marca no debe prometer “imposible de hackear”, “cifrado end-to-end” o integración en tiempo real si no existe evidencia técnica verificable.

## QA visual obligatorio

Antes de fusionar un release visual:

- Browser QA 1440×900.
- Android compacto 344/375 px.
- iPhone 390 px.
- Tablet 768 px.
- Tema claro y oscuro en rutas críticas.
- Cero overflow horizontal de documento.
- Capturas de dashboard, ventas/compras, bancos, reportes, salud/veterinaria, gimnasio y asistente IA.
