# ContaGest-VE ERPUI Migration Matrix v11.19

## Contrato vigente

La migración conserva rutas, IDs, `data-*`, servicios, reglas fiscales/contables y contratos de persistencia. `frontend/src/styles/erp-system.css` es el sistema canónico; `compact-enterprise-v1110.css` mantiene el entrypoint de compatibilidad y añade `vertical-contexts.css`. El CSS vertical histórico ya no se inyecta al navegar: se carga una sola vez, en una capa legacy inferior, para impedir que cambie formularios de otros módulos después de visitar una vertical.

## Base global v11.19

- formulario canónico sin doble contorno ni labels flotando sobre el borde;
- grids compactos pasan a una columna bajo 560px;
- tablas financieras/CRUD conservan scroll propio en móvil;
- RIF + estado se renderizan como pareja no solapable;
- isotipo móvil dedicado, separado del wordmark de escritorio;
- drawer móvil por encima del backdrop, sin blur/opacidad heredada;
- controles de menú/tema/cuenta centrados con el mismo touch target;
- panel de usuario/configuración fijado al viewport y con scroll interno;
- soporte WhatsApp visible/peek dentro del viewport y con `pointer-events:auto`;
- nueva capa de temas `ocean`, `forest`, `celestial` además del catálogo previo;
- seis idiomas globales: `es`, `en`, `pt`, `zh`, `hi`, `ar`;
- manifiesto UI humano + JSON y manifiesto de capacidades verticales;
- PWA manifest conserva identidad e incorpora shortcuts de Psicología, Veterinaria y Gimnasio.

## Estado por módulo

| Módulo | Riesgo | Estado v11.19 | Próximo gate |
|---|---:|---|---|
| Dashboard | Medio | **Migrado** | Regresión visual multi-viewport real. |
| Clientes | Medio | **Migrado + mobile hardening v11.19** | CRUD/sync + validar tabla 320–430px. |
| Proveedores | Medio | **Migrado** | Aplicar el mismo contrato de formularios/table responsive. |
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
| Order Tracking | Medio | **Migrado** | Regresión móvil y proof/share. |
| Configuración | Alto | **Migración avanzada** | QA real de menú/temas/popover; seguir retirando CSS legacy. |
| Salud / Clínica | Alto | **Contexto + perfil solo/PYME** | Migrar workflow interno por secciones; sin RRHH por defecto. |
| Veterinaria | Alto | **Avanzado + mobile hardening v11.19** | Online booking/recalls/portal en lotes separados; no alterar clínica actual. |
| Psicología | Alto | **MVP+ v11.19** | Recurrencia, disponibilidad, lista de espera e integraciones OAuth/backend. |
| Gimnasio | Alto | **Avanzado v11.19** | Workout log/RIR, hábitos, waitlists, CRM/retención y AI draft coach-in-loop. |
| Odontología | Alto | **Arquitectura documentada** | Crear schema/agenda/sillas/recall antes de odontograma o imagen/AI. |
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

## Definition of done

Un módulo solo pasa a **Migrado** si compila en producción, mantiene contratos de eventos/persistencia, no provoca overflow del documento, usa tokens/componentes canónicos, escapa entradas visibles, no referencia secretos server-only, conserva acciones destructivas distinguibles y posee QA browser cuando el dispositivo/viewport lo exige. Finanzas/fiscalidad requieren además invariantes de caracterización antes y después. Salud requiere frontera de datos sensibles, autorización por tenant/rol y auditoría antes de incorporar nuevos datos clínicos.
