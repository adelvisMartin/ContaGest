# ContaGest-VE ERPUI Migration Matrix v11.18

## Contrato vigente

La migración conserva rutas, IDs, `data-*`, servicios, reglas fiscales/contables y contratos de persistencia. `frontend/src/styles/erp-system.css` sigue siendo el sistema canónico; `compact-enterprise-v1110.css` continúa como único entrypoint de compatibilidad e importa `erp-system.css` + `vertical-contexts.css`. La segunda hoja contiene únicamente extensiones contextuales y correcciones responsive de fase 3, sin abrir un nuevo stack versionado.

## Base global completada

- shell responsive con sidebar desktop `248px`, drawer móvil y main/header limitados al viewport;
- header compacto sin duplicar nombre del ERP ni rótulo repetido de tasa;
- KPIs financieros sin elipsis de cifras;
- popover de usuario anclado al viewport;
- soporte WhatsApp `peek | visible | hidden`;
- catálogo global de temas persistente;
- seis idiomas: `es`, `en`, `pt`, `zh`, `hi`, `ar`, con RTL para árabe;
- formatos Intl globales de moneda, número y fecha;
- verticales clínica, veterinaria, psicología, vendedor/comercio y gimnasio con paletas y navegación contextual;
- perfiles de clínica/veterinaria/psicología sin RRHH/Nómina por defecto;
- permisos backend alineados con las rutas verticales: `health.manage`, `gym.manage`, `communications.manage`;
- invariantes financieros de fase 2 se mantienen como gate antes de tocar lógica contable/fiscal.

## Estado por módulo

| Módulo | Riesgo | Estado v11.18 | Próximo gate |
|---|---:|---|---|
| Dashboard | Medio | **Migrado** | Regresión visual multi-viewport. |
| Clientes | Medio | **Migrado** | Mantener CRUD/escape de strings. |
| Proveedores | Medio | **Migrado** | Mantener compras/persistencia. |
| Histórico | Medio | **Migrado** | Mantener PDF/duplicar/eliminar/exportar. |
| Ventas | Medio | **Migrado** | Mantener flujo fiscal/comercial. |
| Inventario | Medio | **Migrado** | Mantener stock/sync/acciones. |
| Kardex | Medio | **Migrado** | Mantener costo promedio. |
| Compras | Medio | **Migrado** | Mantener borrador/anulación/reverso. |
| Bancos | Medio | **Migrado** | Mantener conciliación/import/export. |
| Nómina | Alto | **Migrado + caracterizado** | No cambiar fórmula sin nuevo gate. |
| Analítica | Medio | **Migrado** | Mantener contratos del servicio. |
| Reportes | Medio | **Migrado** | Mantener exportaciones/fuentes. |
| Tareas | Medio | **Migrado** | Mantener estados/eventos. |
| Order Tracking | Medio | **Migrado en v11.18** | KPIs ERPUI; acciones de avance/share/WhatsApp/proof intactas. |
| Configuración | Alto | **Migración avanzada v11.18** | Temas, PT, soporte flotante e integraciones no secretas globalizadas. |
| Salud / Clínica | Alto | **Contexto + perfil solo/PYME** | Migrar workflow interno por secciones; sin RRHH por defecto. |
| Veterinaria | Alto | **Contexto + perfil solo/PYME** | Caracterizar workflow React/MUI antes de cambios profundos. |
| Psicología | Alto | **MVP funcional v11.18** | Pacientes humanos + citas health API + planner + confirmaciones iniciadas por usuario. |
| Gimnasio | Alto | **Contexto listo** | Caracterización workflow antes de migración profunda. |
| Libro diario | Alto | Caracterización lista | Migrar markup conservando Debe=Haber. |
| Libro mayor | Alto | Caracterización lista | Preservar acumulación y saldos. |
| Balance sumas/saldos | Alto | Caracterización lista | Preservar igualdad/precisión. |
| Hoja de trabajo | Alto | Caracterización lista | Preservar fórmulas/export. |
| Estados financieros | Alto | Caracterización lista | Preservar agrupación/totales. |
| Cierre contable | Alto | Gate pendiente de ruta | Añadir regresión específica antes de markup. |
| Libro de ventas | Alto | Gate fiscal parcial | Añadir pruebas específicas de columnas/totales. |
| Tributos | Alto | Gate fiscal parcial | Mantener IVA/IGTF/retenciones. |
| Cotizador | Alto | **Caracterizado / UI pendiente** | Mantener IDs y eventos de cálculo. |
| Plan de cuentas | Alto | Caracterización lista | Mantener jerarquía/interacciones. |
| QR / scanner | Medio | Pendiente | QA cámara WebKit/Android/iOS. |
| Delivery map | Medio | Pendiente | QA geolocalización y sizing. |
| POS / pedidos | Alto | Pendiente | Mantener velocidad táctil/state machine. |
| Audit / Licenses / Admin / Profile | Alto | Pendiente | Migrar por sub-secciones sin alterar seguridad/licencias. |
| Login | Crítico | **Sin rediseño** | Solo seguridad/accesibilidad tras caracterización auth. |

## Psicología e integraciones

La página de Psicología usa el contrato existente de `CarePatient` (`kind:'human'`) y `CareAppointment` (`startsAt`, `endsAt`, `type:'psychology'`, `channel`). Google Calendar, correo y WhatsApp se exponen primero como acciones confirmadas por el profesional, sin tokens en frontend. La automatización futura requiere OAuth/backend y debe añadir auditoría, consentimiento y políticas de datos antes de activarse.

## Definition of done por módulo

Un módulo solo pasa a **Migrado** si compila en producción, mantiene contratos de eventos/persistencia, no provoca overflow del documento, usa tokens/componentes canónicos, escapa entradas visibles, no referencia secretos server-only, conserva acciones destructivas distinguibles y posee QA browser cuando el dispositivo/viewport lo exige. Los módulos financieros/fiscales además deben pasar invariantes de caracterización antes y después.
