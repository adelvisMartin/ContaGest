# Investigación UX/UI empresarial, estado y catálogo auditable — 2026-11-17
<!-- CG_UX_RESEARCH_20261117 -->

**Baseline fuente:** `qa/support/module-visual-catalog.mjs` en `main@03834a6ca1504399011f4b53866fe15b8cfa2557`. Detectadas **60 rutas** distintas; la existencia en catálogo NO significa que la ruta renderice ni que pase sus pruebas. No se han inspeccionado capturas individuales de cada ruta en este ticket de documentación.

## Fuentes públicas verificadas — inspiración, no código ni requisitos de negocio
| Fuente | Elemento observado en páginas públicas | Decisión para ContaGest | Riesgo y rechazo |
|---|---|---|---|
| [ERP SaaS Dashboard, Azmir Sheikh, Dribbble](https://dribbble.com/shots/27004290-ERP-Admin-SaaS-Dashboard) | composición jerárquica de datos de operación | encabezado de contexto, una acción principal y agrupación por tarea | no copiar imagen/CSS/íconos ni añadir paneles decorativos |
| [Data Tables: Clarity in Light, Focus in Dark, Melike Muhur](https://dribbble.com/shots/26473231-Data-Tables-Clarity-in-Light-Focus-in-Dark) | tablas legibles claro/oscuro, texto redimensionable y navegación compacta tablet | densidad ajustada a tarea, foco y contraste, encabezados/paginación reales | icon-only sin accessible name o overflow invisible están prohibidos |
| [Veterinary Healthcare Management, Dribbble](https://dribbble.com/shots/27432100-Veterinary-Healthcare-Management-System-Premium-Dashboard-UI) | superficies clínicas visualmente diferenciadas | priorizar paciente/animal/tutor, agenda y actos clínicos | el diseño visual nunca autoriza tratamiento ni salida clínica |
| [Dribbble ERP search pública](https://dribbble.com/search/shots/recent?q=erp-dashboard&timeframe=week) | tarjetas resumen, tablas y tendencias SaaS | candidatos para prototipar con Cg* existente | popularidad no implica usabilidad, conversión ni cumplimiento |
| [NN/g: Data Tables — Four Major User Tasks](https://www.nngroup.com/articles/data-tables/) | buscar, comparar, analizar y actuar sobre filas | tabla operativa primero, búsqueda/orden/filtro claros, acciones donde correspondan | no convertir toda tabla en tarjetas por moda |
| [NN/g: Design Guidelines for Complex Applications](https://www.nngroup.com/articles/complex-application-design/) | revelar detalles al necesitarlo, reducir ruido en apps densas | jerarquía tipográfica, progressive disclosure útil | no esconder evidencia fiscal ni estados irreversibles en menús |
| [MUI Data Grid Accessibility](https://mui.com/x/react-data-grid/accessibility/) y [MUI virtualization](https://mui.com/x/react-data-grid/virtualization/) | interacción teclado, densidad y virtualización | usar componentes ya instalados y comprobar focus/screen reader | verificar licencia de MUI X y no introducir Pro/Premium sin aprobación |
| [W3C WCAG 2.2](https://www.w3.org/WAI/WCAG22/quickref/) | teclado, foco visible, contraste, reflow, target size | gate A/AA aplicable, magnificación y lectura a 200% | ningún color de tendencia justifica incumplir |
| [web.dev Core Web Vitals](https://web.dev/articles/vitals) | LCP ≤2.5s, INP ≤200ms, CLS ≤0.1 en p75 como referencias | medir campo + laboratorio con hardware/red identificados | no decir PASS por una ejecución sintética aislada |
| [OWASP ASVS 5.0](https://owasp.org/projects/asvs) y [Multi Tenant Security](https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html) | autorización, aislamiento y pruebas negativas | seguridad visible y backend obligatorios en cada flujo | un frontend protegido no sustituye RBAC/RLS |

**Pinterest:** se consideró como fuente de inspiración visual, pero no se obtuvo una página/pin público verificable con autor y licencia en esta auditoría. No se afirma scraping completado allí. No hacer automatización de login, bypass de robots, descarga masiva de imágenes ni clonación de trabajo ajeno. Las referencias anteriores se obtuvieron de páginas públicas/indexadas y se registran como **observación de diseño**, no benchmark medido de ContaGest.

## Patrones a implementar gradualmente, no rediseño masivo
1. **Shell de aplicación**: rol/módulo correctos; breadcrumbs y CTA principal consistentes; navegación con etiquetas humanas; tabs visibles cuando hay tareas; foco al cambiar ruta.
2. **Tablas**: búsquedas por campos relevantes, filtro con estado visible/limpiable, orden/paginación server-side cuando hay volumen real; totales y monedas en formato tabular; selección y acciones con consecuencias explícitas.
3. **Formularios**: una sola fuente visible de field/control MUI/Cg*; etiquetas y ayuda breve; validación inline, disabled/loading, guard contra doble envío y errores que conservan el borrador; no duplicar controles nativos.
4. **Decisiones clínicas**: historia y eventos en timeline, consentimiento/estado firma; restringir detalles para roles no autorizados; never show confidential data in KPI/public screenshot.
5. **Gym/PWA**: permitir completar sets en dispositivo pequeño, feedback sync/pending/conflict, continuidad offline limitada a datos autorizados, no sincronización a otro tenant/usuario.
6. **Control Hípico**: SOURCE **no-read/no-send** automatizado cuando política lo impide; LAB explícito, estado spool/outbox, privacidad de grupos y accesibilidad offline; no CTA que prometa envío SOURCE.
7. **Dark/light**: dos temas canónicos, mismos tamaños/espaciados; estados por semántica no arcoíris. Sin gradientes, glass, sombras excesivas ni un nuevo shell, según AGENTS.md.
8. **Performance**: baseline/after bundle por ruta, LCP/INP/CLS, JS long tasks, p95 API, queries PostgreSQL sintéticas, memoria; usar lazy imports/virtualización sólo si el profiler revela beneficio y no rompe navegación/foco.

## Matriz 60 rutas — inventario por verificar
Cada fila debe producir: **baseline screenshot**, flujo de usuario de extremo a extremo, navegación/breadcrumb, loading-empty-error-success-disabled, 360/390/430/768/1024/1440, modo claro/oscuro, foco/teclado/reduced-motion, screenshot post-cambio, comparación de rendimiento y proof de no-regresión. **NO** se hereda PASS por compartir un componente.

| # | Ruta fuente | Familia | Criticidad visual catalogada | Tarea UX a comprobar | Estado de auditoría |
|---|---|---|---|---|---|
| 01 | `dashboard` | core | critical | estado general, módulo/CTA crítico y lectura de KPI con fuente | NOT VERIFIED |
| 02 | `cotizacion` | commercial | high | búsqueda por documento/cliente, subtotal verificable y acción segura | NOT VERIFIED |
| 03 | `clientes` | commercial | high | búsqueda por documento/cliente, subtotal verificable y acción segura | NOT VERIFIED |
| 04 | `ventas` | commercial | critical | búsqueda por documento/cliente, subtotal verificable y acción segura | NOT VERIFIED |
| 05 | `inventario` | operations | critical | filtros persistentes, estado real de inventario/flujo y excepción visible | NOT VERIFIED |
| 06 | `tributos` | accounting | critical | periodo/moneda/estado irreversible y referencia de asiento | NOT VERIFIED |
| 07 | `normativa` | accounting | medium | periodo/moneda/estado irreversible y referencia de asiento | NOT VERIFIED |
| 08 | `historial` | operations | high | filtros persistentes, estado real de inventario/flujo y excepción visible | NOT VERIFIED |
| 09 | `reportes` | reporting | high | filtros, definición de KPI, drilldown y export autorizado | NOT VERIFIED |
| 10 | `contabilidad` | accounting | critical | periodo/moneda/estado irreversible y referencia de asiento | NOT VERIFIED |
| 11 | `libro-mayor` | accounting | critical | periodo/moneda/estado irreversible y referencia de asiento | NOT VERIFIED |
| 12 | `balance-sumas-saldos` | accounting | critical | periodo/moneda/estado irreversible y referencia de asiento | NOT VERIFIED |
| 13 | `hoja-trabajo` | accounting | critical | periodo/moneda/estado irreversible y referencia de asiento | NOT VERIFIED |
| 14 | `estados-financieros` | accounting | critical | periodo/moneda/estado irreversible y referencia de asiento | NOT VERIFIED |
| 15 | `cierre-contable` | accounting | critical | periodo/moneda/estado irreversible y referencia de asiento | NOT VERIFIED |
| 16 | `bancos` | finance | critical | filtro/acción principal accesible, estados de operación y datos de dominio | NOT VERIFIED |
| 17 | `nomina` | hr | critical | filtro/acción principal accesible, estados de operación y datos de dominio | NOT VERIFIED |
| 18 | `proveedores` | commercial | high | búsqueda por documento/cliente, subtotal verificable y acción segura | NOT VERIFIED |
| 19 | `compras` | commercial | critical | búsqueda por documento/cliente, subtotal verificable y acción segura | NOT VERIFIED |
| 20 | `auditoria` | governance | critical | filtro/acción principal accesible, estados de operación y datos de dominio | NOT VERIFIED |
| 21 | `configuracion` | admin | high | filtro/acción principal accesible, estados de operación y datos de dominio | NOT VERIFIED |
| 22 | `sedes` | operations | high | filtros persistentes, estado real de inventario/flujo y excepción visible | NOT VERIFIED |
| 23 | `listas-precio` | commercial | high | búsqueda por documento/cliente, subtotal verificable y acción segura | NOT VERIFIED |
| 24 | `ayuda` | support | medium | estado de entrega/plantilla con permisos | NOT VERIFIED |
| 25 | `tasks` | operations | medium | filtros persistentes, estado real de inventario/flujo y excepción visible | NOT VERIFIED |
| 26 | `profile` | admin | medium | filtro/acción principal accesible, estados de operación y datos de dominio | NOT VERIFIED |
| 27 | `mobile` | admin | medium | filtro/acción principal accesible, estados de operación y datos de dominio | NOT VERIFIED |
| 28 | `libro-ventas` | accounting | critical | periodo/moneda/estado irreversible y referencia de asiento | NOT VERIFIED |
| 29 | `marca` | admin | low | filtro/acción principal accesible, estados de operación y datos de dominio | NOT VERIFIED |
| 30 | `admin` | admin | critical | filtro/acción principal accesible, estados de operación y datos de dominio | NOT VERIFIED |
| 31 | `backend` | admin | high | filtro/acción principal accesible, estados de operación y datos de dominio | NOT VERIFIED |
| 32 | `vistas` | admin | medium | filtro/acción principal accesible, estados de operación y datos de dominio | NOT VERIFIED |
| 33 | `login` | auth | critical | filtro/acción principal accesible, estados de operación y datos de dominio | NOT VERIFIED |
| 34 | `plan-cuentas` | accounting | critical | periodo/moneda/estado irreversible y referencia de asiento | NOT VERIFIED |
| 35 | `rrhh` | hr | high | filtro/acción principal accesible, estados de operación y datos de dominio | NOT VERIFIED |
| 36 | `analytics` | reporting | high | filtros, definición de KPI, drilldown y export autorizado | NOT VERIFIED |
| 37 | `qr` | operations | medium | filtros persistentes, estado real de inventario/flujo y excepción visible | NOT VERIFIED |
| 38 | `inventario-scan` | operations | high | filtros persistentes, estado real de inventario/flujo y excepción visible | NOT VERIFIED |
| 39 | `pedidos` | food | high | filtro/acción principal accesible, estados de operación y datos de dominio | NOT VERIFIED |
| 40 | `pos-sede` | food | critical | filtro/acción principal accesible, estados de operación y datos de dominio | NOT VERIFIED |
| 41 | `tracking-pedidos` | food | high | filtro/acción principal accesible, estados de operación y datos de dominio | NOT VERIFIED |
| 42 | `delivery-mapa` | food | high | filtro/acción principal accesible, estados de operación y datos de dominio | NOT VERIFIED |
| 43 | `asistente-ia` | support | medium | estado de entrega/plantilla con permisos | NOT VERIFIED |
| 44 | `soporte` | support | medium | estado de entrega/plantilla con permisos | NOT VERIFIED |
| 45 | `demo-control` | governance | medium | filtro/acción principal accesible, estados de operación y datos de dominio | NOT VERIFIED |
| 46 | `modulos-madurez` | governance | medium | filtro/acción principal accesible, estados de operación y datos de dominio | NOT VERIFIED |
| 47 | `reglas-negocio` | governance | high | filtro/acción principal accesible, estados de operación y datos de dominio | NOT VERIFIED |
| 48 | `licencias` | governance | high | filtro/acción principal accesible, estados de operación y datos de dominio | NOT VERIFIED |
| 49 | `importacion-data` | operations | high | filtros persistentes, estado real de inventario/flujo y excepción visible | NOT VERIFIED |
| 50 | `kardex` | operations | critical | filtros persistentes, estado real de inventario/flujo y excepción visible | NOT VERIFIED |
| 51 | `normativa-contable` | accounting | high | periodo/moneda/estado irreversible y referencia de asiento | NOT VERIFIED |
| 52 | `pretesting` | governance | medium | filtro/acción principal accesible, estados de operación y datos de dominio | NOT VERIFIED |
| 53 | `salud` | health | high | paciente/encounter y autorización clínica desde servidor | NOT VERIFIED |
| 54 | `veterinaria` | health | critical | paciente/encounter y autorización clínica desde servidor | NOT VERIFIED |
| 55 | `psicologia` | health | critical | paciente/encounter y autorización clínica desde servidor | NOT VERIFIED |
| 56 | `odontologia` | health | critical | paciente/encounter y autorización clínica desde servidor | NOT VERIFIED |
| 57 | `gimnasio` | fitness | high | miembro/rutina, progreso y sincronización PWA | NOT VERIFIED |
| 58 | `rutinas` | fitness | high | miembro/rutina, progreso y sincronización PWA | NOT VERIFIED |
| 59 | `nutricion` | fitness | high | miembro/rutina, progreso y sincronización PWA | NOT VERIFIED |
| 60 | `mensajes` | support | high | estado de entrega/plantilla con permisos | NOT VERIFIED |

## Criterios de aceptación por PR/ticket
- [ ] Link a una fila de esta matriz; usuario/tarea principal y antes/después de 360/390/1440 en light/dark con build exact-SHA.
- [ ] Sin regressions en teclado, label, foco, zoom, contraste WCAG, reduced motion ni scroll horizontal del documento.
- [ ] Toda UI de crear/editar/consumir/concluir ejecuta API real y presenta respuesta/error; ninguna vista es mock decorativo.
- [ ] Datos y permisos negativos en servidor bajo tenant A/B, sin leak en caché, tarjeta KPI ni exportación.
- [ ] Lighthouse/Web Vitals o Playwright trazas enlazadas a SHA/hardware/fixture; bundle route actual vs baseline; no declaran mejora inventada.
- [ ] Revisión de Cg*/MUI owner, sin CSS duplicado, import/licencia adicional ni copia de Dribbble.

**Nota:** El script histórico `test:browser:58` no prueba por su nombre cobertura 60; recolectar casos y validar set dinámico. `scripts/erp-cross-browser-v6375.mjs` comprueba 60 registros; una auditoría del backlog debe adjuntar evidencia por ruta y no sólo ese contador.
