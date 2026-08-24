import { PageHeader, Button, Badge, Field, Select, Textarea, MetricGrid, Section, EmptyState } from '../components/ui/index.js';
import { DemoAccessService } from '../services/demoAccessService.js';
import { RbacService } from '../services/rbacService.js';
import { AccessControlService } from '../services/accessControlService.js';
import { escapeHtml } from '../utils/dom.js';

const fmt = (date) => date ? new Date(date).toLocaleString('es-VE', { dateStyle:'short', timeStyle:'short' }) : 'Sin vencimiento';
const todayPlus = (days) => new Date(Date.now() + Number(days || 14) * 86400000).toISOString().slice(0, 10);
const safe = (value) => escapeHtml(String(value ?? ''));

function demoModuleChecks(selected = DemoAccessService.defaultDemo().enabledModules) {
  const set = new Set(selected || []);
  return `<div class="cg-demo-module-grid">${DemoAccessService.modules.map((module) => `<label class="cg-permission-pill ${set.has(module) ? 'is-on' : ''}"><input type="checkbox" name="enabledModules" value="${safe(module)}" ${set.has(module) ? 'checked' : ''}/><span>${safe(module)}</span></label>`).join('')}</div>`;
}

function demoSummary(rbac, demos) {
  const demoUsers = rbac.users.filter((user) => user.demo);
  const expiredUsers = demoUsers.filter((user) => AccessControlService.remaining(user).expired).length;
  const expiringUsers = demoUsers.filter((user) => {
    const remaining = AccessControlService.remaining(user);
    return !remaining.expired && Number(remaining.days ?? 99) <= Number(rbac.demoPolicy?.warningDays || 3);
  }).length;
  return MetricGrid([
    { label:'Usuarios demo', value:String(demoUsers.length), hint:`${expiredUsers} expirado(s) · ${expiringUsers} por vencer`, iconName:'fa-user-clock', tone:expiredUsers ? 'warning' : 'brand' },
    { label:'Prospectos', value:String(demos.length), hint:'Accesos comerciales registrados', iconName:'fa-building-user', tone:'neutral' },
    { label:'Máx. módulos default', value:String(rbac.demoPolicy?.maxModules || 7), hint:`${rbac.demoPolicy?.defaultDays || 14} días por defecto`, iconName:'fa-table-cells-large', tone:'neutral' },
    { label:'Módulos disponibles', value:String(DemoAccessService.modules.length), hint:'Catálogo para preventa', iconName:'fa-cubes', tone:'success' }
  ]);
}

function demoUsersTable(rbac) {
  const demoUsers = rbac.users.filter((user) => user.demo);
  if (!demoUsers.length) return EmptyState({ title:'Sin usuarios demo', description:'Crea un acceso temporal desde el Panel admin para administrar su vigencia aquí.', iconName:'fa-user-clock' });
  return `<div class="cgx-table-wrap"><table class="cgx-table"><thead><tr><th>Usuario</th><th>Rol</th><th>Vence</th><th>Restante</th><th>Máx. módulos</th><th>Actualizar</th></tr></thead><tbody>${demoUsers.map((user) => {
    const role = rbac.roles.find((item) => item.id === user.roleId);
    const remaining = AccessControlService.remaining(user);
    return `<tr>
      <td><input class="input cg-admin-inline-input" name="fullName" value="${safe(user.fullName)}" form="demoEdit-${safe(user.id)}" /><small>${safe(user.email)}</small></td>
      <td>${Badge(role?.name || 'Demo', 'warning')}</td>
      <td>${fmt(user.demoExpiresAt)}</td>
      <td>${Badge(remaining.label, remaining.expired ? 'danger' : remaining.days <= 3 ? 'warning' : 'success')}</td>
      <td><input class="input cg-admin-inline-input" name="maxModules" type="number" min="1" max="${Number(role?.modules?.length || 30)}" value="${Number(user.maxModules || rbac.demoPolicy.maxModules || 7)}" form="demoEdit-${safe(user.id)}" /></td>
      <td><form id="demoEdit-${safe(user.id)}" class="cg-inline-demo-days" data-demo-time-form="${safe(user.id)}"><input class="input cg-admin-inline-input" name="days" type="number" value="14" min="1" max="365" aria-label="Días de vigencia" /><button class="cgx-btn cgx-btn-secondary" type="submit" title="Guardar vigencia" aria-label="Guardar cambios del usuario demo"><i class="fa-solid fa-floppy-disk" aria-hidden="true"></i></button></form></td>
    </tr>`;
  }).join('')}</tbody></table></div>`;
}

function prospectsTable(demos) {
  if (!demos.length) return EmptyState({ title:'Sin demos comerciales', description:'Crea el primer acceso comercial para iniciar el seguimiento de preventa.', iconName:'fa-key' });
  return `<div class="cgx-table-wrap"><table class="cgx-table"><thead><tr><th>Prospecto</th><th>Contacto</th><th>Módulos</th><th>Expira</th><th>Usuarios</th><th>Estado</th></tr></thead><tbody>${demos.map((demo) => `<tr><td><strong>${safe(demo.prospect)}</strong><br><small>${safe(demo.notes || '')}</small></td><td>${safe(demo.email)}<br>${safe(demo.phone)}</td><td>${(demo.enabledModules || []).slice(0,4).map(safe).join(', ')}${(demo.enabledModules || []).length > 4 ? '…' : ''}</td><td>${safe(demo.expiresAt)}</td><td>${safe(demo.maxUsers)}</td><td>${Badge(demo.status || 'active', demo.status === 'expired' ? 'danger' : demo.status === 'paused' ? 'warning' : 'success')}</td></tr>`).join('')}</tbody></table></div>`;
}

export const DemoControlPage = {
  render(state) {
    const demos = state.demoAccess || [];
    const rbac = AccessControlService.ensure(state.rbac);
    const builder = `<form id="customDemoAccessForm" class="cg-record-form cg-demo-access-form">
      <div class="cg-record-fields">
        ${Field({ labelKey:'Prospecto / empresa', name:'prospect', value:'Cliente potencial', required:true })}
        ${Field({ labelKey:'Email', name:'email', type:'email', value:'prospecto@empresa.com', required:true })}
        ${Field({ labelKey:'Teléfono', name:'phone', value:'+584120000000' })}
        ${Field({ labelKey:'Expira', name:'expiresAt', type:'date', value:todayPlus(rbac.demoPolicy?.defaultDays || 14), attrs:'min="2024-01-01"', required:true })}
        ${Field({ labelKey:'Máx. usuarios', name:'maxUsers', type:'number', value:String(rbac.demoPolicy?.maxUsers || 3), attrs:'min="1" max="50"', required:true })}
        ${Select({ labelKey:'Estado', name:'status', value:'active', options:[{value:'active', label:'Activo'}, {value:'paused', label:'Pausado'}, {value:'expired', label:'Expirado'}] })}
        <div class="cg-demo-modules-field cg-field-wide"><label class="label">Módulos para la demo</label>${demoModuleChecks()}</div>
        ${Textarea({ labelKey:'Notas comerciales / alcance', name:'notes', value:'Demo comercial controlado con módulos limitados y vencimiento automático.', className:'cg-field-wide' })}
      </div>
      <div class="cg-record-actions">${Button({ text:'Guardar demo comercial', icon:'fa-floppy-disk', type:'submit' })}</div>
    </form>`;

    return `<section class="cg-page-stack cg-demo-page cgx-module-standard">
      ${PageHeader({
        eyebrow:'Administración',
        title:'Control de demos, prospectos y vencimientos',
        description:'Asigna accesos comerciales temporales, limita módulos y vigencia, y conserva la configuración en el backend del tenant.',
        actions:`${Button({ id:'btnNewDemoAccess', text:'Crear demo rápido', icon:'fa-key', variant:'secondary' })}${Button({ text:'Panel admin', icon:'fa-users-gear', variant:'primary', attrs:'data-route="admin"' })}`
      })}
      ${demoSummary(rbac, demos)}
      ${Section({ title:'Asignar demo a posible cliente', subtitle:'La interfaz sólo confirma el registro después de que el backend acepte el acceso comercial.', children:builder })}
      ${Section({ title:'Tiempo para usuarios demo', subtitle:'Los cambios de vigencia y límite de módulos se persisten mediante RBAC antes de actualizar la vista.', children:demoUsersTable(rbac) })}
      ${Section({ title:'Módulos habilitables para prospectos', subtitle:'Catálogo autorizado para preventa; no concede permisos administrativos por sí mismo.', children:`<div class="cg-feature-grid">${DemoAccessService.modules.map((module) => `<span class="cg-feature-pill"><i class="fa-solid fa-toggle-on" aria-hidden="true"></i>${safe(module)}</span>`).join('')}</div>` })}
      ${Section({ title:'Prospectos con demo asignada', subtitle:'Histórico comercial del tenant para seguimiento de preventa y conversión.', children:prospectsTable(demos) })}
    </section>`;
  },

  mount(state, { Store, Toast, AccessControlService: AccessSvc }) {
    let loading=false;
    const refresh = async ({silent=false}={}) => {
      if (loading) return;
      loading=true;
      try {
        const rows=await DemoAccessService.list();
        Store.update((draft)=>{draft.demoAccess=Array.isArray(rows)?rows:[];draft.demoAccessLoaded=true;});
        if(!silent)Toast.show('Accesos demo sincronizados con el backend.','success');
      } catch(error) {
        if(!silent)Toast.show(`No se pudieron sincronizar los demos: ${error.message}`,'error');
      } finally { loading=false; }
    };

    if(!state.demoAccessLoaded)refresh({silent:true});

    document.getElementById('btnNewDemoAccess')?.addEventListener('click', async () => {
      const demo = DemoAccessService.defaultDemo();
      const button=document.getElementById('btnNewDemoAccess');
      button?.setAttribute('disabled','disabled');
      try {
        const saved=await DemoAccessService.saveDemo(demo);
        Store.update((draft) => { draft.demoAccess = [saved || demo, ...(draft.demoAccess || [])]; draft.demoAccessLoaded=true; });
        Toast.show('Demo comercial rápido guardado en el backend.', 'success');
      } catch(error) {
        Toast.show(`No se creó la demo: ${error.message}`, 'error');
      } finally { button?.removeAttribute('disabled'); }
    });

    document.getElementById('customDemoAccessForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      if(!form.reportValidity())return;
      const data = Object.fromEntries(new FormData(form));
      const enabledModules = Array.from(form.querySelectorAll('input[name="enabledModules"]:checked')).map((input) => input.value);
      if(!enabledModules.length)return Toast.show('Selecciona al menos un módulo para la demo.','warning');
      const demo = {
        id: `demo_${Date.now().toString(36)}`,
        prospect: data.prospect,
        email: data.email,
        phone: data.phone,
        enabledModules,
        expiresAt: data.expiresAt,
        maxUsers: Number(data.maxUsers || 1),
        status: data.status || 'active',
        notes: data.notes || ''
      };
      const submit=form.querySelector('[type="submit"]');
      submit?.setAttribute('disabled','disabled');
      try {
        const saved=await DemoAccessService.saveDemo(demo);
        Store.update((draft) => { draft.demoAccess = [saved || demo, ...(draft.demoAccess || [])]; draft.demoAccessLoaded=true; });
        Toast.show('Demo comercial persistido para el prospecto.', 'success');
        form.reset();
      } catch(error) {
        Toast.show(`No se guardó la demo comercial: ${error.message}`, 'error');
      } finally { submit?.removeAttribute('disabled'); }
    });

    document.querySelectorAll('[data-demo-time-form]').forEach((form) => form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const userId = form.dataset.demoTimeForm;
      const currentRbac=AccessControlService.ensure(Store.get().rbac);
      const user=currentRbac.users.find((item)=>item.id===userId);
      const role=currentRbac.roles.find((item)=>item.id===user?.roleId);
      if(!user||!role)return Toast.show('No se encontró el usuario demo o su rol.','error');
      const data = Object.fromEntries(new FormData(form));
      const maxModules=Math.max(1,Number(data.maxModules||user.maxModules||currentRbac.demoPolicy?.maxModules||7));
      const enabledModules=AccessControlService.modulesForUser(user,role).slice(0,maxModules);
      const payload={
        fullName:String(data.fullName||user.fullName),
        email:user.email,
        roleName:role.name,
        roleId:role.id,
        days:Math.max(1,Number(data.days||14)),
        maxModules,
        enabledModules,
        status:user.status==='disabled'?'disabled':'active'
      };
      const submit=form.querySelector('[type="submit"]');
      submit?.setAttribute('disabled','disabled');
      try {
        await RbacService.updateDemoUser(user.email||user.id,payload);
        Store.update((draft) => { draft.rbac = AccessSvc.updateUser(draft.rbac, userId, payload); });
        Toast.show('Usuario demo actualizado y persistido en RBAC.', 'success');
      } catch(error) {
        Toast.show(`No se actualizó el usuario demo: ${error.message}`, 'error');
      } finally { submit?.removeAttribute('disabled'); }
    }));
  }
};
