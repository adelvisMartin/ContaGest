# ContaGest-VE Phase 2 — ERPUI, verticales e i18n v11.17

## Objetivo

La fase 2 consolida una sola experiencia ContaGest sin convertir el producto en una interfaz genérica. El shell, los componentes, la tipografía, seguridad y comportamiento responsive son comunes; cada vertical puede utilizar una paleta contextual y priorizar los módulos que realmente necesita su cliente.

## Sistema global de idiomas

Los archivos canónicos son:

- `frontend/src/i18n/locales.js`: idiomas, locales Intl y dirección LTR/RTL.
- `frontend/src/i18n/translations.js`: catálogo global y nombres de rutas.
- `frontend/src/i18n/fallbacks.js`: compatibilidad con claves históricas durante la migración.
- `frontend/src/i18n/useTranslate.js`: `t()`, `routeT()`, `useTranslate()` y traducción del DOM dinámico.
- `frontend/src/core/formatters.js`: moneda, número y fecha usando el locale activo.

Idiomas habilitados:

1. Español (`es`, `es-VE`) — idioma base del producto.
2. English (`en`, `en-US`).
3. 中文 / mandarín (`zh`, `zh-CN`).
4. हिन्दी / hindi (`hi`, `hi-IN`).
5. العربية / árabe (`ar`, RTL).

El cambio de idioma es global: topbar, menú de cuenta y Configuración utilizan el mismo catálogo. Los componentes nuevos deben usar claves (`data-i18n`, `t`, `routeT`) y no deben crear un diccionario privado por módulo.

### Estado de cobertura

La infraestructura global, navegación, acciones comunes, rutas, formatos y los módulos migrados están preparados para los cinco idiomas. Durante la transición, una cadena de un módulo legacy que aún no tenga traducción específica conserva el español en vez de inventar una traducción o mostrar una clave técnica. La cobertura semántica completa de textos largos se amplía módulo por módulo junto con ERPUI.

## Política de copy para clientes

No se muestran como copy comercial términos internos de desarrollo tales como:

- `Core real`;
- `Módulo demo/comercial`;
- `módulo de prueba`;
- `pretesting QA`;
- `prototipo`;
- `solo desarrollo`;
- `shell listo para ...`.

La terminología visible se normaliza a:

- **Operativo**;
- **Especializado**;
- **Opcional**;
- **Estado del sistema**;
- **Galería de módulos**;
- **Pendiente de sincronización**;
- **Gestión empresarial unificada**.

Los identificadores internos `demo`, `role-demo`, acciones de auditoría y contratos API no se renombran cuando hacerlo pudiera romper compatibilidad. La limpieza es de interfaz/copy, no una migración destructiva de contratos.

## Vertical: Clínica / Salud

Contexto de negocio: `salud`; ruta principal: `salud`; rol: `role-clinica`.

Paleta:

- primario teal clínico `#0f6f8d`;
- acento verde salud `#2a9d8f`;
- superficies claras azul-verdosas;
- equivalente de alto contraste para dark mode.

Prioridades de acceso:

- pacientes/clientes;
- clínica y agenda;
- cotización/facturación;
- ventas e histórico;
- bancos;
- nómina/RRHH;
- reportes, analítica, auditoría;
- mensajería y soporte.

## Vertical: Clínica veterinaria

Contexto: `veterinaria`; ruta principal: `veterinaria`; rol: `role-veterinaria`.

Paleta:

- primario verde `#2f7d62`;
- acento cálido `#bd7b36`;
- superficies orgánicas suaves;
- equivalente dark mode.

El módulo veterinario conserva su flujo React/MUI especializado, pero MUI hereda Inter, escala de pesos ERP y los tokens de color de ContaGest. El acceso veterinario prioriza mascotas/tutores, ventas, inventario clínico, compras, bancos, RRHH, reportes, mensajería y soporte.

## Vertical: Vendedor / Comercio

Contexto comercial: `comercio`; ruta principal: `ventas`; rol: `role-vendedor`.

Paleta:

- primario índigo `#3157c8`;
- acento teal `#0f8f83`;
- equivalente dark mode.

El acceso prioriza:

- dashboard;
- clientes;
- cotización;
- ventas e histórico;
- pedidos/POS/seguimiento;
- mensajería;
- soporte.

Los módulos bloqueados por RBAC no deben dominar la navegación del cliente. La interfaz se mantiene enfocada en las funciones que el usuario puede operar.

## Vertical: Gimnasio / Fitness

Contexto: `gimnasio`; rutas: `gimnasio`, `rutinas`, `nutricion`; rol: `role-gimnasio`.

Paleta:

- primario violeta `#6b46c1`;
- acento teal `#0f9f8f`;
- equivalente dark mode.

Se mantiene la misma arquitectura para que futuras verticales puedan añadir contexto sin crear otro ERP paralelo.

## Tipografía

- Inter es la única familia visual de producto.
- Monospace de sistema se reserva para importes tabulares, IDs y código.
- 400 cuerpo/datos.
- 500 controles y navegación.
- 600 labels, botones y encabezados de tabla.
- 650 encabezados de sección/página.
- 700 indicadores destacados.

La misma política se fuerza sobre Material UI para evitar que las verticales React introduzcan una segunda identidad tipográfica.

## Seguridad y PWA

Los cambios de verticales/i18n no alteran autenticación ni secretos. Se conservan:

- validación server-side;
- RBAC;
- CSP Report-Only y telemetría de violaciones;
- PWA/iOS safe areas;
- target táctil móvil;
- sanitización/escape de strings insertados en HTML.

La dirección RTL se maneja en CSS/HTML sin duplicar componentes.

## Lote de migración incluido

Además de las pantallas migradas anteriormente, este lote continúa sobre:

- Dashboard: elimina valores KPI inventados y usa solamente estado real;
- Ventas: ERPUI, acciones accesibles y estado de sincronización comprensible;
- Inventario: ERPUI, tabla canónica y estado de sincronización;
- Analítica: ERPUI parcial y barras CSP-safe con `progress`;
- Reportes: tabla/secciones ERPUI y fuentes de datos reales;
- Tareas: formulario, tabla, tablero y acciones sobre primitivas ERPUI;
- Configuración: cinco idiomas y copy orientado a cliente.

## Regla de migración para los módulos restantes

Un módulo no se considera migrado solamente porque cambió el CSS. Debe conservar comportamiento observable y pasar:

1. build Vite;
2. tests Node existentes;
3. browser QA en Chromium/WebKit cuando GitHub Actions esté disponible;
4. ausencia de overflow de documento;
5. contraste/touch targets;
6. contratos `id`/`data-*` necesarios para eventos;
7. ausencia de nueva deuda CSP;
8. validación de copy de cliente;
9. claves i18n globales para texto nuevo.
