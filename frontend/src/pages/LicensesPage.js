import { PageHeader, Button, Badge, Field, Select } from '../components/ui/index.js';
import { LicenseService } from '../services/licenseService.js';
import { CommercialService } from '../services/commercialService.js';
import { DemoAccessService } from '../services/demoAccessService.js';
import { downloadCommercialCsv, downloadCommercialPdf } from '../utils/commercialExport.js';
import { escapeHtml } from '../utils/dom.js';

const sectorOptions = [
  { value:'comercio', label:'Comercio / ventas' },
  { value:'servicios', label:'Servicios profesionales' },
  { value:'contador', label:'Contabilidad / firma' },
  { value:'restaurante', label:'Restaurante / alimentos' },
  { value:'salud', label:'Salud / práctica médica' },
  { value:'veterinaria', label:'Veterinaria' },
  { value:'psicologia', label:'Psicología' },
  { value:'odontologia', label:'Odontología' },
  { value:'gimnasio', label:'Gimnasio / fitness' },
  { value:'nutricion', label:'Nutrición' },
  { value:'manufactura', label:'Manufactura' },
  { value:'distribucion', label:'Distribución' },
  { value:'profesional', label:'Profesional independiente' },
  { value:'otro', label:'Otro rubro' }
];

const sectorDefaults = {
  salud:['dashboard','salud','clientes','reportes','analytics','soporte'],
  veterinaria:['dashboard','veterinaria','clientes','inventario','reportes','analytics','soporte'],
  psicologia:['dashboard','psicologia','clientes','reportes','analytics','mensajes','soporte'],
  odontologia:['dashboard','odontologia','clientes','reportes','analytics','mensajes','soporte'],
  gimnasio:['dashboard','gimnasio','rutinas','nutricion','clientes','reportes','analytics','soporte'],
  nutricion:['dashboard','nutricion','clientes','reportes','analytics','mensajes','soporte'],
  contador:['dashboard','contabilidad','plan-cuentas','libro-mayor','balance-sumas-saldos','hoja-trabajo','estados-financieros','cierre-contable','bancos','tributos','libro-ventas','reportes','analytics','soporte'],
  restaurante:['dashboard','ventas','pedidos','pos-sede','tracking-pedidos','inventario','reportes','soporte'],
  comercio:['dashboard','ventas','cotizacion','clientes','inventario','kardex','compras','reportes','analytics','soporte'],
  servicios:['dashboard','cotizacion','clientes','ventas','reportes','analytics','soporte']
};

const statusLabels={trial:'Trial',active:'Activa',past_due:'Morosa',suspended:'Suspendida',cancelled:'Cancelada',expired:'Vencida',earned:'Devengada',paid:'Pagada',pending:'Pendiente',failed:'Fallida',refunded:'Reembolsada',void:'Anulada'};
const statusTone=(status)=>status==='active'||status==='paid'?'success':status==='trial'?'brand':status==='past_due'||status==='earned'||status==='pending'?'warning':status==='suspended'||status==='cancelled'||status==='expired'||status==='failed'||status==='void'?'danger':'neutral';
const money=(value,currency='USD')=>`${currency} ${Number(value||0).toLocaleString('es-VE',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const date=(value)=>value?new Date(value).toLocaleDateString('es-VE'):'—';
const dateTime=(value)=>value?new Date(value).toLocaleString('es-VE'):'—';
const inputDate=(value)=>value?new Date(value).toISOString().slice(0,16):'';
const statusBadge=(status)=>Badge(statusLabels[status]||status,statusTone(status));
const element=(form,name)=>form?.elements?.namedItem(name);

const exportColumns=[
  {key:'customerName',label:'Cliente',pdfWidth:22},
  {key:'customerRif',label:'RIF',pdfWidth:15},
  {key:'planCode',label:'Plan',pdfWidth:14},
  {key:'status',label:'Estado',pdfWidth:12,format:value=>statusLabels[value]||value},
  {key:'amount',label:'Importe',pdfWidth:14,format:(value,row)=>money(value,row.currency)},
  {key:'billingCycle',label:'Ciclo',pdfWidth:12},
  {key:'nextRenewalAt',label:'Renovación',pdfWidth:13,format:value=>date(value)},
  {key:'salesAgentName',label:'Vendedor',pdfWidth:18,format:value=>value||'—'}
];

function credentialsCard(credentials) {
  if (!credentials) return '';
  const text = [
    `Empresa: ${credentials.companyName}`,
    `RIF: ${credentials.tenantRif}`,
    `Rubro: ${credentials.businessSector}`,
    `Correo: ${credentials.email}`,
    `Contraseña temporal: ${credentials.temporaryPassword}`,
    `Licencia: ${credentials.licenseKey}`,
    `Vence: ${new Date(credentials.expiresAt).toLocaleString('es-VE')}`,
    `Módulos: ${(credentials.modules || []).join(', ')}`
  ].join('\n');
  return `<article class="cg-license-once surface" data-license-credentials="${escapeHtml(text)}">
    <div class="cg-license-once-icon"><i class="fa-solid fa-shield-keyhole"></i></div>
    <div class="cg-license-once-copy"><p class="cgx-eyebrow">Credenciales mostradas una sola vez</p><h3>${escapeHtml(credentials.companyName || 'Empresa')} · ${escapeHtml(credentials.businessSector || '')}</h3>
      <div class="cg-license-secret-grid"><span><small>RIF</small><strong>${escapeHtml(credentials.tenantRif)}</strong></span><span><small>Correo</small><strong>${escapeHtml(credentials.email)}</strong></span><span><small>Contraseña temporal</small><code>${escapeHtml(credentials.temporaryPassword)}</code></span><span><small>Licencia</small><code>${escapeHtml(credentials.licenseKey)}</code></span></div>
      <p class="cg-license-warning"><i class="fa-solid fa-triangle-exclamation"></i> Guarda esta información ahora. La contraseña y la licencia completas no se recuperan después. El primer equipo recibirá una credencial HttpOnly emitida por el servidor.</p>
    </div>
    <div class="cg-license-once-actions">${Button({ id:'btnCopyCredentials', text:'Copiar credenciales', icon:'fa-copy', variant:'primary' })}${Button({ id:'btnDismissCredentials', text:'Ocultar', icon:'fa-eye-slash', variant:'secondary' })}</div>
  </article>`;
}

function licenseRows(licenses) {
  if (!licenses.length) return '<tr><td colspan="10" class="text-center">No hay licencias técnicas emitidas para esta empresa.</td></tr>';
  return licenses.map((license) => `<tr>
    <td><strong>${escapeHtml(license.userEmail)}</strong><br><small>${escapeHtml(license.companyRif || license.company?.rif || '')}</small></td><td>${escapeHtml(license.businessSector || 'general')}</td><td>${escapeHtml(license.plan)}</td>
    <td>${license.subscriptionId?`<code>${escapeHtml(String(license.subscriptionId).slice(0,8))}…</code>`:'Prueba/legacy'}</td><td><code>${escapeHtml(license.keyPreview || 'Oculta')}</code></td><td>${date(license.expiresAt)}</td>
    <td>${(license.modules || []).slice(0,4).map(escapeHtml).join(', ')}${(license.modules || []).length > 4 ? '…' : ''}</td><td>${Number(license.devicesUsed || 0)} / ${Number(license.maxDevices || 1)}</td><td>${statusBadge(license.status)}</td>
    <td><div class="cg-row-actions"><button type="button" class="cgx-icon-action" data-license-devices="${escapeHtml(license.id)}" aria-label="Ver activaciones" title="Ver activaciones"><i class="fa-solid fa-laptop-file"></i></button>${license.status === 'active' ? `<button type="button" class="cgx-icon-action" data-license-revoke="${escapeHtml(license.id)}" aria-label="Revocar licencia" title="Revocar licencia"><i class="fa-solid fa-ban"></i></button>` : ''}</div></td>
  </tr>`).join('');
}

function filteredSubscriptions(state) {
  const c=state.commercial||{};
  const filters=c.filters||{};
  const packages=c.plans?.optionalPackages||{};
  const verticalModules=filters.vertical?(packages[filters.vertical]?.modules||[filters.vertical]):[];
  const q=String(filters.q||'').trim().toLowerCase();
  return (c.subscriptions||[]).filter((subscription)=>{
    if(q&&![subscription.customerName,subscription.customerRif,subscription.planCode,subscription.salesAgentName].some(value=>String(value||'').toLowerCase().includes(q)))return false;
    if(filters.planCode&&subscription.planCode!==filters.planCode)return false;
    if(filters.salesAgentId&&subscription.salesAgentId!==filters.salesAgentId)return false;
    if(filters.status&&subscription.status!==filters.status)return false;
    if(verticalModules.length&&!subscription.modules?.some(module=>module.status==='active'&&verticalModules.includes(module.moduleCode)))return false;
    return true;
  });
}

function subscriptionRows(subscriptions) {
  if(!subscriptions.length)return '<tr><td colspan="9" class="text-center">No hay suscripciones que coincidan con los filtros.</td></tr>';
  return subscriptions.map(subscription=>{
    const activeTenants=Array.isArray(subscription.tenants)?subscription.tenants.filter(item=>item.status==='active').length:0;
    const activeModules=Array.isArray(subscription.modules)?subscription.modules.filter(item=>item.status==='active').length:0;
    const canToggle=['active','past_due','suspended'].includes(subscription.status);
    const canOperate=!['cancelled','expired'].includes(subscription.status);
    return `<tr><td><strong>${escapeHtml(subscription.customerName||'Cliente')}</strong><br><small>${escapeHtml(subscription.customerRif||'')}</small></td><td>${escapeHtml(subscription.planCode||'')}</td><td>${statusBadge(subscription.status)}</td><td>${money(subscription.amount,subscription.currency)}<br><small>${escapeHtml(subscription.billingCycle||'')}</small></td><td>${activeTenants} / ${Number(subscription.maxTenants||1)}</td><td>${activeModules}</td><td>${date(subscription.nextRenewalAt)}</td><td>${escapeHtml(subscription.salesAgentName||'—')}</td>
      <td><div class="cg-row-actions"><button class="btn btn-secondary" type="button" data-sub-edit="${escapeHtml(subscription.id)}" title="Editar contrato" aria-label="Editar contrato"><i class="fa-solid fa-pen-to-square"></i></button><button class="btn btn-secondary" type="button" data-sub-modules="${escapeHtml(subscription.id)}" title="Módulos contratados" aria-label="Módulos contratados"><i class="fa-solid fa-puzzle-piece"></i></button><button class="btn btn-secondary" type="button" data-sub-tenant="${escapeHtml(subscription.id)}" title="Empresas cubiertas" aria-label="Empresas cubiertas"><i class="fa-solid fa-building-circle-check"></i></button>${canOperate?`<button class="btn btn-secondary" type="button" data-sub-pay="${escapeHtml(subscription.id)}" title="Registrar pago" aria-label="Registrar pago"><i class="fa-solid fa-money-check-dollar"></i></button>`:''}${canToggle?`<button class="btn ${subscription.status==='suspended'?'btn-primary':'btn-danger'}" type="button" data-sub-toggle="${escapeHtml(subscription.id)}" title="${subscription.status==='suspended'?'Reactivar':'Suspender'}" aria-label="${subscription.status==='suspended'?'Reactivar':'Suspender'} suscripción"><i class="fa-solid ${subscription.status==='suspended'?'fa-play':'fa-pause'}"></i></button>`:''}</div></td></tr>`;
  }).join('');
}

function renewalRows(renewals) {
  if(!renewals.length)return '<tr><td colspan="6" class="text-center">Sin renovaciones en los próximos 30 días.</td></tr>';
  return renewals.map(item=>`<tr><td>${escapeHtml(item.customerName||'')}</td><td>${escapeHtml(item.planCode||'')}</td><td>${date(item.nextRenewalAt)}</td><td>${money(item.amount,item.currency)}</td><td>${escapeHtml(item.salesAgentName||'—')}</td><td>${statusBadge(item.status)}</td></tr>`).join('');
}
function paymentRows(payments) {
  if(!payments.length)return '<tr><td colspan="7" class="text-center">Aún no hay pagos comerciales registrados.</td></tr>';
  return payments.slice(0,40).map(item=>`<tr><td><strong>${escapeHtml(item.customerName||'')}</strong><br><small>${escapeHtml(item.customerRif||'')}</small></td><td>${escapeHtml(item.reference||'—')}</td><td>${money(item.amount,item.currency)}</td><td>${statusBadge(item.status)}</td><td>${date(item.periodStart)} → ${date(item.periodEnd)}</td><td>${dateTime(item.paidAt)}</td><td>${escapeHtml(item.method||'—')}</td></tr>`).join('');
}
function commissionRows(commissions) {
  if(!commissions.length)return '<tr><td colspan="8" class="text-center">Aún no hay comisiones devengadas.</td></tr>';
  return commissions.slice(0,80).map(item=>`<tr><td>${escapeHtml(item.salesAgentName||'')}</td><td>${escapeHtml(item.customerName||'')}</td><td>${escapeHtml(item.planCode||'')}</td><td>${money(item.baseAmount,item.currency)}</td><td>${Number(item.rate||0).toLocaleString('es-VE',{maximumFractionDigits:2})}%</td><td>${money(item.amount,item.currency)}</td><td>${statusBadge(item.status)}<br><small>${dateTime(item.paidAt||item.earnedAt)}</small></td><td>${item.status==='earned'?`<button type="button" class="btn btn-primary" data-commission-paid="${escapeHtml(item.id)}"><i class="fa-solid fa-circle-check"></i> Marcar pagada</button>`:'—'}</td></tr>`).join('');
}
function activityRows(activity) {
  if(!activity.length)return '<tr><td colspan="4" class="text-center">Sin actividad comercial auditable para la empresa activa.</td></tr>';
  return activity.slice(0,80).map(item=>`<tr><td><code>${escapeHtml(item.action||'')}</code></td><td>${escapeHtml(item.entity||'')}<br><small>${escapeHtml(String(item.entityId||'').slice(0,12))}</small></td><td>${escapeHtml(item.user?.fullName||item.user?.email||'Sistema')}</td><td>${dateTime(item.createdAt)}</td></tr>`).join('');
}

function commercialPanel(state){
  const c=state.commercial||{};
  const summary=c.summary||{};
  const customers=c.customers||[];
  const subscriptions=filteredSubscriptions(state);
  const agents=c.agents||[];
  const renewals=c.renewals||[];
  const payments=c.payments||[];
  const commissions=c.commissions||[];
  const activity=c.activity||[];
  const planMap=c.plans?.plans||{};
  const packageMap=c.plans?.optionalPackages||{};
  const filters=c.filters||{};
  const customerOptions=[{value:'',label:'Selecciona cliente'},...customers.map(item=>({value:item.id,label:`${item.legalName}${item.rif?` · ${item.rif}`:''}`}))];
  const agentOptions=[{value:'',label:'Sin vendedor'},...agents.filter(item=>item.status==='active').map(item=>({value:item.id,label:`${item.name} · ${Number(item.commissionRate||0)}%`}))];
  const planOptions=Object.entries(planMap).map(([value,item])=>({value,label:item.label||value}));
  const firstPlan=planMap[planOptions[0]?.value]||{};
  const filterPlanOptions=[{value:'',label:'Todos los planes'},...planOptions];
  const filterAgentOptions=[{value:'',label:'Todos los vendedores'},...agents.map(item=>({value:item.id,label:item.name}))];
  const filterVerticalOptions=[{value:'',label:'Todas las verticales'},...Object.entries(packageMap).filter(([,item])=>item.kind==='vertical').map(([value,item])=>({value,label:item.label||value}))];
  const filterStatusOptions=[{value:'',label:'Todos los estados'},...['trial','active','past_due','suspended','cancelled','expired'].map(value=>({value,label:statusLabels[value]}))];
  const error=c.error?`<div class="cg-license-warning" role="alert"><i class="fa-solid fa-triangle-exclamation"></i> ${escapeHtml(c.error)}</div>`:'';
  const loading=!c.loaded&&!c.error?'<div class="panel-soft p-4" role="status"><i class="fa-solid fa-spinner fa-spin"></i> Cargando datos comerciales…</div>':'';
  return `<section class="cgx-section" aria-labelledby="commercialTitle">
    <header class="cgx-section-head"><div><p class="cgx-eyebrow">Backoffice SaaS · plataforma</p><h2 id="commercialTitle">Administración comercial</h2><p>Clientes, contratos, MRR, empresas cubiertas, módulos, pagos y vendedores. Esta capa no almacena ni reemplaza las claves técnicas de acceso.</p></div><div class="cg-row-actions">${Button({id:'btnCommercialRefresh',text:'Actualizar',icon:'fa-rotate',variant:'secondary'})}${Button({id:'btnCommercialCsv',text:'CSV',icon:'fa-file-csv',variant:'secondary',type:'button'})}${Button({id:'btnCommercialPdf',text:'PDF',icon:'fa-file-pdf',variant:'secondary',type:'button'})}</div></header>
    <div class="cgx-section-body grid gap-4">${error}${loading}
      <div class="grid grid-cols-2 md:grid-cols-5 xl:grid-cols-10 gap-2"><article class="cgx-metric"><p>MRR</p><strong>${money(summary.mrr||0,'USD')}</strong></article><article class="cgx-metric"><p>Clientes act.</p><strong>${Number(summary.activeCustomers||0)}</strong></article><article class="cgx-metric"><p>Trials</p><strong>${Number(summary.trials||0)}</strong></article><article class="cgx-metric"><p>Morosas</p><strong>${Number(summary.pastDue||0)}</strong></article><article class="cgx-metric"><p>Vencidas</p><strong>${Number(summary.expired||0)}</strong></article><article class="cgx-metric"><p>Suspendidas</p><strong>${Number(summary.suspended||0)}</strong></article><article class="cgx-metric"><p>Empresas</p><strong>${Number(summary.coveredCompanies||0)}</strong></article><article class="cgx-metric"><p>Renov. 7d</p><strong>${Number(summary.renew7||0)}</strong></article><article class="cgx-metric"><p>Renov. 15d</p><strong>${Number(summary.renew15||0)}</strong></article><article class="cgx-metric"><p>Renov. 30d</p><strong>${Number(summary.renew30||0)}</strong></article></div>
      <form id="commercialFilterForm" class="panel-soft p-4 rounded-xl grid md:grid-cols-2 xl:grid-cols-6 gap-3" aria-label="Filtros comerciales">${Field({labelKey:'Buscar',name:'q',value:filters.q||'',attrs:'placeholder="Cliente, RIF, plan o vendedor"'})}${Select({labelKey:'Plan',name:'planCode',value:filters.planCode||'',options:filterPlanOptions})}${Select({labelKey:'Vendedor',name:'salesAgentId',value:filters.salesAgentId||'',options:filterAgentOptions})}${Select({labelKey:'Vertical',name:'vertical',value:filters.vertical||'',options:filterVerticalOptions})}${Select({labelKey:'Estado',name:'status',value:filters.status||'',options:filterStatusOptions})}<div class="cg-row-actions items-end">${Button({text:'Aplicar',icon:'fa-filter',variant:'primary',type:'submit'})}${Button({id:'btnCommercialFiltersClear',text:'Limpiar',icon:'fa-eraser',variant:'secondary',type:'button'})}</div></form>
      <div class="grid xl:grid-cols-3 gap-3">
        <form id="commercialCustomerForm" class="panel-soft p-4 rounded-xl grid gap-3"><div><h3>Nuevo cliente comercial</h3><p>No crea licencias automáticamente.</p></div>${Field({labelKey:'Razón social',name:'legalName',required:true})}${Field({labelKey:'RIF',name:'rif',required:false})}${Field({labelKey:'Contacto',name:'contactName',required:false})}${Field({labelKey:'Correo',name:'email',type:'email',required:false})}${Button({text:'Guardar cliente',icon:'fa-user-plus',variant:'primary',type:'submit'})}</form>
        <form id="commercialSubscriptionForm" class="panel-soft p-4 rounded-xl grid gap-3"><div><h3>Nueva suscripción</h3><p>Los límites iniciales provienen de la matriz comercial v1; el importe se registra como contrato y no se rellena con un precio oculto.</p></div>${Select({labelKey:'Cliente',name:'customerAccountId',value:'',options:customerOptions})}${Select({labelKey:'Plan',name:'planCode',value:planOptions[0]?.value||'profesional',options:planOptions.length?planOptions:[{value:'profesional',label:'Servicios Profesionales'}]})}${Select({labelKey:'Vendedor',name:'salesAgentId',value:'',options:agentOptions})}${Select({labelKey:'Ciclo',name:'billingCycle',value:'monthly',options:[{value:'monthly',label:'Mensual'},{value:'quarterly',label:'Trimestral'},{value:'semiannual',label:'Semestral'},{value:'annual',label:'Anual'}]})}${Field({labelKey:'Precio del ciclo (USD)',name:'amount',type:'number',value:'0',attrs:'min="0" step="0.01"'})}<div class="grid grid-cols-2 gap-2">${Field({labelKey:'Empresas máx.',name:'maxTenants',type:'number',value:String(firstPlan.maxTenants||1),attrs:'min="1"'})}${Field({labelKey:'Usuarios máx.',name:'maxUsers',type:'number',value:String(firstPlan.maxUsers||3),attrs:'min="1"'})}</div>${Button({text:'Crear suscripción',icon:'fa-file-signature',variant:'primary',type:'submit'})}</form>
        <form id="commercialAgentForm" class="panel-soft p-4 rounded-xl grid gap-3"><div><h3>Vendedor / partner</h3><p>La comisión se devenga al registrar un pago confirmado y se marca pagada de forma auditada.</p></div>${Field({labelKey:'Nombre',name:'name',required:true})}${Field({labelKey:'Correo',name:'email',type:'email',required:false})}${Field({labelKey:'Teléfono',name:'phone',required:false})}${Field({labelKey:'Comisión %',name:'commissionRate',type:'number',value:'10',attrs:'min="0" max="100" step="0.01"'})}${Button({text:'Guardar vendedor',icon:'fa-user-tie',variant:'primary',type:'submit'})}</form>
      </div>
      <section><header class="cg-license-form-head"><div><h3>Suscripciones</h3><p>${subscriptions.length} de ${(c.subscriptions||[]).length} registro(s) visibles. Cambiar plan no altera módulos silenciosamente; ambos contratos se administran por separado.</p></div></header><div class="pl-table-wrap"><table class="pl-table"><thead><tr><th>Cliente</th><th>Plan</th><th>Estado</th><th>Importe</th><th>Empresas</th><th>Módulos</th><th>Renueva</th><th>Vendedor</th><th>Acciones</th></tr></thead><tbody>${subscriptionRows(subscriptions)}</tbody></table></div></section>
      <div class="grid xl:grid-cols-2 gap-4"><section><header class="cg-license-form-head"><div><h3>Renovaciones próximas</h3><p>Detalle de la ventana de 30 días; los KPI separan 7, 15 y 30 días.</p></div></header><div class="pl-table-wrap"><table class="pl-table"><thead><tr><th>Cliente</th><th>Plan</th><th>Fecha</th><th>Importe</th><th>Vendedor</th><th>Estado</th></tr></thead><tbody>${renewalRows(renewals)}</tbody></table></div></section><section><header class="cg-license-form-head"><div><h3>Pagos recientes</h3><p>Conciliación comercial y períodos cubiertos.</p></div></header><div class="pl-table-wrap"><table class="pl-table"><thead><tr><th>Cliente</th><th>Referencia</th><th>Importe</th><th>Estado</th><th>Período</th><th>Pagado</th><th>Método</th></tr></thead><tbody>${paymentRows(payments)}</tbody></table></div></section></div>
      <section><header class="cg-license-form-head"><div><h3>Comisiones de vendedores</h3><p>Devengadas a partir de pagos confirmados; el cambio a pagada exige motivo y queda auditado.</p></div></header><div class="pl-table-wrap"><table class="pl-table"><thead><tr><th>Vendedor</th><th>Cliente</th><th>Plan</th><th>Base</th><th>%</th><th>Comisión</th><th>Estado</th><th>Acción</th></tr></thead><tbody>${commissionRows(commissions)}</tbody></table></div></section>
      <section><header class="cg-license-form-head"><div><h3>Actividad comercial auditable</h3><p>Operaciones <code>commercial.*</code> del contexto administrativo activo; no muestra secretos ni payloads completos.</p></div></header><div class="pl-table-wrap"><table class="pl-table"><thead><tr><th>Acción</th><th>Entidad</th><th>Actor</th><th>Fecha</th></tr></thead><tbody>${activityRows(activity)}</tbody></table></div></section>
    </div>
  </section>`;
}

function modalActions(saveText='Guardar') {
  return `<button type="button" class="cg-ui-button cg-ui-button-secondary" data-commercial-cancel>Cancelar</button><button type="button" class="cg-ui-button cg-ui-button-primary" data-commercial-save>${escapeHtml(saveText)}</button>`;
}

export const LicensesPage = {
  render(state) {
    const licenses = state.licenses || [];
    const isPlatform=Array.isArray(state.profile?.permissions)&&state.profile.permissions.includes('platform.manage');
    const modules = [...new Set([...DemoAccessService.modules, 'salud','veterinaria','psicologia','odontologia','gimnasio','rutinas','nutricion','mensajes','libro-mayor','balance-sumas-saldos','hoja-trabajo','estados-financieros','cierre-contable','tributos','libro-ventas'])];
    const selectedSector = state.licenseDraft?.businessSector || 'comercio';
    const defaults = sectorDefaults[selectedSector] || sectorDefaults.comercio;
    const moduleOptions = modules.map((module) => `<label class="cg-feature-pill"><input type="checkbox" name="modules" value="${escapeHtml(module)}" ${defaults.includes(module) ? 'checked' : ''}/><span>${escapeHtml(module)}</span></label>`).join('');
    const subscriptions=state.commercial?.subscriptions||[];
    const subscriptionOptions=[{value:'',label:'Sin suscripción / solo evaluación'},...subscriptions.filter(item=>['trial','active','past_due'].includes(item.status)).map(item=>({value:item.id,label:`${item.customerName} · ${item.planCode} · ${statusLabels[item.status]||item.status}`}))];

    return `<section class="cg-page-stack cg-license-page">
      ${PageHeader({eyebrowKey:'licensesEyebrow',titleKey:'Suscripciones y control de acceso',descKey:'La suscripción define qué se contrató; la licencia técnica define quién y qué dispositivo puede entrar.',actions:Button({id:'btnLicenseRefresh', text:'Actualizar licencias', icon:'fa-rotate', variant:'secondary'})})}
      ${isPlatform?commercialPanel(state):''}${credentialsCard(state.licenseCredentials)}
      <section class="cgx-section"><header class="cgx-section-head"><div><p class="cgx-eyebrow">Seguridad de acceso</p><h2>Licencias técnicas</h2><p>Ligadas a empresa, usuario, módulos, vigencia y dispositivos. No representan pagos ni facturas.</p></div></header><div class="cgx-section-body grid gap-4">
      <form id="licenseForm" class="surface cg-license-form"><div class="cg-license-form-head"><div><h3>Nueva licencia</h3><p>Queda vinculada al tenant/RIF activo. Si seleccionas una suscripción, el backend impide habilitar módulos o empresas no contratados.</p></div><span class="cg-license-tenant"><i class="fa-solid fa-building-shield"></i>${escapeHtml(state.settings?.companyName || 'Empresa activa')} · ${escapeHtml(state.settings?.companyRif || '')}</span></div>
        <div class="cg-license-fields">${Field({ labelKey:'Nombre del cliente', name:'fullName', value:'Cliente de prueba', required:true })}${Field({ labelKey:'Correo de acceso', name:'userEmail', type:'email', value:'prospecto@empresa.com', required:true })}${Select({ labelKey:'Rubro o perfil', name:'businessSector', value:selectedSector, options:sectorOptions })}${Select({ labelKey:'Uso autorizado', name:'commercialUse', value:'evaluacion', options:[{value:'evaluacion',label:'Evaluación comercial'},{value:'demostracion',label:'Demostración guiada'},{value:'operacion',label:'Operación contratada'},{value:'capacitacion',label:'Capacitación'},{value:'soporte',label:'Soporte'}] })}${Select({ labelKey:'Vigencia técnica', name:'plan', value:'trial', options:[{value:'trial',label:'Prueba'},{value:'monthly',label:'Mensual'},{value:'quarterly',label:'Trimestral'},{value:'annual',label:'Anual'},{value:'enterprise',label:'Enterprise'}] })}${isPlatform?Select({labelKey:'Suscripción comercial',name:'subscriptionId',value:'',options:subscriptionOptions}):''}${Field({ labelKey:'Días de uso', name:'days', type:'number', value:'15', required:true, attrs:'min="1" max="3650"' })}${Field({ labelKey:'Usuarios máximos', name:'maxUsers', type:'number', value:'1', required:true, attrs:'min="1" max="100"' })}${Field({ labelKey:'Dispositivos máximos', name:'maxDevices', type:'number', value:'1', required:true, attrs:'min="1" max="20"' })}</div>
        <div class="cg-license-modules"><p class="label">Módulos habilitados</p><div class="cg-feature-grid">${moduleOptions}</div></div><div class="cg-license-submit">${Button({id:'btnGenerateLicense', text:'Generar licencia y credenciales', icon:'fa-key', variant:'primary', type:'submit'})}</div>
      </form>
      <section class="surface cg-license-list"><header><div><h3>Licencias de la empresa activa</h3><p>${licenses.length} registro(s). Las claves completas nunca se vuelven a mostrar.</p></div></header><div class="pl-table-wrap"><table class="pl-table"><thead><tr><th>Usuario / empresa</th><th>Perfil</th><th>Vigencia</th><th>Suscripción</th><th>Key</th><th>Vence</th><th>Módulos</th><th>Dispositivos</th><th>Estado</th><th></th></tr></thead><tbody>${licenseRows(licenses)}</tbody></table></div></section></div></section>
    </section>`;
  },

  mount(_state, { Store, Toast, Modal }) {
    const platform=Array.isArray(Store.get().profile?.permissions)&&Store.get().profile.permissions.includes('platform.manage');
    const getSub=(id)=>(Store.get().commercial?.subscriptions||[]).find(item=>item.id===id);
    const closeModal=()=>Modal.close();
    const bindCancel=()=>document.querySelector('[data-commercial-cancel]')?.addEventListener('click',closeModal);
    const loadLicenses = async ({ silent = false } = {}) => {
      try {const licenses = await LicenseService.list();Store.update((draft) => { draft.licenses = Array.isArray(licenses) ? licenses : []; draft.licensesLoaded = true; });if (!silent) Toast.show('Licencias actualizadas.', 'success');}
      catch (error) {if (!silent) Toast.show(`No se pudieron cargar las licencias: ${error.message}`, 'error');}
    };
    const loadCommercial=async({silent=false}={})=>{
      if(!platform)return;
      try{
        const[summary,customers,subscriptions,agents,renewals,plans,payments,commissions,activity]=await Promise.all([CommercialService.summary(),CommercialService.customers(),CommercialService.subscriptions(),CommercialService.agents(),CommercialService.renewals(30),CommercialService.plans(),CommercialService.payments(250),CommercialService.commissions(),CommercialService.activity(80)]);
        Store.update(draft=>{draft.commercial={...(draft.commercial||{}),summary,customers,subscriptions,agents,renewals,plans,payments,commissions,activity,loaded:true,error:null};});if(!silent)Toast.show('Backoffice comercial actualizado.','success');
      }catch(error){Store.update(draft=>{draft.commercial={...(draft.commercial||{}),loaded:false,error:error.message};});if(!silent)Toast.show(`Comercial: ${error.message}`,'error');}
    };
    if (!Store.get().licensesLoaded) loadLicenses({ silent:true });
    if(platform&&!Store.get().commercial?.loaded&&!Store.get().commercial?.error)loadCommercial({silent:true});
    document.getElementById('btnLicenseRefresh')?.addEventListener('click', () => loadLicenses());
    document.getElementById('btnCommercialRefresh')?.addEventListener('click',()=>loadCommercial());

    document.getElementById('commercialFilterForm')?.addEventListener('submit',(event)=>{event.preventDefault();const f=event.currentTarget;Store.update(draft=>{draft.commercial={...(draft.commercial||{}),filters:{q:element(f,'q')?.value||'',planCode:element(f,'planCode')?.value||'',salesAgentId:element(f,'salesAgentId')?.value||'',vertical:element(f,'vertical')?.value||'',status:element(f,'status')?.value||''}};});});
    document.getElementById('btnCommercialFiltersClear')?.addEventListener('click',()=>Store.update(draft=>{draft.commercial={...(draft.commercial||{}),filters:{}};}));
    document.getElementById('btnCommercialCsv')?.addEventListener('click',()=>{const rows=filteredSubscriptions(Store.get());downloadCommercialCsv(rows,exportColumns,`contagest-suscripciones-${new Date().toISOString().slice(0,10)}.csv`);Toast.show(`CSV exportado con ${rows.length} registro(s).`,'success');});
    document.getElementById('btnCommercialPdf')?.addEventListener('click',()=>{const rows=filteredSubscriptions(Store.get());downloadCommercialPdf(rows,exportColumns,`contagest-suscripciones-${new Date().toISOString().slice(0,10)}.pdf`,'ContaGest · Consola comercial');Toast.show(`PDF exportado con ${rows.length} registro(s).`,'success');});

    document.querySelector('[name="businessSector"]')?.addEventListener('change', (event) => {Store.update((draft) => { draft.licenseDraft = { ...(draft.licenseDraft || {}), businessSector:event.target.value }; });});
    const subscriptionForm=document.getElementById('commercialSubscriptionForm');
    element(subscriptionForm,'planCode')?.addEventListener('change',()=>{const plan=element(subscriptionForm,'planCode')?.value;const template=Store.get().commercial?.plans?.plans?.[plan];if(!template)return;element(subscriptionForm,'maxTenants').value=String(template.maxTenants||1);element(subscriptionForm,'maxUsers').value=String(template.maxUsers||3);});

    document.getElementById('licenseForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();const form = event.currentTarget;const modules = [...form.querySelectorAll('input[name="modules"]:checked')].map((node) => node.value);if (!modules.length) return Toast.show('Selecciona al menos un módulo.', 'warning');const button = document.getElementById('btnGenerateLicense');button?.setAttribute('disabled', 'disabled');
      try {const result = await LicenseService.generate({fullName:element(form,'fullName').value,userEmail:element(form,'userEmail').value,businessSector:element(form,'businessSector').value,commercialUse:element(form,'commercialUse').value,plan:element(form,'plan').value,days:Number(element(form,'days').value),maxUsers:Number(element(form,'maxUsers').value),maxDevices:Number(element(form,'maxDevices').value),modules,...(element(form,'subscriptionId')?.value?{subscriptionId:element(form,'subscriptionId').value}:{})});Store.update((draft) => {draft.licenseCredentials=result.credentials;draft.licenses=[result,...(draft.licenses||[]).filter((item)=>item.id!==result.id)];});Toast.show('Licencia, usuario y contraseña temporal creados.','success');}
      catch (error) {Toast.show(`No se pudo generar la licencia: ${error.message}`, 'error');} finally {button?.removeAttribute('disabled');}
    });

    document.getElementById('commercialCustomerForm')?.addEventListener('submit',async(event)=>{event.preventDefault();const f=event.currentTarget;try{await CommercialService.createCustomer({legalName:element(f,'legalName').value,rif:element(f,'rif').value||undefined,contactName:element(f,'contactName').value||undefined,email:element(f,'email').value||undefined});Toast.show('Cliente comercial creado.','success');await loadCommercial({silent:true});}catch(error){Toast.show(error.message,'error');}});
    document.getElementById('commercialAgentForm')?.addEventListener('submit',async(event)=>{event.preventDefault();const f=event.currentTarget;try{await CommercialService.createAgent({name:element(f,'name').value,email:element(f,'email').value||undefined,phone:element(f,'phone').value||undefined,commissionRate:Number(element(f,'commissionRate').value)});Toast.show('Vendedor registrado.','success');await loadCommercial({silent:true});}catch(error){Toast.show(error.message,'error');}});
    subscriptionForm?.addEventListener('submit',async(event)=>{event.preventDefault();const f=event.currentTarget;const customerAccountId=element(f,'customerAccountId').value;if(!customerAccountId)return Toast.show('Selecciona un cliente.','warning');try{const planCode=element(f,'planCode').value;const template=Store.get().commercial?.plans?.plans?.[planCode]||{};await CommercialService.createSubscription({customerAccountId,planCode,salesAgentId:element(f,'salesAgentId').value||undefined,billingCycle:element(f,'billingCycle').value,amount:Number(element(f,'amount').value),maxTenants:Number(element(f,'maxTenants').value||template.maxTenants||1),maxUsers:Number(element(f,'maxUsers').value||template.maxUsers||3),customerSegment:template.segment||'smb',modules:template.modules||[],additionalTenantUnitPriceUsd:Number(template.additionalTenantUnitPriceUsd||0)});Toast.show('Suscripción creada. Ahora vincula los RIF autorizados.','success');await loadCommercial({silent:true});}catch(error){Toast.show(error.message,'error');}});

    document.querySelectorAll('[data-sub-edit]').forEach(button=>button.addEventListener('click',()=>{
      const sub=getSub(button.dataset.subEdit);if(!sub)return;const commercial=Store.get().commercial||{};const plans=commercial.plans?.plans||{};const agents=commercial.agents||[];
      Modal.open({title:`Editar contrato · ${sub.customerName||'Cliente'}`,ariaLabel:'Editar suscripción comercial',body:`<form id="commercialEditForm" class="grid gap-3"><p class="cg-ui-muted">Cambiar el plan no sustituye módulos automáticamente. Así se evita ampliar o retirar acceso sin una decisión explícita.</p><label>Plan<select name="planCode" class="input">${Object.entries(plans).map(([key,item])=>`<option value="${escapeHtml(key)}" ${key===sub.planCode?'selected':''}>${escapeHtml(item.label||key)}</option>`).join('')}</select></label><label>Vendedor<select name="salesAgentId" class="input"><option value="">Sin vendedor</option>${agents.filter(item=>item.status==='active').map(item=>`<option value="${escapeHtml(item.id)}" ${item.id===sub.salesAgentId?'selected':''}>${escapeHtml(item.name)}</option>`).join('')}</select></label><div class="grid grid-cols-2 gap-2"><label>Ciclo<select name="billingCycle" class="input">${['monthly','quarterly','semiannual','annual','manual'].map(value=>`<option value="${value}" ${value===sub.billingCycle?'selected':''}>${value}</option>`).join('')}</select></label><label>Moneda<input class="input" name="currency" value="${escapeHtml(sub.currency||'USD')}" maxlength="8" required></label></div><div class="grid grid-cols-3 gap-2"><label>Importe<input class="input" name="amount" type="number" min="0" step="0.01" value="${Number(sub.amount||0)}" required></label><label>Empresas máx.<input class="input" name="maxTenants" type="number" min="1" value="${Number(sub.maxTenants||1)}" required></label><label>Usuarios máx.<input class="input" name="maxUsers" type="number" min="1" value="${Number(sub.maxUsers||1)}" required></label></div><label>Soporte<input class="input" name="supportLevel" value="${escapeHtml(sub.supportLevel||'standard')}" maxlength="50"></label><div class="grid grid-cols-2 gap-2"><label>Próxima renovación<input class="input" name="nextRenewalAt" type="datetime-local" value="${escapeHtml(inputDate(sub.nextRenewalAt))}"></label><label>Gracia hasta<input class="input" name="graceUntil" type="datetime-local" value="${escapeHtml(inputDate(sub.graceUntil))}"></label></div></form>`,actions:modalActions('Guardar contrato')});bindCancel();document.querySelector('[data-commercial-save]')?.addEventListener('click',async()=>{const f=document.getElementById('commercialEditForm');if(!f?.reportValidity())return;try{await CommercialService.updateSubscription(sub.id,{planCode:element(f,'planCode').value,salesAgentId:element(f,'salesAgentId').value||null,billingCycle:element(f,'billingCycle').value,currency:element(f,'currency').value,amount:Number(element(f,'amount').value),maxTenants:Number(element(f,'maxTenants').value),maxUsers:Number(element(f,'maxUsers').value),supportLevel:element(f,'supportLevel').value||'standard',nextRenewalAt:element(f,'nextRenewalAt').value?new Date(element(f,'nextRenewalAt').value).toISOString():null,graceUntil:element(f,'graceUntil').value?new Date(element(f,'graceUntil').value).toISOString():null});closeModal();Toast.show('Contrato actualizado y auditado.','success');await loadCommercial({silent:true});}catch(error){Toast.show(error.message,'error');}});
    }));

    document.querySelectorAll('[data-sub-modules]').forEach(button=>button.addEventListener('click',()=>{
      const sub=getSub(button.dataset.subModules);if(!sub)return;const plans=Store.get().commercial?.plans||{};const kindByModule=new Map();Object.values(plans.plans||{}).forEach(plan=>(plan.modules||[]).forEach(module=>kindByModule.set(module,'core')));Object.values(plans.optionalPackages||{}).forEach(pkg=>(pkg.modules||[]).forEach(module=>kindByModule.set(module,pkg.kind||'addon')));(sub.modules||[]).forEach(item=>kindByModule.set(item.moduleCode,item.kind||'core'));const active=new Set((sub.modules||[]).filter(item=>item.status==='active').map(item=>item.moduleCode));
      Modal.open({title:`Módulos · ${sub.customerName||'Cliente'}`,ariaLabel:'Editar módulos contratados',body:`<form id="commercialModulesForm" class="grid gap-3"><p class="cg-ui-muted">Solo los módulos seleccionados quedarán activos para esta suscripción. La licencia técnica seguirá validando los entitlements en backend.</p><div class="cg-feature-grid">${[...kindByModule.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([module,kind])=>`<label class="cg-feature-pill"><input type="checkbox" name="module" value="${escapeHtml(module)}" data-kind="${escapeHtml(kind)}" ${active.has(module)?'checked':''}><span>${escapeHtml(module)} <small>· ${escapeHtml(kind)}</small></span></label>`).join('')}</div></form>`,actions:modalActions('Guardar módulos')});bindCancel();document.querySelector('[data-commercial-save]')?.addEventListener('click',async()=>{const selected=[...document.querySelectorAll('#commercialModulesForm input[name="module"]:checked')];if(!selected.length)return Toast.show('Selecciona al menos un módulo.','warning');try{await CommercialService.setModules(sub.id,selected.map(input=>({moduleCode:input.value,kind:input.dataset.kind||'core',quantity:1})));closeModal();Toast.show('Módulos contratados actualizados.','success');await loadCommercial({silent:true});}catch(error){Toast.show(error.message,'error');}});
    }));

    document.querySelectorAll('[data-sub-tenant]').forEach(button=>button.addEventListener('click',()=>{
      const sub=getSub(button.dataset.subTenant);if(!sub)return;const active=(sub.tenants||[]).filter(item=>item.status==='active');
      Modal.open({title:`Empresas cubiertas · ${sub.customerName||'Cliente'}`,ariaLabel:'Administrar empresas cubiertas',body:`<div class="grid gap-3"><div class="panel-soft p-3"><strong>${active.length} / ${Number(sub.maxTenants||1)} empresas activas</strong>${active.length?`<div class="grid gap-2">${active.map(item=>`<div class="cg-row-actions"><span><strong>${escapeHtml(item.name||'Empresa')}</strong> · ${escapeHtml(item.rif||'')}</span><button type="button" class="btn btn-danger" data-tenant-remove="${escapeHtml(item.tenantId)}" aria-label="Retirar ${escapeHtml(item.rif||'empresa')}"><i class="fa-solid fa-link-slash"></i></button></div>`).join('')}</div>`:'<p>Sin RIF vinculados.</p>'}</div><form id="commercialTenantForm" class="grid gap-3"><label>RIF<input class="input" name="tenantRif" required maxlength="40"></label><label>Nombre si se creará una empresa nueva<input class="input" name="tenantName" maxlength="160"></label><label class="cg-feature-pill"><input type="checkbox" name="createIfMissing"><span>Crear tenant solo si el RIF aún no existe</span></label><label>Precio especial por empresa (opcional)<input class="input" name="priceOverride" type="number" min="0" step="0.01"></label></form></div>`,actions:modalActions('Vincular empresa')});bindCancel();document.querySelectorAll('[data-tenant-remove]').forEach(remove=>remove.addEventListener('click',async()=>{if(!window.confirm('¿Retirar esta empresa de la suscripción? No se borrarán sus datos.'))return;try{await CommercialService.removeTenant(sub.id,remove.dataset.tenantRemove);closeModal();Toast.show('Empresa retirada de la cobertura; sus datos no fueron eliminados.','success');await loadCommercial({silent:true});}catch(error){Toast.show(error.message,'error');}}));document.querySelector('[data-commercial-save]')?.addEventListener('click',async()=>{const f=document.getElementById('commercialTenantForm');if(!f?.reportValidity())return;try{await CommercialService.attachTenant(sub.id,{tenantRif:element(f,'tenantRif').value,tenantName:element(f,'tenantName').value||undefined,createIfMissing:Boolean(element(f,'createIfMissing').checked),priceOverride:element(f,'priceOverride').value?Number(element(f,'priceOverride').value):undefined});closeModal();Toast.show('Empresa vinculada a la suscripción.','success');await loadCommercial({silent:true});}catch(error){Toast.show(error.message,'error');}});
    }));

    document.querySelectorAll('[data-sub-pay]').forEach(button=>button.addEventListener('click',()=>{
      const sub=getSub(button.dataset.subPay);if(!sub)return;Modal.open({title:`Registrar pago · ${sub.customerName||'Cliente'}`,ariaLabel:'Registrar pago comercial',body:`<form id="commercialPaymentForm" class="grid gap-3"><p class="cg-ui-muted">Un pago confirmado activa la suscripción, actualiza la próxima renovación y devenga la comisión del vendedor cuando corresponda.</p><div class="grid grid-cols-2 gap-2"><label>Monto<input class="input" name="amount" type="number" min="0.01" step="0.01" value="${Number(sub.amount||0)}" required></label><label>Moneda<input class="input" name="currency" value="${escapeHtml(sub.currency||'USD')}" maxlength="8" required></label></div><label>Método<input class="input" name="method" maxlength="80" placeholder="Transferencia, Zelle, efectivo…"></label><label>Referencia<input class="input" name="reference" maxlength="160" placeholder="Referencia de conciliación"></label></form>`,actions:modalActions('Confirmar pago')});bindCancel();document.querySelector('[data-commercial-save]')?.addEventListener('click',async()=>{const f=document.getElementById('commercialPaymentForm');if(!f?.reportValidity())return;try{await CommercialService.registerPayment({subscriptionId:sub.id,amount:Number(element(f,'amount').value),currency:element(f,'currency').value,method:element(f,'method').value||undefined,reference:element(f,'reference').value||undefined,status:'paid'});closeModal();Toast.show('Pago confirmado; renovación y comisión actualizadas.','success');await loadCommercial({silent:true});}catch(error){Toast.show(error.message,'error');}});
    }));

    document.querySelectorAll('[data-sub-toggle]').forEach(button=>button.addEventListener('click',()=>{
      const sub=getSub(button.dataset.subToggle);if(!sub)return;const next=sub.status==='suspended'?'active':'suspended';Modal.open({title:next==='active'?'Reactivar suscripción':'Suspender suscripción',ariaLabel:'Cambiar estado de suscripción',body:`<form id="commercialStatusForm" class="grid gap-3"><p class="cg-ui-muted">${next==='active'?'La reactivación vuelve a habilitar el contrato sin borrar historial.':'La suspensión conserva datos, pagos, licencias y auditoría; el acceso comercial queda controlado por el backend.'}</p><label>Motivo<textarea class="input" name="reason" minlength="3" maxlength="500" required placeholder="Motivo verificable del cambio"></textarea></label></form>`,actions:modalActions(next==='active'?'Reactivar':'Suspender')});bindCancel();document.querySelector('[data-commercial-save]')?.addEventListener('click',async()=>{const f=document.getElementById('commercialStatusForm');if(!f?.reportValidity())return;try{await CommercialService.transitionSubscription(sub.id,next,element(f,'reason').value);closeModal();Toast.show(`Suscripción ${next==='active'?'reactivada':'suspendida'} sin borrar datos.`,'success');await loadCommercial({silent:true});}catch(error){Toast.show(error.message,'error');}});
    }));

    document.querySelectorAll('[data-commission-paid]').forEach(button=>button.addEventListener('click',()=>{
      const commission=(Store.get().commercial?.commissions||[]).find(item=>item.id===button.dataset.commissionPaid);if(!commission)return;Modal.open({title:'Marcar comisión como pagada',ariaLabel:'Confirmar pago de comisión',body:`<form id="commercialCommissionForm" class="grid gap-3"><p>Vendedor: <strong>${escapeHtml(commission.salesAgentName||'')}</strong> · ${money(commission.amount,commission.currency)}</p><label>Motivo / referencia<textarea class="input" name="reason" minlength="3" maxlength="500" required placeholder="Transferencia, lote o referencia"></textarea></label></form>`,actions:modalActions('Marcar pagada')});bindCancel();document.querySelector('[data-commercial-save]')?.addEventListener('click',async()=>{const f=document.getElementById('commercialCommissionForm');if(!f?.reportValidity())return;try{await CommercialService.updateCommissionStatus(commission.id,'paid',element(f,'reason').value);closeModal();Toast.show('Comisión marcada como pagada y auditada.','success');await loadCommercial({silent:true});}catch(error){Toast.show(error.message,'error');}});
    }));

    document.querySelectorAll('[data-license-devices]').forEach(button=>button.addEventListener('click',async()=>{
      const license=(Store.get().licenses||[]).find(item=>item.id===button.dataset.licenseDevices);if(!license)return;Modal.open({title:'Activaciones de la licencia',body:'<p role="status"><i class="fa-solid fa-spinner fa-spin"></i> Cargando dispositivos…</p>'});try{const devices=await LicenseService.devices(license.id);Modal.open({title:`Activaciones · ${license.userEmail}`,ariaLabel:'Activaciones de licencia',body:devices.length?`<div class="grid gap-3">${devices.map(device=>`<article class="panel-soft p-3"><div class="cg-row-actions"><div><strong>${escapeHtml(device.deviceLabel||'Dispositivo')}</strong><p>${statusBadge(device.status)} · Primera: ${dateTime(device.firstSeenAt)} · Último uso: ${dateTime(device.lastSeenAt)}${device.lastIp?` · IP: ${escapeHtml(device.lastIp)}`:''}</p><small>Credencial: ${escapeHtml(device.credentialPreview||'legacy')} · Vence: ${dateTime(device.credentialExpiresAt)}</small></div>${device.status==='active'?`<button type="button" class="btn btn-danger" data-device-revoke="${escapeHtml(device.id)}"><i class="fa-solid fa-ban"></i> Revocar</button>`:''}</div></article>`).join('')}</div>`:'<p>Esta licencia aún no tiene dispositivos registrados.</p>'});document.querySelectorAll('[data-device-revoke]').forEach(revoke=>revoke.addEventListener('click',async()=>{if(!window.confirm('¿Revocar este dispositivo? Tendrá que activarse nuevamente con autorización.'))return;try{await LicenseService.revokeDevice(license.id,revoke.dataset.deviceRevoke);Toast.show('Dispositivo revocado.','success');closeModal();await loadLicenses({silent:true});}catch(error){Toast.show(error.message,'error');}}));}catch(error){Modal.open({title:'Activaciones',body:`<p role="alert">${escapeHtml(error.message)}</p>`});}
    }));

    document.getElementById('btnCopyCredentials')?.addEventListener('click', async () => {const card=document.querySelector('[data-license-credentials]');try{await navigator.clipboard.writeText(card?.dataset.licenseCredentials||'');Toast.show('Credenciales copiadas.','success');}catch{Toast.show('No se pudieron copiar automáticamente. Selecciona los datos manualmente.','warning');}});
    document.getElementById('btnDismissCredentials')?.addEventListener('click',()=>Store.update(d=>{d.licenseCredentials=null;}));
    document.querySelectorAll('[data-license-revoke]').forEach((button) => button.addEventListener('click', async () => {if(!window.confirm('¿Revocar esta licencia? El cliente perderá acceso en todos sus dispositivos.'))return;try{const updated=await LicenseService.revoke(button.dataset.licenseRevoke);Store.update(d=>{d.licenses=(d.licenses||[]).map(item=>item.id===updated.id?updated:item);});Toast.show('Licencia revocada y dispositivos bloqueados.','success');}catch(error){Toast.show(`No se pudo revocar: ${error.message}`,'error');}}));
  }
};
