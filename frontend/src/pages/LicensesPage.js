import { PageHeader, Button, Badge, Field, Select } from '../components/ui/index.js';
import { LicenseService } from '../services/licenseService.js';
import { CommercialService } from '../services/commercialService.js';
import { DemoAccessService } from '../services/demoAccessService.js';
import { escapeHtml } from '../utils/dom.js';

const sectorOptions = [
  { value:'comercio', label:'Comercio / ventas' },
  { value:'servicios', label:'Servicios profesionales' },
  { value:'contador', label:'Contabilidad / firma' },
  { value:'restaurante', label:'Restaurante / alimentos' },
  { value:'salud', label:'Salud / práctica médica' },
  { value:'veterinaria', label:'Veterinaria' },
  { value:'gimnasio', label:'Gimnasio / fitness' },
  { value:'manufactura', label:'Manufactura' },
  { value:'distribucion', label:'Distribución' },
  { value:'profesional', label:'Profesional independiente' },
  { value:'otro', label:'Otro rubro' }
];

const sectorDefaults = {
  salud:['dashboard','salud','clientes','reportes','analytics','soporte'],
  veterinaria:['dashboard','veterinaria','clientes','inventario','reportes','analytics','soporte'],
  gimnasio:['dashboard','gimnasio','rutinas','nutricion','clientes','reportes','analytics','soporte'],
  contador:['dashboard','contabilidad','plan-cuentas','libro-mayor','balance-sumas-saldos','hoja-trabajo','estados-financieros','cierre-contable','bancos','tributos','libro-ventas','reportes','analytics','soporte'],
  restaurante:['dashboard','ventas','pedidos','pos-sede','tracking-pedidos','inventario','reportes','soporte'],
  comercio:['dashboard','ventas','cotizacion','clientes','inventario','kardex','compras','reportes','analytics','soporte'],
  servicios:['dashboard','cotizacion','clientes','ventas','reportes','analytics','soporte']
};

const statusTone=(status)=>status==='active'?'success':status==='trial'?'brand':status==='past_due'?'warning':status==='suspended'||status==='cancelled'||status==='expired'?'danger':'neutral';
const money=(value,currency='USD')=>`${currency} ${Number(value||0).toLocaleString('es-VE',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const date=(value)=>value?new Date(value).toLocaleDateString('es-VE'):'—';

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
    <div class="cg-license-once-copy">
      <p class="cgx-eyebrow">Credenciales mostradas una sola vez</p>
      <h3>${escapeHtml(credentials.companyName || 'Empresa')} · ${escapeHtml(credentials.businessSector || '')}</h3>
      <div class="cg-license-secret-grid">
        <span><small>RIF</small><strong>${escapeHtml(credentials.tenantRif)}</strong></span>
        <span><small>Correo</small><strong>${escapeHtml(credentials.email)}</strong></span>
        <span><small>Contraseña temporal</small><code>${escapeHtml(credentials.temporaryPassword)}</code></span>
        <span><small>Licencia</small><code>${escapeHtml(credentials.licenseKey)}</code></span>
      </div>
      <p class="cg-license-warning"><i class="fa-solid fa-triangle-exclamation"></i> Guarda esta información ahora. La contraseña y la licencia completas no se recuperan después. El primer equipo recibirá una credencial HttpOnly emitida por el servidor.</p>
    </div>
    <div class="cg-license-once-actions">
      ${Button({ id:'btnCopyCredentials', text:'Copiar credenciales', icon:'fa-copy', variant:'primary' })}
      ${Button({ id:'btnDismissCredentials', text:'Ocultar', icon:'fa-eye-slash', variant:'secondary' })}
    </div>
  </article>`;
}

function licenseRows(licenses) {
  if (!licenses.length) return '<tr><td colspan="10" class="text-center">No hay licencias técnicas emitidas para esta empresa.</td></tr>';
  return licenses.map((license) => `<tr>
    <td><strong>${escapeHtml(license.userEmail)}</strong><br><small>${escapeHtml(license.companyRif || license.company?.rif || '')}</small></td>
    <td>${escapeHtml(license.businessSector || 'general')}</td>
    <td>${escapeHtml(license.plan)}</td>
    <td>${license.subscriptionId?`<code>${escapeHtml(String(license.subscriptionId).slice(0,8))}…</code>`:'Prueba/legacy'}</td>
    <td><code>${escapeHtml(license.keyPreview || 'Oculta')}</code></td>
    <td>${date(license.expiresAt)}</td>
    <td>${(license.modules || []).slice(0,4).map(escapeHtml).join(', ')}${(license.modules || []).length > 4 ? '…' : ''}</td>
    <td>${Number(license.devicesUsed || 0)} / ${Number(license.maxDevices || 1)}</td>
    <td>${Badge(license.status, statusTone(license.status))}</td>
    <td>${license.status === 'active' ? `<button type="button" class="cgx-icon-action" data-license-revoke="${escapeHtml(license.id)}" aria-label="Revocar licencia" title="Revocar licencia"><i class="fa-solid fa-ban"></i></button>` : '—'}</td>
  </tr>`).join('');
}

function commercialPanel(state){
  const c=state.commercial||{};const summary=c.summary||{};const customers=c.customers||[];const subscriptions=c.subscriptions||[];const agents=c.agents||[];const renewals=c.renewals||[];const planMap=c.plans?.plans||{};
  const customerOptions=[{value:'',label:'Selecciona cliente'},...customers.map(x=>({value:x.id,label:`${x.legalName}${x.rif?` · ${x.rif}`:''}`}))];
  const agentOptions=[{value:'',label:'Sin vendedor'},...agents.filter(x=>x.status==='active').map(x=>({value:x.id,label:`${x.name} · ${Number(x.commissionRate||0)}%`}))];
  const planOptions=Object.entries(planMap).map(([value,item])=>({value,label:item.label||value}));
  const subscriptionOptions=[{value:'',label:'Sin suscripción / solo prueba'},...subscriptions.map(s=>({value:s.id,label:`${s.customerName} · ${s.planCode} · ${s.status}`}))];
  state._commercialSubscriptionOptions=subscriptionOptions;
  const rows=subscriptions.length?subscriptions.map(s=>`<tr>
    <td><strong>${escapeHtml(s.customerName||'Cliente')}</strong><br><small>${escapeHtml(s.customerRif||'')}</small></td>
    <td>${escapeHtml(s.planCode||'')}</td><td>${Badge(s.status,statusTone(s.status))}</td><td>${money(s.amount,s.currency)}<br><small>${escapeHtml(s.billingCycle||'')}</small></td>
    <td>${Array.isArray(s.tenants)?s.tenants.filter(t=>t.status==='active').length:0} / ${Number(s.maxTenants||1)}</td><td>${Array.isArray(s.modules)?s.modules.filter(m=>m.status==='active').length:0}</td>
    <td>${date(s.nextRenewalAt)}</td><td>${escapeHtml(s.salesAgentName||'—')}</td>
    <td><div class="cg-row-actions"><button class="btn btn-secondary" type="button" data-sub-tenant="${escapeHtml(s.id)}" title="Añadir empresa"><i class="fa-solid fa-building-circle-check"></i></button><button class="btn btn-secondary" type="button" data-sub-pay="${escapeHtml(s.id)}" title="Registrar pago"><i class="fa-solid fa-money-check-dollar"></i></button><button class="btn ${s.status==='suspended'?'btn-primary':'btn-danger'}" type="button" data-sub-toggle="${escapeHtml(s.id)}" data-sub-status="${escapeHtml(s.status)}" title="${s.status==='suspended'?'Reactivar':'Suspender'}"><i class="fa-solid ${s.status==='suspended'?'fa-play':'fa-pause'}"></i></button></div></td>
  </tr>`).join(''):'<tr><td colspan="9" class="text-center">Todavía no hay suscripciones comerciales.</td></tr>';
  const renewalRows=renewals.length?renewals.map(r=>`<tr><td>${escapeHtml(r.customerName||'')}</td><td>${escapeHtml(r.planCode||'')}</td><td>${date(r.nextRenewalAt)}</td><td>${money(r.amount,r.currency)}</td><td>${escapeHtml(r.salesAgentName||'—')}</td><td>${Badge(r.status,statusTone(r.status))}</td></tr>`).join(''):'<tr><td colspan="6" class="text-center">Sin renovaciones en los próximos 30 días.</td></tr>';
  return `<section class="cgx-section" aria-labelledby="commercialTitle">
    <header class="cgx-section-head"><div><p class="cgx-eyebrow">Backoffice SaaS · plataforma</p><h2 id="commercialTitle">Administración comercial</h2><p>Clientes, contratos, MRR, empresas cubiertas, módulos, pagos y vendedores. Esta capa no almacena ni reemplaza las claves técnicas de acceso.</p></div>${Button({id:'btnCommercialRefresh',text:'Actualizar comercial',icon:'fa-rotate',variant:'secondary'})}</header>
    <div class="cgx-section-body grid gap-4">
      <div class="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2">
        <article class="cgx-metric"><p>MRR</p><strong>${money(summary.mrr||0,'USD')}</strong></article><article class="cgx-metric"><p>Clientes</p><strong>${Number(summary.customers||0)}</strong></article><article class="cgx-metric"><p>Activas</p><strong>${Number(summary.activeSubscriptions||0)}</strong></article><article class="cgx-metric"><p>Trials</p><strong>${Number(summary.trials||0)}</strong></article><article class="cgx-metric"><p>Morosas</p><strong>${Number(summary.pastDue||0)}</strong></article><article class="cgx-metric"><p>Empresas</p><strong>${Number(summary.coveredCompanies||0)}</strong></article><article class="cgx-metric"><p>Renov. 7d</p><strong>${Number(summary.renew7||0)}</strong></article><article class="cgx-metric"><p>Renov. 30d</p><strong>${Number(summary.renew30||0)}</strong></article>
      </div>
      <div class="grid xl:grid-cols-3 gap-3">
        <form id="commercialCustomerForm" class="panel-soft p-4 rounded-xl grid gap-3"><div><h3>Nuevo cliente comercial</h3><p>No crea licencias automáticamente.</p></div>${Field({labelKey:'Razón social',name:'legalName',required:true})}${Field({labelKey:'RIF',name:'rif',required:false})}${Field({labelKey:'Contacto',name:'contactName',required:false})}${Field({labelKey:'Correo',name:'email',type:'email',required:false})}${Button({text:'Guardar cliente',icon:'fa-user-plus',variant:'primary',type:'submit'})}</form>
        <form id="commercialSubscriptionForm" class="panel-soft p-4 rounded-xl grid gap-3"><div><h3>Nueva suscripción</h3><p>El plan Contador inicia con varias empresas y cobra la empresa adicional según contrato; la referencia operativa configurada es +USD 12.</p></div>${Select({labelKey:'Cliente',name:'customerAccountId',value:'',options:customerOptions})}${Select({labelKey:'Plan',name:'planCode',value:planOptions[0]?.value||'contador',options:planOptions.length?planOptions:[{value:'contador',label:'Contador Multiempresa'},{value:'vendedor',label:'Vendedor / Comercio'},{value:'pyme',label:'PyME Integral'}]})}${Select({labelKey:'Vendedor',name:'salesAgentId',value:'',options:agentOptions})}${Select({labelKey:'Ciclo',name:'billingCycle',value:'monthly',options:[{value:'monthly',label:'Mensual'},{value:'quarterly',label:'Trimestral'},{value:'semiannual',label:'Semestral'},{value:'annual',label:'Anual'}]})}${Field({labelKey:'Precio del ciclo (USD)',name:'amount',type:'number',value:'0',attrs:'min="0" step="0.01"'})}<div class="grid grid-cols-2 gap-2">${Field({labelKey:'Empresas máx.',name:'maxTenants',type:'number',value:'1',attrs:'min="1"'})}${Field({labelKey:'Usuarios máx.',name:'maxUsers',type:'number',value:'3',attrs:'min="1"'})}</div>${Button({text:'Crear suscripción',icon:'fa-file-signature',variant:'primary',type:'submit'})}</form>
        <form id="commercialAgentForm" class="panel-soft p-4 rounded-xl grid gap-3"><div><h3>Vendedor / partner</h3><p>La comisión se devenga cuando registras un pago confirmado.</p></div>${Field({labelKey:'Nombre',name:'name',required:true})}${Field({labelKey:'Correo',name:'email',type:'email',required:false})}${Field({labelKey:'Teléfono',name:'phone',required:false})}${Field({labelKey:'Comisión %',name:'commissionRate',type:'number',value:'10',attrs:'min="0" max="100" step="0.01"'})}${Button({text:'Guardar vendedor',icon:'fa-user-tie',variant:'primary',type:'submit'})}</form>
      </div>
      <section><header class="cg-license-form-head"><div><h3>Suscripciones</h3><p>Un RIF solo queda cubierto cuando aparece en Empresas de la suscripción. El servidor bloquea exceder el máximo contratado.</p></div></header><div class="pl-table-wrap"><table class="pl-table"><thead><tr><th>Cliente</th><th>Plan</th><th>Estado</th><th>Importe</th><th>Empresas</th><th>Módulos</th><th>Renueva</th><th>Vendedor</th><th>Acciones</th></tr></thead><tbody>${rows}</tbody></table></div></section>
      <section><header class="cg-license-form-head"><div><h3>Renovaciones próximas</h3><p>Ventana 30 días; el dashboard también separa 7 y 15 días.</p></div></header><div class="pl-table-wrap"><table class="pl-table"><thead><tr><th>Cliente</th><th>Plan</th><th>Fecha</th><th>Importe</th><th>Vendedor</th><th>Estado</th></tr></thead><tbody>${renewalRows}</tbody></table></div></section>
    </div>
  </section>`;
}

export const LicensesPage = {
  render(state) {
    const licenses = state.licenses || [];
    const isPlatform=Array.isArray(state.profile?.permissions)&&state.profile.permissions.includes('platform.manage');
    const modules = [...new Set([...DemoAccessService.modules, 'salud','veterinaria','gimnasio','rutinas','nutricion','mensajes','libro-mayor','balance-sumas-saldos','hoja-trabajo','estados-financieros','cierre-contable','tributos','libro-ventas'])];
    const selectedSector = state.licenseDraft?.businessSector || 'comercio';
    const defaults = sectorDefaults[selectedSector] || sectorDefaults.comercio;
    const moduleOptions = modules.map((module) => `<label class="cg-feature-pill"><input type="checkbox" name="modules" value="${escapeHtml(module)}" ${defaults.includes(module) ? 'checked' : ''}/><span>${escapeHtml(module)}</span></label>`).join('');
    const subscriptions=state.commercial?.subscriptions||[];
    const subscriptionOptions=[{value:'',label:'Sin suscripción / solo evaluación'},...subscriptions.map(s=>({value:s.id,label:`${s.customerName} · ${s.planCode} · ${s.status}`}))];

    return `<section class="cg-page-stack cg-license-page">
      ${PageHeader({
        eyebrowKey:'licensesEyebrow',
        titleKey:'Suscripciones y control de acceso',
        descKey:'La suscripción define qué se contrató; la licencia técnica define quién y qué dispositivo puede entrar.',
        actions: Button({id:'btnLicenseRefresh', text:'Actualizar licencias', icon:'fa-rotate', variant:'secondary'})
      })}
      ${isPlatform?commercialPanel(state):''}
      ${credentialsCard(state.licenseCredentials)}
      <section class="cgx-section"><header class="cgx-section-head"><div><p class="cgx-eyebrow">Seguridad de acceso</p><h2>Licencias técnicas</h2><p>Ligadas a empresa, usuario, módulos, vigencia y dispositivos. No representan pagos ni facturas.</p></div></header><div class="cgx-section-body grid gap-4">
      <form id="licenseForm" class="surface cg-license-form">
        <div class="cg-license-form-head"><div><h3>Nueva licencia</h3><p>Queda vinculada al tenant/RIF activo. Si seleccionas una suscripción, el backend impide habilitar módulos o empresas no contratados.</p></div><span class="cg-license-tenant"><i class="fa-solid fa-building-shield"></i>${escapeHtml(state.settings?.companyName || 'Empresa activa')} · ${escapeHtml(state.settings?.companyRif || '')}</span></div>
        <div class="cg-license-fields">
          ${Field({ labelKey:'Nombre del cliente', name:'fullName', value:'Cliente de prueba', required:true })}
          ${Field({ labelKey:'Correo de acceso', name:'userEmail', type:'email', value:'prospecto@empresa.com', required:true })}
          ${Select({ labelKey:'Rubro o perfil', name:'businessSector', value:selectedSector, options:sectorOptions })}
          ${Select({ labelKey:'Uso autorizado', name:'commercialUse', value:'evaluacion', options:[{value:'evaluacion',label:'Evaluación comercial'},{value:'demostracion',label:'Demostración guiada'},{value:'operacion',label:'Operación contratada'},{value:'capacitacion',label:'Capacitación'},{value:'soporte',label:'Soporte'}] })}
          ${Select({ labelKey:'Vigencia técnica', name:'plan', value:'trial', options:[{value:'trial',label:'Prueba'},{value:'monthly',label:'Mensual'},{value:'quarterly',label:'Trimestral'},{value:'annual',label:'Anual'},{value:'enterprise',label:'Enterprise'}] })}
          ${isPlatform?Select({labelKey:'Suscripción comercial',name:'subscriptionId',value:'',options:subscriptionOptions}):''}
          ${Field({ labelKey:'Días de uso', name:'days', type:'number', value:'15', required:true, attrs:'min="1" max="3650"' })}
          ${Field({ labelKey:'Usuarios máximos', name:'maxUsers', type:'number', value:'1', required:true, attrs:'min="1" max="100"' })}
          ${Field({ labelKey:'Dispositivos máximos', name:'maxDevices', type:'number', value:'1', required:true, attrs:'min="1" max="20"' })}
        </div>
        <div class="cg-license-modules"><p class="label">Módulos habilitados</p><div class="cg-feature-grid">${moduleOptions}</div></div>
        <div class="cg-license-submit">${Button({id:'btnGenerateLicense', text:'Generar licencia y credenciales', icon:'fa-key', variant:'primary', type:'submit'})}</div>
      </form>

      <section class="surface cg-license-list">
        <header><div><h3>Licencias de la empresa activa</h3><p>${licenses.length} registro(s). Las claves completas nunca se vuelven a mostrar.</p></div></header>
        <div class="pl-table-wrap"><table class="pl-table"><thead><tr><th>Usuario / empresa</th><th>Perfil</th><th>Vigencia</th><th>Suscripción</th><th>Key</th><th>Vence</th><th>Módulos</th><th>Dispositivos</th><th>Estado</th><th></th></tr></thead><tbody>${licenseRows(licenses)}</tbody></table></div>
      </section></div></section>
    </section>`;
  },

  mount(_state, { Store, Toast }) {
    const platform=Array.isArray(Store.get().profile?.permissions)&&Store.get().profile.permissions.includes('platform.manage');
    const loadLicenses = async ({ silent = false } = {}) => {
      try {
        const licenses = await LicenseService.list();
        Store.update((draft) => { draft.licenses = Array.isArray(licenses) ? licenses : []; draft.licensesLoaded = true; });
        if (!silent) Toast.show('Licencias actualizadas.', 'success');
      } catch (error) {
        if (!silent) Toast.show(`No se pudieron cargar las licencias: ${error.message}`, 'error');
      }
    };
    const loadCommercial=async({silent=false}={})=>{
      if(!platform)return;
      try{const[summary,customers,subscriptions,agents,renewals,plans]=await Promise.all([CommercialService.summary(),CommercialService.customers(),CommercialService.subscriptions(),CommercialService.agents(),CommercialService.renewals(30),CommercialService.plans()]);Store.update(d=>{d.commercial={...(d.commercial||{}),summary,customers,subscriptions,agents,renewals,plans,loaded:true};});if(!silent)Toast.show('Backoffice comercial actualizado.','success');}catch(error){if(!silent)Toast.show(`Comercial: ${error.message}`,'error');}
    };
    if (!Store.get().licensesLoaded) loadLicenses({ silent:true });
    if(platform&&!Store.get().commercial?.loaded)loadCommercial({silent:true});
    document.getElementById('btnLicenseRefresh')?.addEventListener('click', () => loadLicenses());
    document.getElementById('btnCommercialRefresh')?.addEventListener('click',()=>loadCommercial());

    document.querySelector('[name="businessSector"]')?.addEventListener('change', (event) => {
      Store.update((draft) => { draft.licenseDraft = { ...(draft.licenseDraft || {}), businessSector:event.target.value }; });
    });

    document.getElementById('licenseForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const modules = [...form.querySelectorAll('input[name="modules"]:checked')].map((node) => node.value);
      if (!modules.length) return Toast.show('Selecciona al menos un módulo.', 'warning');
      const button = document.getElementById('btnGenerateLicense');button?.setAttribute('disabled', 'disabled');
      try {
        const result = await LicenseService.generate({fullName:form.fullName.value,userEmail:form.userEmail.value,businessSector:form.businessSector.value,commercialUse:form.commercialUse.value,plan:form.plan.value,days:Number(form.days.value),maxUsers:Number(form.maxUsers.value),maxDevices:Number(form.maxDevices.value),modules,...(form.subscriptionId?.value?{subscriptionId:form.subscriptionId.value}:{})});
        Store.update((draft) => {draft.licenseCredentials=result.credentials;draft.licenses=[result,...(draft.licenses||[]).filter((item)=>item.id!==result.id)];});Toast.show('Licencia, usuario y contraseña temporal creados.','success');
      } catch (error) {Toast.show(`No se pudo generar la licencia: ${error.message}`, 'error');} finally {button?.removeAttribute('disabled');}
    });

    document.getElementById('commercialCustomerForm')?.addEventListener('submit',async(event)=>{event.preventDefault();const f=event.currentTarget;try{await CommercialService.createCustomer({legalName:f.legalName.value,rif:f.rif.value,contactName:f.contactName.value,email:f.email.value});Toast.show('Cliente comercial creado.','success');await loadCommercial({silent:true});}catch(error){Toast.show(error.message,'error');}});
    document.getElementById('commercialAgentForm')?.addEventListener('submit',async(event)=>{event.preventDefault();const f=event.currentTarget;try{await CommercialService.createAgent({name:f.name.value,email:f.email.value,phone:f.phone.value,commissionRate:Number(f.commissionRate.value)});Toast.show('Vendedor registrado.','success');await loadCommercial({silent:true});}catch(error){Toast.show(error.message,'error');}});
    document.getElementById('commercialSubscriptionForm')?.addEventListener('submit',async(event)=>{event.preventDefault();const f=event.currentTarget;if(!f.customerAccountId.value)return Toast.show('Selecciona un cliente.','warning');try{const template=Store.get().commercial?.plans?.plans?.[f.planCode.value]||{};await CommercialService.createSubscription({customerAccountId:f.customerAccountId.value,planCode:f.planCode.value,salesAgentId:f.salesAgentId.value||undefined,billingCycle:f.billingCycle.value,amount:Number(f.amount.value),maxTenants:Number(f.maxTenants.value||template.maxTenants||1),maxUsers:Number(f.maxUsers.value||template.maxUsers||3),customerSegment:template.segment||'smb',modules:template.modules||[],additionalTenantUnitPriceUsd:12});Toast.show('Suscripción creada. Ahora vincula los RIF autorizados.','success');await loadCommercial({silent:true});}catch(error){Toast.show(error.message,'error');}});
    document.querySelectorAll('[data-sub-tenant]').forEach(button=>button.addEventListener('click',async()=>{const rif=window.prompt('RIF de la empresa a vincular:','');if(!rif)return;const name=window.prompt('Nombre de la empresa (solo se usa si el RIF aún no existe):','')||'';try{await CommercialService.attachTenant(button.dataset.subTenant,{tenantRif:rif,tenantName:name||undefined,createIfMissing:Boolean(name)});Toast.show('Empresa vinculada a la suscripción.','success');await loadCommercial({silent:true});}catch(error){Toast.show(error.message,'error');}}));
    document.querySelectorAll('[data-sub-toggle]').forEach(button=>button.addEventListener('click',async()=>{const next=button.dataset.subStatus==='suspended'?'active':'suspended';if(next==='suspended'&&!window.confirm('¿Suspender esta suscripción comercial? Las licencias vinculadas seguirán auditables, pero no debes renovarlas hasta reactivarla.'))return;try{await CommercialService.updateSubscription(button.dataset.subToggle,{status:next});Toast.show(`Suscripción ${next==='active'?'reactivada':'suspendida'}.`,'success');await loadCommercial({silent:true});}catch(error){Toast.show(error.message,'error');}}));
    document.querySelectorAll('[data-sub-pay]').forEach(button=>button.addEventListener('click',async()=>{const sub=(Store.get().commercial?.subscriptions||[]).find(x=>x.id===button.dataset.subPay);if(!sub)return;const amount=window.prompt('Monto recibido:',String(Number(sub.amount||0)));if(amount===null)return;const reference=window.prompt('Referencia del pago:','')||'';try{await CommercialService.registerPayment({subscriptionId:sub.id,amount:Number(amount),currency:sub.currency||'USD',reference,status:'paid'});Toast.show('Pago registrado; renovación y comisión actualizadas.','success');await loadCommercial({silent:true});}catch(error){Toast.show(error.message,'error');}}));

    document.getElementById('btnCopyCredentials')?.addEventListener('click', async () => {const card=document.querySelector('[data-license-credentials]');try{await navigator.clipboard.writeText(card?.dataset.licenseCredentials||'');Toast.show('Credenciales copiadas.','success');}catch{Toast.show('No se pudieron copiar automáticamente. Selecciona los datos manualmente.','warning');}});
    document.getElementById('btnDismissCredentials')?.addEventListener('click',()=>Store.update(d=>{d.licenseCredentials=null;}));
    document.querySelectorAll('[data-license-revoke]').forEach((button) => button.addEventListener('click', async () => {if(!window.confirm('¿Revocar esta licencia? El cliente perderá acceso en todos sus dispositivos.'))return;try{const updated=await LicenseService.revoke(button.dataset.licenseRevoke);Store.update(d=>{d.licenses=(d.licenses||[]).map(item=>item.id===updated.id?updated:item);});Toast.show('Licencia revocada y dispositivos bloqueados.','success');}catch(error){Toast.show(`No se pudo revocar: ${error.message}`,'error');}}));
  }
};
