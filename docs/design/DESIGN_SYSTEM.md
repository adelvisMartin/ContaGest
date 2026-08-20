# Design system operativo ContaGest

La interfaz debe priorizar lectura rápida de datos, captura segura y consistencia entre módulos horizontales y verticales.

## Reglas de interacción

- Mantener labels, ayudas y errores en el flujo normal del formulario.
- Usar componentes compartidos antes de crear variantes por página.
- Asegurar foco visible, nombres accesibles, estados disabled comprensibles y acciones utilizables con teclado.
- En móvil, preservar el orden de operación: contexto, filtros, captura, confirmación y resultado.

## Datos y densidad

- Los KPI y valores monetarios usan cifras tabulares y no deben dividir un importe entre líneas.
- Alinear números por su parte decimal cuando la tabla lo permita.
- Reservar color fuerte para estado, error, advertencia y acción primaria.
- Evitar sombras, gradientes y adornos que reduzcan la densidad útil del ERP.

## Aplicación en esta rama

- `frontend/src/styles/vertical-contexts.css` protege la legibilidad de valores KPI con `white-space: nowrap`, `overflow-wrap: normal` y `font-variant-numeric: tabular-nums`.
- `frontend/src/pages/GymManagementPage.js` muestra señales de coaching, renovaciones próximas y ocupación de clases en la vista operativa.
- `frontend/src/styles/erp-system.css` es la fuente compartida para formularios y layout; los archivos CSS legacy deben mantenerse como shims hasta retirar sus consumidores.
