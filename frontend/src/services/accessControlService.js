const CORE_ROUTES = ['dashboard', 'login', 'profile', 'ayuda', 'soporte'];
const ADMIN_ONLY_ROUTES = new Set(['admin', 'demo-control', 'licencias', 'backend', 'configuracion', 'marca', 'modulos-madurez', 'pretesting']);

export const MODULE_CATALOG_ACCESS = [
  { route:'dashboard', label:'Dashboard', permission:'dashboard.view', group:'Inicio' },
  { route:'clientes', label:'Clientes', permission:'clients.manage', group:'CRM' },
  { route:'cotizacion', label:'Cotizaciones', permission:'sales.manage', group:'Ventas' },
  { route:'ventas', label:'Ventas', permission:'sales.manage', group:'Ventas' },
  { route:'libro-ventas', label:'Libro de ventas', permission:'taxes.export', group:'Fiscal' },
  { route:'inventario', label:'Inventario', permission:'inventory.manage', group:'Inventario' },
  { route:'inventario-scan', label:'Escáner inventario', permission:'inventory.manage', group:'Inventario' },
  { route:'kardex', label:'Kardex', permission:'inventory.manage', group:'Inventario' },
  { route:'proveedores', label:'Proveedores', permission:'purchases.manage', group:'Compras' },
  { route:'compras', label:'Compras', permission:'purchases.manage', group:'Compras' },
  { route:'contabilidad', label:'Libro diario', permission:'accounting.manage', group:'Contabilidad' },
  { route:'plan-cuentas', label:'Plan de cuentas', permission:'accounting.manage', group:'Contabilidad' },
  { route:'libro-mayor', label:'Libro mayor', permission:'accounting.manage', group:'Contabilidad' },
  { route:'balance-sumas-saldos', label:'Balance de sumas y saldos', permission:'accounting.manage', group:'Contabilidad' },
  { route:'hoja-trabajo', label:'Hoja de trabajo', permission:'accounting.manage', group:'Contabilidad' },
  { route:'estados-financieros', label:'Estados financieros', permission:'reports.view', group:'Contabilidad' },
  { route:'cierre-contable', label:'Cierre contable', permission:'accounting.manage', group:'Contabilidad' },
  { route:'bancos', label:'Bancos', permission:'banking.manage', group:'Finanzas' },
  { route:'tributos', label:'Tributos', permission:'taxes.export', group:'Fiscal' },
  { route:'nomina', label:'Nómina', permission:'payroll.manage', group:'RRHH' },
  { route:'rrhh', label:'RRHH', permission:'payroll.manage', group:'RRHH' },
  { route:'pedidos', label:'Pedidos', permission:'orders.manage', group:'Operaciones' },
  { route:'pos-sede', label:'POS sede', permission:'orders.manage', group:'Operaciones' },
  { route:'tracking-pedidos', label:'Tracking pedidos', permission:'orders.view', group:'Operaciones' },
  { route:'delivery-mapa', label:'Delivery mapa', permission:'orders.manage', group:'Operaciones' },
  { route:'analytics', label:'Analítica', permission:'reports.view', group:'Reportes' },
  { route:'reportes', label:'Reportes', permission:'reports.view', group:'Reportes' },
  { route:'auditoria', label:'Auditoría', permission:'audit.view', group:'Seguridad' },
  { route:'admin', label:'Panel admin', permission:'admin.manage', group:'Admin' },
  { route:'backend', label:'Backend & APIs', permission:'admin.manage', group:'Admin' },
  { route:'licencias', label:'Licencias', permission:'licenses.manage', group:'Admin' },
  { route:'demo-control', label:'Control demos', permission:'demos.manage', group:'Admin' },
  { route:'importacion-data', label:'Importación', permission:'modules.manage', group:'Admin' },
  { route:'vistas', label:'Vistas / módulos', permission:'modules.manage', group:'Admin' },
  { route:'pretesting', label:'Pretesting QA', permission:'admin.manage', group:'QA' }
];

const allModules = MODULE_CATALOG_ACCESS.map((m) => m.route);

const ROLE_DEFINITIONS = [
  {
    id:'role-admin', name:'Administrador', tone:'danger', description:'Control total: empresa, usuarios, permisos, demos, monitoreo, backend, reportes y módulos.',
    scope:'Acceso completo. Puede crear demos, editar límites, habilitar módulos puntuales, revisar bitácora, monitorear fallas, sincronizar RBAC y administrar backend/Supabase.',
    permissions:['admin.manage','modules.manage','clients.manage','sales.manage','sales.view','inventory.manage','purchases.manage','accounting.manage','banking.manage','taxes.export','payroll.manage','reports.view','audit.view','orders.manage','orders.view','licenses.manage','demos.manage','dashboard.view','settings.manage','support.manage'],
    modules: allModules
  },
  {
    id:'role-gerente', name:'Gerente / Dueño', tone:'brand', description:'Visión ejecutiva, ventas, inventario, caja, analítica, demos y reportes sin tocar backend crítico.',
    scope:'Control operativo y ejecutivo. Puede ver KPIs, ventas, compras, inventario, bancos, reportes, auditoría y demos comerciales; no administra claves técnicas ni estructura backend.',
    permissions:['dashboard.view','clients.manage','sales.manage','sales.view','inventory.manage','purchases.manage','banking.manage','reports.view','audit.view','orders.manage','orders.view','demos.manage','licenses.manage'],
    modules:['dashboard','analytics','clientes','cotizacion','ventas','libro-ventas','inventario','inventario-scan','kardex','proveedores','compras','bancos','pedidos','pos-sede','tracking-pedidos','delivery-mapa','reportes','auditoria','demo-control','licencias','soporte']
  },
  {
    id:'role-contador', name:'Contador', tone:'brand', description:'Contabilidad, fiscal, compras, ventas, reportes y auditoría documental.',
    scope:'Registra y revisa asientos, libros, impuestos, retenciones, compras, ventas y reportes. No puede crear usuarios ni cambiar permisos globales.',
    permissions:['dashboard.view','clients.manage','sales.view','purchases.manage','accounting.manage','banking.manage','taxes.export','reports.view','audit.view'],
    modules:['dashboard','clientes','ventas','libro-ventas','compras','proveedores','contabilidad','plan-cuentas','libro-mayor','balance-sumas-saldos','hoja-trabajo','estados-financieros','cierre-contable','bancos','tributos','normativa','normativa-contable','reportes','auditoria','analytics','reglas-negocio','importacion-data','soporte']
  },
  {
    id:'role-tesoreria', name:'Tesorería / Finanzas', tone:'slate', description:'Bancos, caja, conciliación, cobranza, pagos y reportes financieros.',
    scope:'Gestiona bancos, movimientos, cuentas por cobrar/pagar, reportes y auditoría financiera. Sin acceso a nómina ni administración técnica.',
    permissions:['dashboard.view','clients.manage','sales.view','purchases.manage','banking.manage','reports.view','audit.view'],
    modules:['dashboard','clientes','ventas','compras','proveedores','bancos','libro-mayor','balance-sumas-saldos','estados-financieros','reportes','analytics','auditoria','soporte']
  },
  {
    id:'role-vendedor', name:'Vendedor / Caja', tone:'success', description:'CRM, cotizaciones, ventas, pedidos y POS.',
    scope:'Crea clientes, cotizaciones, ventas, pedidos y POS. Puede consultar tracking y soporte; no ve contabilidad, nómina ni backend.',
    permissions:['dashboard.view','clients.manage','sales.manage','sales.view','orders.manage','orders.view'],
    modules:['dashboard','clientes','cotizacion','ventas','historial','pedidos','pos-sede','tracking-pedidos','soporte']
  },
  {
    id:'role-inventario', name:'Inventario / Almacén', tone:'warning', description:'Productos, stock, kardex, escaneo, alertas y movimientos.',
    scope:'Controla productos, existencias, kardex, escaneo y reportes de stock. No ve finanzas internas ni nómina.',
    permissions:['dashboard.view','inventory.manage','reports.view','audit.view'],
    modules:['dashboard','inventario','inventario-scan','kardex','qr','reportes','auditoria','soporte']
  },
  {
    id:'role-compras', name:'Compras / Proveedores', tone:'warning', description:'Proveedores, órdenes de compra, costos e inventario entrante.',
    scope:'Gestiona proveedores, compras y seguimiento de inventario recibido. No emite ventas ni cambia permisos.',
    permissions:['dashboard.view','purchases.manage','inventory.manage','reports.view'],
    modules:['dashboard','proveedores','compras','inventario','kardex','reportes','soporte']
  },
  {
    id:'role-rrhh', name:'RRHH', tone:'slate', description:'Nómina, empleados, incidencias y reportes humanos.',
    scope:'Trabaja nómina, RRHH y reportes del área. Sin acceso a backend, demos comerciales ni administración de permisos.',
    permissions:['dashboard.view','payroll.manage','reports.view','audit.view'],
    modules:['dashboard','nomina','rrhh','reportes','auditoria','soporte']
  },
  {
    id:'role-auditor', name:'Auditor interno', tone:'danger', description:'Lectura, auditoría, bitácora, controles y reportes de cumplimiento.',
    scope:'Perfil de revisión. Ve reportes, auditoría, bitácoras y pretesting, sin editar operaciones transaccionales.',
    permissions:['dashboard.view','reports.view','audit.view'],
    modules:['dashboard','reportes','libro-mayor','balance-sumas-saldos','hoja-trabajo','estados-financieros','auditoria','pretesting','modulos-madurez','normativa','normativa-contable','soporte']
  },
  {
    id:'role-soporte', name:'Soporte técnico interno', tone:'accent', description:'Monitoreo, bitácora, fallas, APIs y asistencia sin tocar permisos críticos.',
    scope:'Revisa fallas, monitoreo, backend/APIs, soporte y pretesting. No puede cambiar roles ni crear demos salvo que el admin lo habilite.',
    permissions:['dashboard.view','reports.view','audit.view','support.manage'],
    modules:['dashboard','auditoria','backend','pretesting','soporte','ayuda','asistente-ia']
  },
  {
    id:'role-demo', name:'Demo limitado', tone:'accent', description:'Usuario comercial con vencimiento, contraseña temporal y módulos recortados.',
    scope:'Acceso temporal para prospectos. El administrador define días, máximo de módulos y módulos por rol; caduca automáticamente.',
    permissions:['dashboard.view','clients.manage','sales.view','orders.view','reports.view'],
    modules:['dashboard','clientes','ventas','pedidos','tracking-pedidos','analytics','soporte']
  },
  {
    id:'role-lectura', name:'Solo lectura', tone:'slate', description:'Consulta ejecutiva sin modificar datos.',
    scope:'Puede revisar dashboard, reportes y ayuda sin editar registros ni descargar configuraciones sensibles.',
    permissions:['dashboard.view','reports.view'],
    modules:['dashboard','reportes','analytics','ayuda','soporte']
  }
];

function daysFromNow(days) {
  return new Date(Date.now() + Number(days || 0) * 86400000).toISOString();
}

function slugId(value = 'demo') {
  return String(value || 'demo').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40) || 'demo';
}


function sanitizeUser(user = {}) {
  const copy = { ...user };
  delete copy.password;
  return copy;
}

function buildUsers() {
  return [
    { id:'user-admin', fullName:'Admin Principal', email:'admin@empresa.com', roleId:'role-admin', status:'active', demo:false, maxModules:999, demoExpiresAt:null },
    { id:'user-gerente', fullName:'Gabriel Gerente', email:'gerente@empresa.com', roleId:'role-gerente', status:'active', demo:false, maxModules:30, demoExpiresAt:null },
    { id:'user-contador', fullName:'María Contador', email:'contador@empresa.com', roleId:'role-contador', status:'active', demo:false, maxModules:18, demoExpiresAt:null },
    { id:'user-tesoreria', fullName:'Teresa Finanzas', email:'tesoreria@empresa.com', roleId:'role-tesoreria', status:'active', demo:false, maxModules:10, demoExpiresAt:null },
    { id:'user-ventas', fullName:'Carlos Ventas', email:'ventas@empresa.com', roleId:'role-vendedor', status:'active', demo:false, maxModules:9, demoExpiresAt:null },
    { id:'user-inventario', fullName:'Ana Inventario', email:'inventario@empresa.com', roleId:'role-inventario', status:'active', demo:false, maxModules:7, demoExpiresAt:null },
    { id:'user-compras', fullName:'Pedro Compras', email:'compras@empresa.com', roleId:'role-compras', status:'active', demo:false, maxModules:7, demoExpiresAt:null },
    { id:'user-rrhh', fullName:'Laura RRHH', email:'rrhh@empresa.com', roleId:'role-rrhh', status:'active', demo:false, maxModules:5, demoExpiresAt:null },
    { id:'user-auditor', fullName:'Alejandra Auditoría', email:'auditor@empresa.com', roleId:'role-auditor', status:'active', demo:false, maxModules:7, demoExpiresAt:null },
    { id:'user-soporte', fullName:'Samuel Soporte', email:'soporte@empresa.com', roleId:'role-soporte', status:'active', demo:false, maxModules:7, demoExpiresAt:null },
    { id:'user-demo', fullName:'Usuario Demo Comercial', email:'demo@empresa.com', roleId:'role-demo', status:'active', demo:true, maxModules:7, demoExpiresAt:daysFromNow(14) },
    { id:'user-readonly-demo', fullName:'Prospecto Solo Lectura', email:'lectura@empresa.com', roleId:'role-lectura', status:'active', demo:true, maxModules:4, demoExpiresAt:daysFromNow(7) }
  ];
}

export const AccessControlService = {
  modules: MODULE_CATALOG_ACCESS,
  roles: ROLE_DEFINITIONS,
  defaultState() {
    return {
      activeUserId:'user-admin',
      roles: ROLE_DEFINITIONS.map((role) => ({ ...role, permissions:[...role.permissions], modules:[...role.modules] })),
      users: buildUsers(),
      demoPolicy: { defaultDays:14, warningDays:3, maxUsers:3, maxModules:7 },
      audit: []
    };
  },
  ensure(rbac) {
    if (!rbac?.roles?.length || !rbac?.users?.length) return this.defaultState();
    const base = this.defaultState();
    const savedRoles = rbac.roles || [];
    const mergedRoles = [
      ...base.roles.map((baseRole) => ({ ...baseRole, ...(savedRoles.find((role) => role.id === baseRole.id) || {}) })),
      ...savedRoles.filter((role) => !base.roles.some((baseRole) => baseRole.id === role.id))
    ].map((role) => ({ ...role, permissions: role.permissions || [], modules: role.modules || [] }));
    const savedUsers = rbac.users || [];
    const mergedUsers = [
      ...base.users.map((baseUser) => ({ ...baseUser, ...(savedUsers.find((user) => user.id === baseUser.id) || {}) })),
      ...savedUsers.filter((user) => !base.users.some((baseUser) => baseUser.id === user.id))
    ].map(sanitizeUser);
    return { ...base, ...rbac, roles: mergedRoles, users: mergedUsers };
  },
  activeUser(state) {
    const rbac = this.ensure(state?.rbac);
    return rbac.users.find((user) => user.id === rbac.activeUserId) || rbac.users[0];
  },
  roleForUser(state, user = this.activeUser(state)) {
    const rbac = this.ensure(state?.rbac);
    return rbac.roles.find((role) => role.id === user?.roleId) || rbac.roles[0];
  },
  modulesForRole(role) {
    return new Set(role?.modules || []);
  },
  permissionsForRole(role) {
    return new Set(role?.permissions || []);
  },
  modulesForUser(user, role) {
    const modules = [...(role?.modules || [])];
    if (!user?.demo) return modules;
    const limit = Math.max(1, Number(user.maxModules || this.defaultState().demoPolicy.maxModules || modules.length));
    return modules.slice(0, limit);
  },
  canAccessRoute(state, route) {
    if (!route || CORE_ROUTES.includes(route)) return true;
    const user = this.activeUser(state);
    const role = this.roleForUser(state, user);
    if (role?.id === 'role-admin') return true;
    if (ADMIN_ONLY_ROUTES.has(route)) return false;
    if (user?.status !== 'active') return false;
    if (user?.demo && user.demoExpiresAt && new Date(user.demoExpiresAt).getTime() < Date.now()) return false;
    return new Set(this.modulesForUser(user, role)).has(route);
  },
  routeStatus(state, route) {
    const user = this.activeUser(state);
    const role = this.roleForUser(state, user);
    return { allowed:this.canAccessRoute(state, route), user, role };
  },
  remaining(user) {
    if (!user?.demo || !user.demoExpiresAt) return { label:'Sin vencimiento', expired:false, days:null, hours:null };
    const ms = new Date(user.demoExpiresAt).getTime() - Date.now();
    if (ms <= 0) return { label:'Expirado', expired:true, days:0, hours:0 };
    const days = Math.floor(ms / 86400000);
    const hours = Math.floor((ms % 86400000) / 3600000);
    return { label:`${days}d ${hours}h`, expired:false, days, hours };
  },
  toggleModule(rbacInput, roleId, route) {
    const rbac = this.ensure(rbacInput);
    rbac.roles = rbac.roles.map((role) => {
      if (role.id !== roleId) return role;
      const set = new Set(role.modules || []);
      set.has(route) ? set.delete(route) : set.add(route);
      if (role.id !== 'role-admin') set.add('dashboard');
      return { ...role, modules:[...set] };
    });
    rbac.audit = [{ at:new Date().toISOString(), action:'toggle-module', roleId, route }, ...(rbac.audit || [])].slice(0, 40);
    return rbac;
  },
  setActiveUser(rbacInput, userId) {
    const rbac = this.ensure(rbacInput);
    return { ...rbac, activeUserId:userId, audit:[{ at:new Date().toISOString(), action:'switch-user', userId }, ...(rbac.audit || [])].slice(0, 40) };
  },
  updateDemoDays(rbacInput, userId, days) {
    const rbac = this.ensure(rbacInput);
    const expiresAt = daysFromNow(Number(days || 0));
    rbac.users = rbac.users.map((user) => user.id === userId ? { ...user, demo:true, demoExpiresAt:expiresAt } : user);
    rbac.audit = [{ at:new Date().toISOString(), action:'update-demo-days', userId, days:Number(days || 0) }, ...(rbac.audit || [])].slice(0, 40);
    return rbac;
  },
  upsertDemoUser(rbacInput, data = {}) {
    const rbac = this.ensure(rbacInput);
    const email = String(data.email || '').trim().toLowerCase();
    const id = data.id || `user-demo-${slugId(email || data.fullName || Date.now())}`;
    const existing = rbac.users.find((user) => user.id === id || String(user.email).toLowerCase() === email);
    const roleId = data.roleId || existing?.roleId || 'role-demo';
    const maxModules = Number(data.maxModules || existing?.maxModules || rbac.demoPolicy.maxModules || 7);
    const days = Number(data.days || data.demoDays || 14);
    const user = {
      ...(existing || {}),
      id: existing?.id || id,
      fullName: String(data.fullName || existing?.fullName || 'Usuario Demo').trim(),
      email: email || existing?.email || `demo-${Date.now()}@empresa.com`,
      roleId,
      status: data.status || existing?.status || 'active',
      demo: true,
      maxModules,
      demoExpiresAt: data.demoExpiresAt || daysFromNow(days)
    };
    rbac.users = [user, ...rbac.users.filter((item) => item.id !== user.id && String(item.email).toLowerCase() !== String(user.email).toLowerCase())].map(sanitizeUser);
    rbac.activeUserId = data.activate ? user.id : rbac.activeUserId;
    rbac.audit = [{ at:new Date().toISOString(), action: existing ? 'update-demo-user' : 'create-demo-user', userId:user.id, email:user.email, maxModules }, ...(rbac.audit || [])].slice(0, 60);
    return rbac;
  },
  updateUser(rbacInput, userId, data = {}) {
    const rbac = this.ensure(rbacInput);
    rbac.users = rbac.users.map((user) => {
      if (user.id !== userId) return user;
      const days = data.days ?? data.demoDays;
      return {
        ...user,
        fullName: data.fullName ?? user.fullName,
        email: data.email ?? user.email,
        roleId: data.roleId ?? user.roleId,
        status: data.status ?? user.status,
        maxModules: data.maxModules !== undefined ? Number(data.maxModules) : user.maxModules,
        demo: data.demo !== undefined ? Boolean(data.demo) : user.demo,
        demoExpiresAt: days !== undefined ? daysFromNow(Number(days)) : (data.demoExpiresAt ?? user.demoExpiresAt)
      };
    }).map(sanitizeUser);
    rbac.audit = [{ at:new Date().toISOString(), action:'edit-user', userId, data:Object.keys(data) }, ...(rbac.audit || [])].slice(0, 60);
    return rbac;
  },
  routePermission(route) {
    return MODULE_CATALOG_ACCESS.find((item) => item.route === route)?.permission || 'modules.manage';
  }
};

