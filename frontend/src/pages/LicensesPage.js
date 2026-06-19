import { PageHeader, Button, Badge, Field, Select } from '../components/ui/index.js';
import { LicenseService } from '../services/licenseService.js';
import { DemoAccessService } from '../services/demoAccessService.js';

export const LicensesPage = {
  render(state) {
    const licenses = state.licenses || [];
    const moduleOptions = DemoAccessService.modules.map((m) => `<label class="cg-feature-pill"><input type="checkbox" name="modules" value="${m}" ${['dashboard','ventas','inventario'].includes(m) ? 'checked' : ''}/> ${m}</label>`).join('');
    return `<section class="cg-page-stack">${PageHeader({eyebrowKey:'licensesEyebrow', titleKey:'licensesTitle', descKey:'licensesDesc', actions: Button({id:'btnLicenseHeartbeat', text:'Simular monitoreo', icon:'fa-satellite-dish', variant:'secondary'})})}
      <form id="licenseForm" class="surface p-5 rounded-[1.5rem] grid gap-4 lg:grid-cols-4">
        ${Field({ labelKey:'email', name:'userEmail', type:'email', value:'prospecto@empresa.com', required:true })}
        ${Select({ labelKey:'plan', name:'plan', options:[{value:'trial',label:'Prueba'},{value:'monthly',label:'Mensual'},{value:'quarterly',label:'Trimestral'},{value:'annual',label:'Anual'}] })}
        ${Field({ labelKey:'daysOfUse', name:'days', type:'number', value:'15', required:true })}
        <div class="self-end">${Button({text:'Generar licencia', icon:'fa-key', variant:'primary'})}</div>
        <div class="lg:col-span-4"><p class="label">Módulos habilitados</p><div class="cg-feature-grid">${moduleOptions}</div></div>
      </form>
      <div class="pl-table-wrap"><table class="pl-table"><thead><tr><th>Usuario</th><th>Plan</th><th>Key</th><th>Vence</th><th>Módulos</th><th>Monitoreo</th><th>Estado</th></tr></thead><tbody>${licenses.length ? licenses.map((l) => `<tr><td>${l.userEmail}</td><td>${l.plan}</td><td><code>${l.key}</code></td><td>${l.expiresAt?.slice(0,10)}</td><td>${(l.modules||[]).slice(0,3).join(', ')}${(l.modules||[]).length>3?'…':''}</td><td>${l.lastSeenAt ? new Date(l.lastSeenAt).toLocaleString('es-VE') : 'Sin heartbeat'}</td><td>${Badge(l.status, l.status === 'active' ? 'success' : 'warning')}</td></tr>`).join('') : '<tr><td colspan="7" class="text-center">Sin licencias generadas</td></tr>'}</tbody></table></div>
    </section>`;
  },
  mount(_state, { Store, Toast }) {
    document.getElementById('licenseForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const modules = [...form.querySelectorAll('input[name="modules"]:checked')].map((n) => n.value);
      const license = await LicenseService.generateKey({ userEmail: form.userEmail.value, plan: form.plan.value, days: form.days.value, modules });
      Store.update((draft) => { draft.licenses = [license, ...(draft.licenses || [])]; });
      await LicenseService.save(license);
      Toast.show('Licencia cifrada generada y asignada.', 'success');
    });
    document.getElementById('btnLicenseHeartbeat')?.addEventListener('click', () => {
      Store.update((draft) => { if (draft.licenses?.[0]) draft.licenses[0].lastSeenAt = new Date().toISOString(); });
      Toast.show('Heartbeat de monitoreo simulado.', 'info');
    });
  }
};
