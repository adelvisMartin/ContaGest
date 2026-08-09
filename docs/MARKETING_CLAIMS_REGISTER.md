# ContaGest — Registro de claims de marketing

Toda página, propuesta o anuncio debe usar claims verificables.

## Permitidos hoy
- ERP modular con ventas, inventario, contabilidad, bancos y reportes según módulos habilitados.
- Aislamiento lógico por empresa/tenant en backend y políticas implementadas en tablas protegidas.
- Roles y permisos por usuario.
- Licencias ligadas a empresa, usuario, vigencia, módulos y activaciones.
- PWA instalable y responsive.
- Soporte de importes/tasas VES/USD dentro del producto.

## Permitidos después de liberar y verificar v11.15
- Sesión web con cookies HttpOnly/Secure/SameSite y refresh rotatorio.
- Protección CSRF para operaciones autenticadas por cookie.
- Credencial de dispositivo emitida por servidor.
- Administración multiempresa por membresías/suscripciones autorizadas.
- Consola de suscripciones, MRR, renovaciones, pagos y comisiones.

## Condicionales
- IA: indicar proveedor/configuración; distinguir motor operativo/offline.
- WhatsApp/SMS/email: solo si proveedor/canal está contratado y configurado.
- Backup externo/retención inmutable: solo donde esté configurado y se haya probado restore.
- Tasa BCV automática: solo si fuente/configuración productiva está activa y monitoreada.

## Prohibidos sin evidencia adicional
- "Inhackeable", "100% seguro", "seguridad blindada".
- "Cifrado de extremo a extremo" para toda la app: TLS y hashing no equivalen a E2EE.
- "Cumplimiento fiscal garantizado" o "100% SENIAT".
- "Validación SENIAT en tiempo real" sin integración activa/testeada.
- "Conciliación automática con todos los bancos nacionales" sin conectores reales.
- "Backups cada hora" si el entorno no lo hace y monitorea.
- "Soporte 24/7" sin guardia/SLA.
- "HIPAA/GDPR/ISO/SOC 2" sin alcance y auditoría correspondiente.

Cada claim público debe tener dueño, evidencia, ambientes donde aplica, fecha de revisión y texto permitido. Claims regulatorios, médicos, fiscales o de seguridad requieren revisión de producto + dominio + legal.
