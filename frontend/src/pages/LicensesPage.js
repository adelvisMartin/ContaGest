import { PageHeader, Button, Badge, Field, Select } from '../components/ui/index.js';
import { LicenseService } from '../services/licenseService.js';
import { DemoAccessService } from '../services/demoAccessService.js';
import { escapeHtml } from '../utils/dom.js';

const sectorOptions = [
  { value:'comercio', label:'Comercio / tienda' },
  { value:'servicios', label:'Servicios profesionales' },
  { value:'restaurante', label:'Restaurante / alimentos' },
  { value:'contador', label:'Contabilidad / firma' },
  { value:'salud', label:'Consultorio o clínica médica' },
  { value:'veterinaria', label:'Clínica veterinaria' },
  { value:'gimnasio', label:'Gimnasio / fitness' },
  { value:'manufactura', label:'Manufactura' },
  { value:'distribucion', label:'Distribución' },
  { value:'profesional', label:'Profesional independiente' },
  { value:'otro', label:'Otro rubro' }
];

const sectorDefaults = {
  salud:['dashboard','salud','clientes','asistente-ia','reportes','soporte'],
  veterinaria:['dashboard','veterinaria','clientes','inventario','asistente-ia','reportes','soporte'],
  gimnasio:['dashboard','gimnasio','rutinas','nutricion','clientes','asistente-ia','reportes','soporte'],
  contador:['dashboard','contabilidad','plan-cuentas','libro-mayor','balance-sumas-saldos','hoja-trabajo','tributos','reportes','asistente-ia'],
  restaurante:['dashboard','ventas','pedidos','pos-sede','tracking-pedidos','inventario','reportes','soporte'],
  comercio:['dashboard','ventas','cotizacion','clientes','inventario','kardex','compras','reportes','soporte'],
  servicios:['dashboard','cotizacion','clientes','ventas','reportes','asistente-ia','soporte']
};

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
      <p class="cg-license-warning"><i class="fa-solid fa-triangle-exclamation"></i> Guarda esta información ahora. La contraseña y la licencia completas no se recuperan después.</p>
    </div>
    <div class="cg-license-once-actions">
      ${Button({ id:'btnCopyCredentials', text:'Copiar credenciales', icon:'fa-copy', variant:'primary' })}
      ${Button({ id:'btnDismissCredentials', text:'Ocultar', icon:'fa-eye-slash', variant:'secondary' })}
    </div>
  </article>`;
}

function licenseRows(licenses) {
  if (!licenses.length) return '<tr><td colspan="9" class="text-center">No hay licencias emitidas para esta empresa.</td></tr>';
  return licenses.map((license) => `<tr>
    <td><strong>${escapeHtml(license.userEmail)}</strong><br><small>${escapeHtml(license.companyRif || license.company?.rif || '')}</small></td>
    <td>${escapeHtml(license.businessSector || 'general')}</td>
    <td>${escapeHtml(license.plan)}</td>
    <td><code>${escapeHtml(license.keyPreview || 'Oculta')}</code></td>
    <td>${new Date(license.expiresAt).toLocaleDateString('es-VE')}</td>
    <td>${(license.modules || []).slice(0,4).map(escapeHtml).join(', ')}${(license.modules || []).length > 4 ? '…' : ''}</td>
    <td>${Number(license.devicesUsed || 0)} / ${Number(license.maxDevices || 1)}</td>
    <td>${Badge(license.status, license.status === 'active' ? 'success' : license.status === 'revoked' ? 'danger' : 'warning')}</td>
    <td>${license.status === 'active' ? `<button type="button" class="cgx-icon-action" data-license-revoke="${escapeHtml(license.id)}" aria-label="Revocar licencia" title="Revocar licencia"><i class="fa-solid fa-ban"></i></button>` : '—'}</td>
  </tr>`).join('');
}

export const LicensesPage = {
  render(state) {
    const licenses = state.licenses || [];
    const modules = [...new Set([...DemoAccessService.modules, 'salud','veterinaria','gimnasio','rutinas','nutricion','mensajes','libro-mayor','balance-sumas-saldos','hoja-trabajo','tributos'])];
    const selectedSector = state.licenseDraft?.businessSector || 'comercio';
    const defaults = sectorDefaults[selectedSector] || sectorDefaults.comercio;
    const moduleOptions = modules.map((module) => `<label class="cg-feature-pill"><input type="checkbox" name="modules" value="${escapeHtml(module)}" ${defaults.includes(module) ? 'checked' : ''}/><span>${escapeHtml(module)}</span></label>`).join('');

    return `<section class="cg-page-stack cg-license-page">
      ${PageHeader({
        eyebrowKey:'licensesEyebrow',
        titleKey:'Licencias y credenciales de clientes',
        descKey:'Emite accesos limitados a una sola empresa, rubro, vigencia, módulos y cantidad de dispositivos.',
        actions: Button({id:'btnLicenseRefresh', text:'Actualizar', icon:'fa-rotate', variant:'secondary'})
      })}
      ${credentialsCard(state.licenseCredentials)}
      <form id="licenseForm" class="surface cg-license-form">
        <div class="cg-license-form-head"><div><h3>Nueva licencia</h3><p>La licencia quedará vinculada al tenant activo y no funcionará en otra empresa.</p></div><span class="cg-license-tenant"><i class="fa-solid fa-building-shield"></i>${escapeHtml(state.settings?.companyName || 'Empresa activa')} · ${escapeHtml(state.settings?.companyRif || '')}</span></div>
        <div class="cg-license-fields">
          ${Field({ labelKey:'Nombre del cliente', name:'fullName', value:'Cliente de prueba', required:true })}
          ${Field({ labelKey:'Correo de acceso', name:'userEmail', type:'email', value:'prospecto@empresa.com', required:true })}
          ${Select({ labelKey:'Rubro o destino comercial', name:'businessSector', value:selectedSector, options:sectorOptions })}
          ${Select({ labelKey:'Uso autorizado', name:'commercialUse', value:'evaluacion', options:[{value:'evaluacion',label:'Evaluación comercial'},{value:'demostracion',label:'Demostración guiada'},{value:'operacion',label:'Operación contratada'},{value:'capacitacion',label:'Capacitación'},{value:'soporte',label:'Soporte'}] })}
          ${Select({ labelKey:'Plan', name:'plan', value:'trial', options:[{value:'trial',label:'Prueba'},{value:'monthly',label:'Mensual'},{value:'quarterly',label:'Trimestral'},{value:'annual',label:'Anual'},{value:'enterprise',label:'Enterprise'}] })}
          ${Field({ labelKey:'Días de uso', name:'days', type:'number', value:'15', required:true, attrs:'min="1" max="3650"' })}
          ${Field({ labelKey:'Usuarios máximos', name:'maxUsers', type:'number', value:'1', required:true, attrs:'min="1" max="100"' })}
          ${Field({ labelKey:'Dispositivos máximos', name:'maxDevices', type:'number', value:'1', required:true, attrs:'min="1" max="20"' })}
        </div>
        <div class="cg-license-modules"><p class="label">Módulos habilitados</p><div class="cg-feature-grid">${moduleOptions}</div></div>
        <div class="cg-license-submit">${Button({id:'btnGenerateLicense', text:'Generar licencia y credenciales', icon:'fa-key', variant:'primary', type:'submit'})}</div>
      </form>

      <section class="surface cg-license-list">
        <header><div><h3>Licencias de la empresa</h3><p>${licenses.length} registro(s). Las claves completas nunca se vuelven a mostrar.</p></div></header>
        <div class="pl-table-wrap"><table class="pl-table"><thead><tr><th>Usuario / empresa</th><th>Rubro</th><th>Plan</th><th>Key</th><th>Vence</th><th>Módulos</th><th>Dispositivos</th><th>Estado</th><th></th></tr></thead><tbody>${licenseRows(licenses)}</tbody></table></div>
      </section>
    </section>`;
  },

  mount(_state, { Store, Toast }) {
    const load = async ({ silent = false } = {}) => {
      try {
        const licenses = await LicenseService.list();
        Store.update((draft) => { draft.licenses = Array.isArray(licenses) ? licenses : []; draft.licensesLoaded = true; });
        if (!silent) Toast.show('Licencias actualizadas.', 'success');
      } catch (error) {
        if (!silent) Toast.show(`No se pudieron cargar las licencias: ${error.message}`, 'error');
      }
    };
    if (!Store.get().licensesLoaded) load({ silent:true });
    document.getElementById('btnLicenseRefresh')?.addEventListener('click', () => load());

    document.querySelector('[name="businessSector"]')?.addEventListener('change', (event) => {
      Store.update((draft) => { draft.licenseDraft = { ...(draft.licenseDraft || {}), businessSector:event.target.value }; });
    });

    document.getElementById('licenseForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const modules = [...form.querySelectorAll('input[name="modules"]:checked')].map((node) => node.value);
      if (!modules.length) return Toast.show('Selecciona al menos un módulo.', 'warning');
      const button = document.getElementById('btnGenerateLicense');
      button?.setAttribute('disabled', 'disabled');
      try {
        const result = await LicenseService.generate({
          fullName: form.fullName.value,
          userEmail: form.userEmail.value,
          businessSector: form.businessSector.value,
          commercialUse: form.commercialUse.value,
          plan: form.plan.value,
          days: Number(form.days.value),
          maxUsers: Number(form.maxUsers.value),
          maxDevices: Number(form.maxDevices.value),
          modules
        });
        Store.update((draft) => {
          draft.licenseCredentials = result.credentials;
          draft.licenses = [result, ...(draft.licenses || []).filter((item) => item.id !== result.id)];
        });
        Toast.show('Licencia, usuario y contraseña temporal creados.', 'success');
      } catch (error) {
        Toast.show(`No se pudo generar la licencia: ${error.message}`, 'error');
      } finally {
        button?.removeAttribute('disabled');
      }
    });

    document.getElementById('btnCopyCredentials')?.addEventListener('click', async () => {
      const card = document.querySelector('[data-license-credentials]');
      try { await navigator.clipboard.writeText(card?.dataset.licenseCredentials || ''); Toast.show('Credenciales copiadas.', 'success'); }
      catch { Toast.show('No se pudieron copiar automáticamente. Selecciona los datos manualmente.', 'warning'); }
    });
    document.getElementById('btnDismissCredentials')?.addEventListener('click', () => Store.update((draft) => { draft.licenseCredentials = null; }));

    document.querySelectorAll('[data-license-revoke]').forEach((button) => button.addEventListener('click', async () => {
      if (!window.confirm('¿Revocar esta licencia? El cliente perderá acceso en todos sus dispositivos.')) return;
      try {
        const updated = await LicenseService.revoke(button.dataset.licenseRevoke);
        Store.update((draft) => { draft.licenses = (draft.licenses || []).map((item) => item.id === updated.id ? updated : item); });
        Toast.show('Licencia revocada y dispositivos bloqueados.', 'success');
      } catch (error) {
        Toast.show(`No se pudo revocar: ${error.message}`, 'error');
      }
    }));
  }
};
