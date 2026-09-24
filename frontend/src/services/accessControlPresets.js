export const createRolePresetInput=(allModules)=>[
  {
    id:'role-admin', name:'Administrador', tone:'danger', description:'Control total de empresa, usuarios, permisos, seguridad, integraciones, reportes y módulos.',
    scope:'Acceso completo. Puede administrar usuarios, límites, módulos, bitácora, monitoreo, integraciones y configuración empresarial.',
    permissions:['admin.manage','modules.manage','clients.manage','sales.manage','sales.view','inventory.manage','purchases.manage','accounting.manage','banking.manage','taxes.export','payroll.manage','reports.view','audit.view','orders.manage','orders.view','licenses.manage','demos.manage','dashboard.view','settings.manage','support.manage','health.manage','gym.manage','communications.manage','care.manage','veterinary.manage','psychology.manage','fitness.manage'],
    modules:allModules
  },
  {
    id:'role-gerente', name:'Gerente / Dueño', tone:'brand', description:'Visión ejecutiva, ventas, inventario, caja, analítica y reportes.',
    scope:'Control operativo y ejecutivo. Puede revisar KPIs, ventas, compras, inventario, bancos, reportes y auditoría sin administrar secretos técnicos.',
    permissions:['dashboard.view','clients.manage','sales.manage','sales.view','inventory.manage','purchases.manage','banking.manage','reports.view','audit.view','orders.manage','orders.view','demos.manage','licenses.manage'],
    modules:['dashboard','analytics','clientes','cotizacion','ventas','historial','libro-ventas','inventario','inventario-scan','kardex','proveedores','compras','bancos','pedidos','pos-sede','tracking-pedidos','delivery-mapa','reportes','auditoria','demo-control','licencias','soporte']
  },
  {
    id:'role-contador', name:'Contador', tone:'brand', description:'Contabilidad, fiscal, compras, ventas, reportes y auditoría documental.',
    scope:'Registra y revisa asientos, libros, impuestos, retenciones, compras, ventas y reportes. No administra usuarios ni permisos globales.',
    permissions:['dashboard.view','clients.manage','sales.view','purchases.manage','accounting.manage','banking.manage','taxes.export','reports.view','audit.view'],
    modules:['dashboard','clientes','ventas','libro-ventas','compras','proveedores','contabilidad','plan-cuentas','libro-mayor','balance-sumas-saldos','hoja-trabajo','estados-financieros','cierre-contable','bancos','tributos','normativa','normativa-contable','reportes','auditoria','analytics','reglas-negocio','importacion-data','soporte']
  },
  {
    id:'role-tesoreria', name:'Tesorería / Finanzas', tone:'slate', description:'Bancos, caja, conciliación, cobranza, pagos y reportes financieros.',
    scope:'Gestiona bancos, movimientos, cuentas por cobrar/pagar, reportes y auditoría financiera.',
    permissions:['dashboard.view','clients.manage','sales.view','purchases.manage','banking.manage','reports.view','audit.view'],
    modules:['dashboard','clientes','ventas','compras','proveedores','bancos','libro-mayor','balance-sumas-saldos','estados-financieros','reportes','analytics','auditoria','soporte']
  },
  {
    id:'role-vendedor', name:'Vendedor / Caja', tone:'success', description:'CRM, cotizaciones, ventas, pedidos y POS.',
    scope:'Crea clientes, cotizaciones, ventas, pedidos y operaciones de caja. Puede consultar seguimiento y soporte.',
    permissions:['dashboard.view','clients.manage','sales.manage','sales.view','orders.manage','orders.view','communications.manage'],
    modules:['dashboard','clientes','cotizacion','ventas','historial','pedidos','pos-sede','tracking-pedidos','mensajes','soporte']
  },
  {
    id:'role-clinica', name:'Clínica / Consultorio', tone:'brand', description:'Pacientes, agenda, historias clínicas, facturación y operación del consultorio.',
    scope:'Perfil compacto para profesionales y consultorios pequeños. RRHH y nómina se habilitan aparte cuando exista personal adicional.',
    permissions:['dashboard.view','clients.manage','sales.manage','sales.view','health.manage','care.manage','banking.manage','reports.view','audit.view','communications.manage'],
    modules:['dashboard','salud','clientes','cotizacion','ventas','historial','bancos','analytics','reportes','auditoria','mensajes','soporte']
  },
  {
    id:'role-veterinaria', name:'Clínica veterinaria', tone:'success', description:'Mascotas, tutores, historias, vacunas, inventario, compras y facturación.',
    scope:'Perfil compacto para veterinarios y PYMES. RRHH y nómina se habilitan aparte cuando exista personal adicional.',
    permissions:['dashboard.view','clients.manage','sales.manage','sales.view','health.manage','veterinary.manage','inventory.manage','purchases.manage','banking.manage','reports.view','audit.view','communications.manage'],
    modules:['dashboard','veterinaria','clientes','cotizacion','ventas','historial','inventario','inventario-scan','kardex','qr','proveedores','compras','bancos','analytics','reportes','auditoria','mensajes','soporte']
  },
  {
    id:'role-psicologia', name:'Psicología / Consultorio', tone:'brand', description:'Pacientes, citas, agenda semanal, confirmaciones, seguimiento y cobranza del consultorio.',
    scope:'Perfil para psicólogos particulares y centros pequeños. Prioriza agenda, pacientes y comunicaciones sin exponer módulos de RRHH por defecto.',
    permissions:['dashboard.view','clients.manage','sales.manage','sales.view','health.manage','psychology.manage','banking.manage','reports.view','communications.manage'],
    modules:['dashboard','psicologia','clientes','cotizacion','ventas','historial','bancos','reportes','mensajes','soporte']
  },
  {
    id:'role-odontologia', name:'Odontología / Consultorio dental', tone:'brand', description:'Pacientes, odontograma, tratamientos, citas, presupuestos, seguimiento y cobranza.',
    scope:'Perfil para odontólogos y clínicas dentales pequeñas. Prioriza historia odontológica, procedimientos, agenda y comunicación con el paciente.',
    permissions:['dashboard.view','clients.manage','sales.manage','sales.view','health.manage','care.manage','banking.manage','reports.view','communications.manage'],
    modules:['dashboard','odontologia','clientes','cotizacion','ventas','historial','bancos','reportes','mensajes','soporte']
  },
  {
    id:'role-gimnasio', name:'Gimnasio / Fitness', tone:'success', description:'Socios, membresías, asistencia, rutinas, nutrición y cobranza.',
    scope:'Gestiona la operación del gimnasio, seguimiento de socios, planes, rutinas y reportes.',
    permissions:['dashboard.view','clients.manage','sales.manage','sales.view','gym.manage','fitness.manage','inventory.manage','banking.manage','reports.view','communications.manage'],
    modules:['dashboard','gimnasio','rutinas','nutricion','clientes','cotizacion','ventas','historial','inventario','bancos','analytics','reportes','mensajes','soporte']
  },
  {
    id:'role-nutricion', name:'Nutrición / Consulta', tone:'success', description:'Pacientes, planes alimentarios, composición, adherencia y seguimiento.',
    scope:'Perfil independiente para profesionales de nutrición. Usa la capacidad nutricional del dominio Fitness sin habilitar por defecto la operación del gimnasio.',
    permissions:['dashboard.view','clients.manage','gym.manage','reports.view','communications.manage'],
    modules:['dashboard','nutricion','clientes','analytics','reportes','mensajes','soporte']
  },
  {
    id:'role-inventario', name:'Inventario / Almacén', tone:'warning', description:'Productos, stock, kardex, escaneo, alertas y movimientos.',
    scope:'Controla productos, existencias, kardex, escaneo y reportes de stock.',
    permissions:['dashboard.view','inventory.manage','reports.view','audit.view'],
    modules:['dashboard','inventario','inventario-scan','kardex','qr','reportes','auditoria','soporte']
  },
  {
    id:'role-compras', name:'Compras / Proveedores', tone:'warning', description:'Proveedores, órdenes de compra, costos e inventario entrante.',
    scope:'Gestiona proveedores, compras y seguimiento de inventario recibido.',
    permissions:['dashboard.view','purchases.manage','inventory.manage','reports.view'],
    modules:['dashboard','proveedores','compras','inventario','kardex','reportes','soporte']
  },
  {
    id:'role-rrhh', name:'RRHH', tone:'slate', description:'Nómina, empleados, incidencias y reportes humanos.',
    scope:'Trabaja nómina, RRHH y reportes del área.',
    permissions:['dashboard.view','payroll.manage','reports.view','audit.view'],
    modules:['dashboard','nomina','rrhh','reportes','auditoria','soporte']
  },
  {
    id:'role-auditor', name:'Auditor interno', tone:'danger', description:'Lectura, auditoría, bitácora, controles y reportes de cumplimiento.',
    scope:'Perfil de revisión para reportes, auditoría y controles, sin editar operaciones transaccionales.',
    permissions:['dashboard.view','reports.view','audit.view'],
    modules:['dashboard','reportes','libro-mayor','balance-sumas-saldos','hoja-trabajo','estados-financieros','auditoria','pretesting','modulos-madurez','normativa','normativa-contable','soporte']
  },
  {
    id:'role-soporte', name:'Soporte técnico interno', tone:'accent', description:'Monitoreo, bitácora, fallas, integraciones y asistencia.',
    scope:'Revisa fallas, monitoreo, integraciones, soporte y estado del sistema. No cambia roles sin autorización administrativa.',
    permissions:['dashboard.view','reports.view','audit.view','support.manage'],
    modules:['dashboard','auditoria','backend','pretesting','soporte','ayuda','asistente-ia']
  },
  {
    id:'role-demo', name:'Acceso temporal', tone:'accent', description:'Acceso comercial con vencimiento y módulos seleccionados.',
    scope:'Acceso temporal para prospectos. El administrador define vigencia, máximo de módulos y alcance.',
    permissions:['dashboard.view','clients.manage','sales.view','orders.view','reports.view'],
    modules:['dashboard','clientes','ventas','pedidos','tracking-pedidos','analytics','soporte']
  },
  {
    id:'role-lectura', name:'Solo lectura', tone:'slate', description:'Consulta ejecutiva sin modificar datos.',
    scope:'Puede revisar dashboard, reportes y ayuda sin editar registros ni configuraciones sensibles.',
    permissions:['dashboard.view','reports.view'],
    modules:['dashboard','reportes','analytics','ayuda','soporte']
  }
 ];;
