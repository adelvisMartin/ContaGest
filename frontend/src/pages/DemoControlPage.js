import { PageHeader, Button, Badge, Field, Select, Textarea } from '../components/ui/index.js';
import { DemoAccessService } from '../services/demoAccessService.js';
import { AccessControlService } from '../services/accessControlService.js';
import { escapeHtml } from '../utils/dom.js';

const fmt = (date) => date ? new Date(date).toLocaleString('es-VE', { dateStyle:'short', timeStyle:'short' }) : 'Sin vencimiento';
const todayPlus = (days) => new Date(Date.now() + Number(days || 14) * 86400000).toISOString().slice(0, 10);

function demoModuleChecks(selected = DemoAccessService.defaultDemo().enabledModules) {
  const set = new Set(selected || []);
  return `<div class="cg-demo-module-grid">${DemoAccessService.modules.map((m) => `<label class="cg-permission-pill ${set.has(m) ? 'is-on' : ''}"><input type="checkbox" name="enabledModules" value="${escapeHtml(m)}" ${set.has(m) ? 'checked' : ''}/><span>${escapeHtml(m)}</span></label>`).join('')}</div>`;
}

function demoSummaryCards(rbac, demos) {
  const demoUsers = rbac.users.filter((user) => user.demo);
  const expiredUsers = demoUsers.filter((user) => AccessControlService.remaining(user).expired).length;
  const expiringUsers = demoUsers.filter((user) => { const remaining = AccessControlService.remaining(user); return !remaining.expired && Number(remaining.days ?? 99) <= Number(rbac.demoPolicy?.warningDays || 3); }).length;
  return `<div class="cg-demo-kpi-grid">
    <article><span>Usuarios demo</span><strong>${demoUsers.length}</strong><small>${expiredUsers} expirado(s) · ${expiringUsers} por vencer</small></article>
    <article><span>Prospectos</span><strong>${demos.length}</strong><small>Accesos comerciales registrados</small></article>
    <article><span>Máx. módulos default</span><strong>${rbac.demoPolicy?.maxModules || 7}</strong><small>${rbac.demoPolicy?.defaultDays || 14} días por defecto</small></article>
    <article><span>Módulos disponibles</span><strong>${DemoAccessService.modules.length}</strong><small>Catálogo para preventa</small></article>
  </div>`;
}

export const DemoControlPage = {
  render(state) {
    const demos = state.demoAccess || [];
    const rbac = AccessControlService.ensure(state.rbac);
    const demoUsers = rbac.users.filter((user) => user.demo);
    return `
      <section class="cg-page-stack cg-demo-page cgx-module-standard">
        ${PageHeader({
          eyebrowKey:'demoEyebrow',
          titleKey:'Control de demos, prospectos y vencimientos',
          descKey:'El administrador asigna demos a posibles clientes, controla módulos, duración, límites y monitorea el uso comercial.',
          actions: Button({ id:'btnNewDemoAccess', text:'Crear demo rápido', icon:'fa-key', variant:'secondary', attrs:'type="button"' }) + Button({ text:'Panel admin', icon:'fa-users-gear', variant:'primary', attrs:'data-route="admin" type="button"' })
        })}
        ${demoSummaryCards(rbac, demos)}

        <section class="cgx-section cg-demo-builder">
          <header class="cgx-section-head"><div><h2>Asignar demo a posible cliente</h2><p>Configura prospecto, contacto, vencimiento, cantidad máxima de usuarios y módulos habilitados para preventa.</p></div></header>
          <div class="cgx-section-body">
            <form id="customDemoAccessForm" class="cg-demo-access-form">
              ${Field({ labelKey:'Prospecto / empresa', name:'prospect', value:'Cliente potencial', required:true })}
              ${Field({ labelKey:'Email', name:'email', type:'email', value:'prospecto@empresa.com', required:true })}
              ${Field({ labelKey:'Teléfono', name:'phone', value:'+584120000000' })}
              ${Field({ labelKey:'Expira', name:'expiresAt', type:'date', value:todayPlus(rbac.demoPolicy?.defaultDays || 14), attrs:'min="2024-01-01"' })}
              ${Field({ labelKey:'Máx. usuarios', name:'maxUsers', type:'number', value:String(rbac.demoPolicy?.maxUsers || 3), attrs:'min="1" max="50"' })}
              ${Select({ labelKey:'Estado', name:'status', value:'active', options:[{value:'active', label:'Activo'}, {value:'paused', label:'Pausado'}, {value:'expired', label:'Expirado'}] })}
              <div class="cg-demo-modules-field"><label class="label">Módulos para la demo</label>${demoModuleChecks()}</div>
              ${Textarea({ labelKey:'Notas comerciales / alcance', name:'notes', value:'Demo comercial controlado con módulos limitados y vencimiento automático.' })}
              <div class="cg-demo-form-actions">${Button({ text:'Guardar demo comercial', icon:'fa-floppy-disk', type:'submit' })}</div>
            </form>
          </div>
        </section>

        <section class="surface p-5 rounded-[1.5rem] cg-demo-users-panel">
          <h3 class="text-xl font-black mb-3">Tiempo para usuarios demo</h3>
          <div class="pl-table-wrap"><table class="pl-table"><thead><tr><th>Usuario</th><th>Rol</th><th>Vence</th><th>Restante</th><th>Máx. módulos</th><th>Actualizar</th></tr></thead><tbody>
            ${demoUsers.length ? demoUsers.map((user) => { const role = rbac.roles.find((r)=>r.id===user.roleId); const remaining = AccessControlService.remaining(user); return `<tr>
              <td><input class="input cg-admin-inline-input" name="fullName" value="${escapeHtml(user.fullName)}" form="demoEdit-${user.id}" /><small>${escapeHtml(user.email)}</small></td>
              <td>${Badge(role?.name || 'Demo', 'warning')}</td>
              <td>${fmt(user.demoExpiresAt)}</td>
              <td>${Badge(remaining.label, remaining.expired ? 'danger' : remaining.days <= 3 ? 'warning' : 'success')}</td>
              <td><input class="input cg-admin-inline-input" name="maxModules" type="number" min="1" max="${role?.modules?.length || 30}" value="${user.maxModules || rbac.demoPolicy.maxModules}" form="demoEdit-${user.id}" /></td>
              <td><form id="demoEdit-${user.id}" class="cg-inline-demo-days" data-demo-time-form="${user.id}"><input class="input cg-admin-inline-input" name="days" type="number" value="14" min="1" max="365" /><button class="btn btn-secondary" type="submit"><i class="fa-solid fa-floppy-disk"></i></button></form></td>
            </tr>`; }).join('') : '<tr><td colspan="6" class="text-center">Sin usuarios demo</td></tr>'}
          </tbody></table></div>
        </section>

        <section class="surface p-5 rounded-[1.5rem]">
          <h3 class="text-xl font-black mb-3">Módulos habilitables para prospectos</h3>
          <div class="cg-feature-grid">${DemoAccessService.modules.map((m) => `<span class="cg-feature-pill"><i class="fa-solid fa-toggle-on"></i>${escapeHtml(m)}</span>`).join('')}</div>
        </section>
        <section class="cgx-section">
          <header class="cgx-section-head"><div><h2>Prospectos con demo asignada</h2><p>Histórico comercial para seguimiento de preventa y conversión.</p></div></header>
          <div class="cgx-section-body"><div class="pl-table-wrap">
            <table class="pl-table">
              <thead><tr><th>Prospecto</th><th>Contacto</th><th>Módulos</th><th>Expira</th><th>Usuarios</th><th>Estado</th></tr></thead>
              <tbody>${demos.length ? demos.map((d) => `<tr><td><strong>${escapeHtml(d.prospect)}</strong><br><small>${escapeHtml(d.notes || '')}</small></td><td>${escapeHtml(d.email)}<br>${escapeHtml(d.phone)}</td><td>${(d.enabledModules || []).slice(0,4).map(escapeHtml).join(', ')}${(d.enabledModules||[]).length>4?'…':''}</td><td>${escapeHtml(d.expiresAt)}</td><td>${escapeHtml(d.maxUsers)}</td><td>${Badge(d.status || 'active', d.status === 'expired' ? 'danger' : d.status === 'paused' ? 'warning' : 'success')}</td></tr>`).join('') : '<tr><td colspan="6" class="text-center">Sin demos registrados</td></tr>'}</tbody>
            </table>
          </div></div>
        </section>
      </section>`;
  },
  mount(state, { Store, Toast, AccessControlService: AccessSvc }) {
    document.getElementById('btnNewDemoAccess')?.addEventListener('click', async () => {
      const demo = DemoAccessService.defaultDemo();
      Store.update((draft) => { draft.demoAccess = [demo, ...(draft.demoAccess || [])]; });
      await DemoAccessService.saveDemo(demo);
      Toast.show('Demo comercial rápido creado con módulos controlados.', 'success');
    });
    document.getElementById('customDemoAccessForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = Object.fromEntries(new FormData(form));
      const enabledModules = Array.from(form.querySelectorAll('input[name="enabledModules"]:checked')).map((input) => input.value);
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
      Store.update((draft) => { draft.demoAccess = [demo, ...(draft.demoAccess || [])]; });
      await DemoAccessService.saveDemo(demo);
      Toast.show('Demo comercial asignado al prospecto.', 'success');
    });
    document.querySelectorAll('[data-demo-time-form]').forEach((form) => form.addEventListener('submit', (event) => {
      event.preventDefault();
      const userId = form.dataset.demoTimeForm;
      const data = Object.fromEntries(new FormData(form));
      Store.update((draft) => { draft.rbac = AccessSvc.updateUser(draft.rbac, userId, data); });
      Toast.show('Usuario demo actualizado.', 'success');
    }));
  }
};
