# ContaGest-VE · Design System v11.14

## Dirección visual

ContaGest usa una estética empresarial contemporánea: fondo claro frío, superficies blancas de alto contraste, navegación azul marino, acentos índigo/azul y estados semánticos sobrios. El objetivo es transmitir control, seguridad y claridad sin imitar interfaces de banca o wallets existentes.

## Tokens principales

| Token | Valor | Uso |
|---|---:|---|
| `--cg-brand-950` | `#07152f` | Fondos y títulos de máxima jerarquía |
| `--cg-brand-900` | `#0b1f44` | Navegación / identidad |
| `--cg-brand-700` | `#1d4f9d` | Botones y acciones primarias |
| `--cg-brand-600` | `#2563eb` | Interacción, focus y acentos |
| `--cg-accent` | `#4f46e5` | Gradientes y acciones destacadas |
| `--cg-cyan` | `#0891b2` | Acentos auxiliares |
| `--cg-ink` | `#0f172a` | Texto principal |
| `--cg-muted` | `#64748b` | Texto secundario |
| `--cg-line` | `#dbe5f2` | Bordes |
| `--cg-soft` | `#f4f7fb` | Fondo de aplicación |
| `--cg-success` | `#15803d` | Éxito / activo |
| `--cg-danger` | `#b91c1c` | Error / bloqueado |
| `--cg-warning` | `#b45309` | Advertencia |

## Jerarquía y componentes

- Botón primario: degradado azul, altura táctil mínima 42–50 px según contexto.
- Botón secundario: fondo blanco, borde visible, texto oscuro.
- Campos: radio 12–13 px, focus azul con halo accesible.
- Tarjetas: radios 14–22 px, sombras contenidas y bordes fríos.
- Tablas: cabecera azul muy clara, filas blancas, hover sutil; scroll horizontal contenido en móvil.
- Sidebar: azul marino profundo con estados activos luminosos, sin saturación excesiva.
- Login: columna funcional limpia + panel de marca en escritorio; una sola columna en móvil.
- Estados de seguridad: verde = activo, rojo = bloqueado/error, ámbar = advertencia.

## Responsive

Breakpoints obligatorios: 1279, 1023, 767, 479 y 359 px. Se usan `100dvh` y `safe-area-inset-*` para Android/iOS. En móvil no se permite overflow horizontal de página; únicamente tablas o listas explícitamente desplazables pueden tener scroll horizontal.

## Accesibilidad

- Focus visible de 3 px.
- Controles táctiles de al menos ~44 px en móvil.
- Texto funcional no depende únicamente del color.
- Acciones icon-only requieren `aria-label`.
- Formularios mantienen etiquetas visibles y errores con `aria-live` cuando corresponde.

## Seguridad visual

La interfaz nunca comunica privilegios solo por mostrar/ocultar un botón. La navegación visual refleja permisos firmados, pero la autorización real se ejecuta en backend mediante tenant, rol y permisos. Las contraseñas nunca se muestran en tablas o respuestas; la consola administrativa solo indica si existe una contraseña y permite reemplazarla.

## Reglas de consistencia

1. No introducir nuevos azules, radios o sombras si existe un token equivalente.
2. Evitar gradientes fuera de marca, navegación, CTA principal o instalación PWA.
3. Mantener densidad compacta en módulos operativos y mayor respiración en onboarding/login.
4. No convertir tablas complejas en tarjetas si se pierde comparación de datos; en móvil usar scroll horizontal controlado.
5. Probar cualquier cambio en 344×760, 390×844, 768×1024, 1024×768 y 1440×900.
