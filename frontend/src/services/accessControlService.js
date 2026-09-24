import { ACCESS_MANIFEST as accessManifest } from 'contagest-ve-backend/access-manifest';

const manifestModules=Array.isArray(accessManifest?.modules)?accessManifest.modules:[];
const CORE_ROUTES = ['login',...manifestModules.filter((module)=>module.coreAccess===true).map((module)=>module.route)];
const ADMIN_ONLY_ROUTES = new Set(manifestModules.filter((module)=>module.adminOnly===true).map((module)=>module.route));

export const MODULE_CATALOG_ACCESS = Object.freeze(manifestModules.map((module)=>Object.freeze({
  route:String(module.route),
  label:String(module.name),
  permission:String(module.permission),
  group:String(module.accessGroup||module.area||'General')
})));

const permissionByRoute = new Map(MODULE_CATALOG_ACCESS.map((module)=>[module.route,module.permission]));
const routePermissions = new Set(permissionByRoute.values());
const canonicalModules = (modules=[]) => [...new Set((Array.isArray(modules)?modules:[]).map(String).filter((route)=>permissionByRoute.has(route)))];
const permissionsForModules = (modules=[]) => [...new Set(canonicalModules(modules).map((route)=>permissionByRoute.get(route)).filter(Boolean))];
const normalizeRoleDefinition = (role={}) => {
  const modules=canonicalModules(role.modules);
  const capabilityPermissions=(role.permissions||[]).map(String).filter((permission)=>!routePermissions.has(permission));
  return {
    ...role,
    modules,
    permissions:[...new Set([...capabilityPermissions,...permissionsForModules(modules)])]
  };
};

const allModules = MODULE_CATALOG_ACCESS.map((module) => module.route);
const ROLE_DEFINITION_INPUT = [
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
 ];

const ROLE_DEFINITIONS = ROLE_DEFINITION_INPUT.map((role)=>normalizeRoleDefinition(role));

function daysFromNow(days) { return new Date(Date.now() + Number(days || 0) * 86400000).toISOString(); }
function slugId(value = 'access') { return String(value || 'access').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40) || 'access'; }
function sanitizeUser(user = {}) { const copy = { ...user }; delete copy.password; return copy; }
function normalizeEnabledModules(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string') {
    try { const parsed=JSON.parse(value); if(Array.isArray(parsed))return parsed.map(String).filter(Boolean); } catch { /* csv fallback */ }
    return value.split(',').map((item)=>item.trim()).filter(Boolean);
  }
  return [];
}

function buildUsers() {
  return [
    { id:'user-admin', fullName:'Admin Principal', email:'admin@empresa.com', roleId:'role-admin', status:'active', demo:false, maxModules:999, demoExpiresAt:null },
    { id:'user-gerente', fullName:'Gabriel Gerente', email:'gerente@empresa.com', roleId:'role-gerente', status:'active', demo:false, maxModules:30, demoExpiresAt:null },
    { id:'user-contador', fullName:'María Contador', email:'contador@empresa.com', roleId:'role-contador', status:'active', demo:false, maxModules:18, demoExpiresAt:null },
    { id:'user-tesoreria', fullName:'Teresa Finanzas', email:'tesoreria@empresa.com', roleId:'role-tesoreria', status:'active', demo:false, maxModules:10, demoExpiresAt:null },
    { id:'user-ventas', fullName:'Carlos Ventas', email:'ventas@empresa.com', roleId:'role-vendedor', status:'active', demo:false, maxModules:10, demoExpiresAt:null },
    { id:'user-clinica', fullName:'Profesional de salud', email:'consulta@empresa.com', roleId:'role-clinica', status:'active', demo:false, maxModules:12, demoExpiresAt:null },
    { id:'user-veterinaria', fullName:'Profesional veterinario', email:'veterinaria@empresa.com', roleId:'role-veterinaria', status:'active', demo:false, maxModules:16, demoExpiresAt:null },
    { id:'user-psicologia', fullName:'Profesional de psicología', email:'psicologia@empresa.com', roleId:'role-psicologia', status:'active', demo:false, maxModules:10, demoExpiresAt:null },
    { id:'user-odontologia', fullName:'Profesional odontológico', email:'odontologia@empresa.com', roleId:'role-odontologia', status:'active', demo:false, maxModules:10, demoExpiresAt:null },
    { id:'user-nutricion', fullName:'Profesional de nutrición', email:'nutricion@empresa.com', roleId:'role-nutricion', status:'active', demo:false, maxModules:7, demoExpiresAt:null },
    { id:'user-inventario', fullName:'Ana Inventario', email:'inventario@empresa.com', roleId:'role-inventario', status:'active', demo:false, maxModules:7, demoExpiresAt:null },
    { id:'user-compras', fullName:'Pedro Compras', email:'compras@empresa.com', roleId:'role-compras', status:'active', demo:false, maxModules:7, demoExpiresAt:null },
    { id:'user-rrhh', fullName:'Laura RRHH', email:'rrhh@empresa.com', roleId:'role-rrhh', status:'active', demo:false, maxModules:5, demoExpiresAt:null },
    { id:'user-auditor', fullName:'Alejandra Auditoría', email:'auditor@empresa.com', roleId:'role-auditor', status:'active', demo:false, maxModules:7, demoExpiresAt:null },
    { id:'user-soporte', fullName:'Samuel Soporte', email:'soporte@empresa.com', roleId:'role-soporte', status:'active', demo:false, maxModules:7, demoExpiresAt:null },
    { id:'user-demo', fullName:'Acceso comercial temporal', email:'demo@empresa.com', roleId:'role-demo', status:'active', demo:true, maxModules:7, enabledModules:['dashboard','clientes','ventas','pedidos','tracking-pedidos','analytics','soporte'], demoExpiresAt:daysFromNow(14) },
    { id:'user-readonly-demo', fullName:'Acceso de consulta', email:'lectura@empresa.com', roleId:'role-lectura', status:'active', demo:true, maxModules:4, enabledModules:['dashboard','reportes','analytics','ayuda'], demoExpiresAt:daysFromNow(7) }
  ];
}

export const AccessControlService = {
  modules:MODULE_CATALOG_ACCESS,
  roles:ROLE_DEFINITIONS,
  defaultState() { return { activeUserId:'user-admin', roles:ROLE_DEFINITIONS.map((role)=>({ ...role, permissions:[...role.permissions], modules:[...role.modules] })), users:buildUsers(), demoPolicy:{ defaultDays:14, warningDays:3, maxUsers:3, maxModules:7 }, audit:[] }; },
  ensure(rbac) {
    if (!rbac?.roles?.length || !rbac?.users?.length) return this.defaultState();
    const base=this.defaultState(); const savedRoles=rbac.roles||[];
    const mergedRoles=[...base.roles.map((baseRole)=>({ ...baseRole, ...(savedRoles.find((role)=>role.id===baseRole.id)||{}) })), ...savedRoles.filter((role)=>!base.roles.some((baseRole)=>baseRole.id===role.id))].map((role)=>normalizeRoleDefinition(role));
    const savedUsers=rbac.users||[];
    const mergedUsers=[...base.users.map((baseUser)=>({ ...baseUser, ...(savedUsers.find((user)=>user.id===baseUser.id)||{}) })), ...savedUsers.filter((user)=>!base.users.some((baseUser)=>baseUser.id===user.id))].map(sanitizeUser);
    return { ...base, ...rbac, roles:mergedRoles, users:mergedUsers };
  },
  activeUser(state) { const rbac=this.ensure(state?.rbac); return rbac.users.find((user)=>user.id===rbac.activeUserId)||rbac.users[0]; },
  roleForUser(state,user=this.activeUser(state)) { const rbac=this.ensure(state?.rbac); return rbac.roles.find((role)=>role.id===user?.roleId)||rbac.roles[0]; },
  modulesForRole(role) { return new Set(canonicalModules(role?.modules)); },
  permissionsForRole(role) { return new Set(role?.permissions||[]); },
  modulesForUser(user,role) {
    const roleModules=canonicalModules(role?.modules);
    if(!user?.demo)return roleModules;
    const limit=Math.max(1,Number(user.maxModules||this.defaultState().demoPolicy.maxModules||roleModules.length));
    const explicit=normalizeEnabledModules(user.enabledModules||user.selectedModules||user.modules).filter((route)=>roleModules.includes(route));
    return (explicit.length?explicit:roleModules).slice(0,limit);
  },
  canAccessRoute(state,route) {
    if(!route||CORE_ROUTES.includes(route))return true;
    const user=this.activeUser(state); const role=this.roleForUser(state,user);
    if(role?.id==='role-admin')return true;
    if(ADMIN_ONLY_ROUTES.has(route))return false;
    if(user?.status!=='active')return false;
    if(user?.demo&&user.demoExpiresAt&&new Date(user.demoExpiresAt).getTime()<Date.now())return false;
    return new Set(this.modulesForUser(user,role)).has(route);
  },
  routeStatus(state,route) { const user=this.activeUser(state);const role=this.roleForUser(state,user);return { allowed:this.canAccessRoute(state,route),user,role }; },
  remaining(user) {
    if(!user?.demo||!user.demoExpiresAt)return { label:'Sin vencimiento',expired:false,days:null,hours:null };
    const ms=new Date(user.demoExpiresAt).getTime()-Date.now(); if(ms<=0)return { label:'Expirado',expired:true,days:0,hours:0 };
    const days=Math.floor(ms/86400000);const hours=Math.floor((ms%86400000)/3600000);return { label:`${days}d ${hours}h`,expired:false,days,hours };
  },
  toggleModule(rbacInput,roleId,route) {
    const rbac=this.ensure(rbacInput);
    if(!permissionByRoute.has(route))return rbac;
    rbac.roles=rbac.roles.map((role)=>{
      if(role.id!==roleId)return role;
      const set=new Set(canonicalModules(role.modules));
      set.has(route)?set.delete(route):set.add(route);
      if(role.id!=='role-admin')set.add('dashboard');
      return normalizeRoleDefinition({ ...role,modules:[...set] });
    });
    rbac.audit=[{ at:new Date().toISOString(),action:'toggle-module',roleId,route },...(rbac.audit||[])].slice(0,40);return rbac;
  },
  setActiveUser(rbacInput,userId) { const rbac=this.ensure(rbacInput);return { ...rbac,activeUserId:userId,audit:[{ at:new Date().toISOString(),action:'switch-user',userId },...(rbac.audit||[])].slice(0,40) }; },
  updateDemoDays(rbacInput,userId,days) { const rbac=this.ensure(rbacInput);const expiresAt=daysFromNow(Number(days||0));rbac.users=rbac.users.map((user)=>user.id===userId?{ ...user,demo:true,demoExpiresAt:expiresAt }:user);rbac.audit=[{ at:new Date().toISOString(),action:'update-demo-days',userId,days:Number(days||0) },...(rbac.audit||[])].slice(0,40);return rbac; },
  upsertDemoUser(rbacInput,data={}) {
    const rbac=this.ensure(rbacInput); const email=String(data.email||'').trim().toLowerCase(); const id=data.id||`user-demo-${slugId(email||data.fullName||Date.now())}`; const existing=rbac.users.find((user)=>user.id===id||String(user.email).toLowerCase()===email); const roleId=data.roleId||existing?.roleId||'role-demo'; const role=rbac.roles.find((item)=>item.id===roleId)||rbac.roles.find((item)=>item.id==='role-demo'); const maxModules=Math.max(1,Number(data.maxModules||existing?.maxModules||rbac.demoPolicy.maxModules||7)); const days=Number(data.days||data.demoDays||14);
    const requested=normalizeEnabledModules(data.enabledModules!==undefined?data.enabledModules:data.selectedModules!==undefined?data.selectedModules:existing?.enabledModules||existing?.selectedModules).filter((route)=>permissionByRoute.has(route)); const roleModules=canonicalModules(role?.modules); const enabledModules=(requested.length?requested:roleModules).filter((route)=>roleModules.includes(route)).slice(0,maxModules);
    const user={ ...(existing||{}),id:existing?.id||id,fullName:String(data.fullName||existing?.fullName||'Acceso temporal').trim(),email:email||existing?.email||`access-${Date.now()}@empresa.com`,roleId,status:data.status||existing?.status||'active',demo:true,maxModules,enabledModules,selectedModules:enabledModules,demoExpiresAt:data.demoExpiresAt||daysFromNow(days) };
    rbac.users=[user,...rbac.users.filter((item)=>item.id!==user.id&&String(item.email).toLowerCase()!==String(user.email).toLowerCase())].map(sanitizeUser);rbac.activeUserId=data.activate?user.id:rbac.activeUserId;rbac.audit=[{ at:new Date().toISOString(),action:existing?'update-demo-user':'create-demo-user',userId:user.id,email:user.email,maxModules,enabledModules },...(rbac.audit||[])].slice(0,60);return rbac;
  },
  updateUser(rbacInput,userId,data={}) {
    const rbac=this.ensure(rbacInput); rbac.users=rbac.users.map((user)=>{if(user.id!==userId)return user;const days=data.days??data.demoDays;const roleId=data.roleId??user.roleId;const role=rbac.roles.find((item)=>item.id===roleId);const maxModules=data.maxModules!==undefined?Math.max(1,Number(data.maxModules)):user.maxModules;const requested=normalizeEnabledModules(data.enabledModules!==undefined?data.enabledModules:user.enabledModules).filter((route)=>permissionByRoute.has(route));const enabledModules=requested.filter((route)=>canonicalModules(role?.modules).includes(route)).slice(0,maxModules);return { ...user,fullName:data.fullName??user.fullName,email:data.email??user.email,roleId,status:data.status??user.status,maxModules,enabledModules,demo:data.demo!==undefined?Boolean(data.demo):user.demo,demoExpiresAt:days!==undefined?daysFromNow(Number(days)):(data.demoExpiresAt??user.demoExpiresAt) };}).map(sanitizeUser);rbac.audit=[{ at:new Date().toISOString(),action:'edit-user',userId,data:Object.keys(data) },...(rbac.audit||[])].slice(0,60);return rbac;
  },
  routePermission(route) { return MODULE_CATALOG_ACCESS.find((item)=>item.route===route)?.permission||null; }
};
