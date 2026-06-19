import { PageHeader, Field, Select, Button, Textarea } from '../components/ui/index.js';
import { mountSubmit, qs, downloadText, escapeHtml } from '../utils/dom.js';
import { DataSyncService } from '../services/dataSyncService.js';

const themePreview = (key, title, current, previewClass) => `
  <button type="button" data-theme-card="${key}" class="theme-card ${current === key ? 'active' : ''}">
    <div class="theme-preview ${previewClass}">
      <span></span><i></i><b></b><em></em><strong></strong>
    </div>
    <div class="flex items-center justify-between gap-3 px-1">
      <span class="font-black">${title}</span>
      <span class="h-5 w-5 rounded-full border-2 ${current === key ? 'border-[#4f46e5] bg-[#4f46e5]' : 'border-slate-300'}"></span>
    </div>
  </button>`;

const membertePreview = (s) => `
  <article class="cg-letterhead-preview">
    <div class="cg-letterhead-top">
      <div class="cg-letterhead-logo">
        ${s.companyLogoDataUrl ? `<img src="${escapeHtml(s.companyLogoDataUrl)}" alt="Logo empresa" />` : `<span>${escapeHtml(String(s.companyTradeName || s.companyName || 'CG').slice(0, 2).toUpperCase())}</span>`}
      </div>
      <div>
        <p class="cg-letterhead-kicker">Membrete documental</p>
        <h4>${escapeHtml(s.companyTradeName || s.companyName || 'Empresa')}</h4>
        <p>RIF: ${escapeHtml(s.companyRif || '-')}</p>
      </div>
    </div>
    <div class="cg-letterhead-lines">
      <span><i class="fa-solid fa-location-dot"></i>${escapeHtml(s.companyAddress || 'Dirección fiscal pendiente')}</span>
      <span><i class="fa-solid fa-phone"></i>${escapeHtml(s.companyPhone || 'Teléfono pendiente')}</span>
      <span><i class="fa-solid fa-envelope"></i>${escapeHtml(s.companyEmail || 'Correo pendiente')}</span>
      <span><i class="fa-solid fa-globe"></i>${escapeHtml(s.companyWebsite || 'Web pendiente')}</span>
    </div>
    <p class="cg-letterhead-note">${escapeHtml(s.documentFooter || '')}</p>
  </article>`;

export const SettingsPage = {
  render(state) {
    const s = state.settings;
    return `<section class="surface rounded-[1.75rem] p-5 sm:p-7">${PageHeader({ eyebrowKey:'settingsEyebrow', titleKey:'settingsTitle', descKey:'settingsDesc' })}
      <div class="grid gap-6 xl:grid-cols-[260px_1fr]">
        <aside class="panel-soft rounded-[1.5rem] p-4">
          <h3 class="mb-4 text-2xl font-black text-[#1e3a8a] dark:text-white">Configuración</h3>
          <nav class="space-y-2 text-sm font-black">
            <button type="button" class="settings-item active" data-settings-jump="company"><i class="fa-solid fa-building"></i>Empresa y membrete</button>
            <button type="button" class="settings-item" data-settings-jump="appearance"><i class="fa-solid fa-palette"></i>Apariencia</button>
            <button type="button" class="settings-item" data-settings-jump="integration"><i class="fa-solid fa-plug"></i>Integraciones</button>
            <button type="button" class="settings-item" data-settings-jump="backup"><i class="fa-solid fa-shield-halved"></i>Respaldo y QA</button>
          </nav>
        </aside>
        <div class="grid gap-6">
          <form id="settingsForm" class="grid gap-6">
            <article id="company" class="panel-soft rounded-[1.5rem] p-5">
              <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h3 class="text-3xl font-black text-slate-950 dark:text-white">Empresa y membrete fiscal</h3>
                  <p class="mt-2 text-base font-bold text-slate-600 dark:text-slate-300">Estos datos alimentan el encabezado, pie de página y datos de contacto de facturas, reportes, libros y comprobantes PDF.</p>
                </div>
                <div class="flex flex-wrap gap-2">
                  <input id="companyLogoInput" type="file" accept="image/*" class="hidden" />
                  <input id="companyLogoDataUrl" type="hidden" name="companyLogoDataUrl" value="${escapeHtml(s.companyLogoDataUrl || '')}" />
                  ${Button({ id:'btnCompanyLogo', text:'Subir logo', icon:'fa-image', variant:'secondary', attrs:'type="button"' })}
                  ${Button({ id:'btnClearCompanyLogo', text:'Quitar logo', icon:'fa-trash-can', variant:'secondary', attrs:'type="button"' })}
                </div>
              </div>
              <div class="mt-6 grid gap-4 lg:grid-cols-[1fr_340px]">
                <div class="grid gap-4 sm:grid-cols-2">
                  ${Field({ labelKey:'Razón social', name:'companyName', value:s.companyName })}
                  ${Field({ labelKey:'Nombre comercial', name:'companyTradeName', value:s.companyTradeName || s.companyName })}
                  ${Field({ labelKey:'RIF', name:'companyRif', value:s.companyRif })}
                  ${Field({ labelKey:'Teléfono', name:'companyPhone', value:s.companyPhone || '' })}
                  ${Field({ labelKey:'Correo de empresa', name:'companyEmail', type:'email', value:s.companyEmail || '' })}
                  ${Field({ labelKey:'Sitio web', name:'companyWebsite', value:s.companyWebsite || '' })}
                  ${Textarea({ labelKey:'Dirección fiscal', name:'companyAddress', value:s.companyAddress, className:'sm:col-span-2' })}
                  ${Field({ labelKey:'Subtítulo de documentos', name:'companySlogan', value:s.companySlogan || '' , className:'sm:col-span-2' })}
                  ${Textarea({ labelKey:'Pie de documentos', name:'documentFooter', value:s.documentFooter || '', className:'sm:col-span-2' })}
                  ${Textarea({ labelKey:'Nota legal / auditoría', name:'documentLegalNote', value:s.documentLegalNote || '', className:'sm:col-span-2' })}
                </div>
                ${membertePreview(s)}
              </div>
            </article>

            <article id="appearance" class="panel-soft rounded-[1.5rem] p-5">
              <h3 class="text-3xl font-black text-slate-950 dark:text-white">Configuración de apariencia</h3>
              <p class="mt-2 text-base font-bold text-slate-600 dark:text-slate-300">Personaliza la interfaz para que se adapte a tu entorno de trabajo y preferencias visuales.</p>
              <div class="mt-6 border-t border-slate-200 pt-6 dark:border-slate-700">
                <h4 class="text-xl font-black">Preferencia de tema</h4>
                <p class="mt-1 text-sm font-bold text-slate-600 dark:text-slate-300">Selecciona el modo visual para la aplicación.</p>
                <div class="mt-5 grid gap-4 md:grid-cols-5">
                  ${themePreview('light','Claro',s.theme,'preview-light')}
                  ${themePreview('dark','Oscuro',s.theme,'preview-dark')}
                  ${themePreview('enterprise','Enterprise Slate',s.theme,'preview-slate')}
                  ${themePreview('executive','Executive Azul',s.theme,'preview-executive')}
                  ${themePreview('finance','Finanzas Verde',s.theme,'preview-finance')}
                </div>
              </div>
              <div class="mt-8 grid gap-4 sm:grid-cols-2">
                ${Select({ labelKey:'Tema', name:'theme', value:s.theme, options:[{value:'light',label:'Claro'}, {value:'dark',label:'Oscuro'}, {value:'enterprise',label:'Enterprise Slate'}, {value:'executive',label:'Executive Azul'}, {value:'finance',label:'Finanzas Verde'}] })}
                ${Select({ labelKey:'Idioma', name:'lang', value:s.lang, options:[{value:'es',label:'Español'}, {value:'en',label:'English'}] })}
              </div>
              <div class="mt-8 border-t border-slate-200 pt-6 dark:border-slate-700">
                <h4 class="text-xl font-black">Densidad de datos</h4>
                <p class="mt-1 text-sm font-bold text-slate-600 dark:text-slate-300">Ajusta el espaciado en tablas y listas para mostrar más o menos información.</p>
                <div class="mt-5 overflow-hidden rounded-2xl border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900">
                  <label class="block border-b border-slate-200 p-5 dark:border-slate-700"><div class="flex items-start gap-3"><input name="density" type="radio" value="comfortable" checked class="mt-1"><div><p class="font-black">Cómoda (Predeterminada)</p><p class="text-sm font-bold text-slate-600 dark:text-slate-300">Mayor espaciado. Ideal para pantallas táctiles y lectura relajada.</p><div class="density-demo mt-4 comfortable"></div></div></div></label>
                  <label class="block p-5"><div class="flex items-start gap-3"><input name="density" type="radio" value="compact" class="mt-1"><div><p class="font-black">Compacta</p><p class="text-sm font-bold text-slate-600 dark:text-slate-300">Menor espaciado. Permite ver más registros simultáneamente en pantallas grandes.</p><div class="density-demo mt-4 compact"></div></div></div></label>
                </div>
              </div>
            </article>

            <article id="integration" class="panel-soft grid gap-4 rounded-[1.5rem] p-5 sm:grid-cols-2">
              <div class="sm:col-span-2">
                <h3 class="text-2xl font-black text-slate-950 dark:text-white">Integración backend / Supabase</h3>
                <p class="mt-1 text-sm font-bold text-slate-600 dark:text-slate-300">Variables operativas para local, GitHub, Vercel y backend desplegado.</p>
              </div>
              ${Field({ labelKey:'URL backend', name:'backendUrl', value:s.backendUrl })}
              ${Field({ labelKey:'URL Apps Script / Sheets', name:'sheetsUrl', value:s.sheetsUrl })}
            </article>

            <article id="backup" class="panel-soft rounded-[1.5rem] p-5">
              <h3 class="text-2xl font-black text-slate-950 dark:text-white">Guardado, respaldo y QA</h3>
              <div class="mt-4 flex flex-wrap gap-2">
                ${Button({ text:'Guardar configuración', i18n:'save', icon:'fa-floppy-disk' })}
                ${Button({ id:'btnHealth', text:'Probar backend', icon:'fa-plug-circle-check', variant:'secondary', attrs:'type="button"' })}
                ${Button({ id:'btnPushBackend', text:'Subir localStorage al backend', icon:'fa-cloud-arrow-up', variant:'secondary', attrs:'type="button"' })}
                ${Button({ id:'btnPullBackend', text:'Bajar backend a localStorage', icon:'fa-cloud-arrow-down', variant:'secondary', attrs:'type="button"' })}
                ${Button({ id:'btnExportState', text:'Exportar respaldo', icon:'fa-download', variant:'secondary', attrs:'type="button"' })}
                ${Button({ id:'btnResetState', text:'Reiniciar demo', icon:'fa-rotate-left', variant:'danger', attrs:'type="button"' })}
              </div>
            </article>
          </form>
        </div>
      </div>
    </section>`;
  },
  mount(state, { Store, Toast, Modal }) {
    mountSubmit('#settingsForm', (data) => {
      Store.set({ settings:data });
      Toast.show('Configuración de empresa, membrete y sistema guardada.', 'success');
    });
    document.querySelectorAll('[data-theme-card]').forEach((button) => button.addEventListener('click', () => Store.update((draft) => { draft.settings.theme = button.dataset.themeCard; })));
    document.querySelectorAll('[data-settings-jump]').forEach((button) => button.addEventListener('click', () => {
      const target = document.getElementById(button.dataset.settingsJump);
      target?.scrollIntoView({ behavior:'smooth', block:'start' });
    }));
    const logoInput = qs('#companyLogoInput');
    const logoHidden = qs('#companyLogoDataUrl');
    qs('#btnCompanyLogo')?.addEventListener('click', () => logoInput?.click());
    qs('#btnClearCompanyLogo')?.addEventListener('click', () => {
      if (logoHidden) logoHidden.value = '';
      Store.update((draft) => { draft.settings.companyLogoDataUrl = ''; });
      Toast.show('Logo removido del membrete.', 'info');
    });
    logoInput?.addEventListener('change', (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        Toast.show('Selecciona una imagen válida para el logo.', 'warning');
        return;
      }
      if (file.size > 550 * 1024) {
        Toast.show('El logo debe pesar menos de 550KB para no inflar localStorage ni los PDFs.', 'warning');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || '');
        if (logoHidden) logoHidden.value = dataUrl;
        Store.update((draft) => { draft.settings.companyLogoDataUrl = dataUrl; });
        Toast.show('Logo cargado en el membrete. Guarda la configuración para conservarlo.', 'success');
      };
      reader.readAsDataURL(file);
    });
    qs('#btnHealth')?.addEventListener('click', async () => {
      try { const result = await DataSyncService.health(Store.get().settings.backendUrl); Toast.show(`Backend OK: ${result.service}`, 'success'); }
      catch (error) { Toast.show(`Backend no disponible: ${error.message}`, 'warning'); }
    });
    qs('#btnPushBackend')?.addEventListener('click', async () => {
      try { const result = await DataSyncService.pushAll(Store.get().settings.backendUrl, Store.get()); Toast.show(`Sincronización subida: ${result.length} recursos.`, 'success'); }
      catch (error) { Toast.show(`No se pudo subir al backend: ${error.message}`, 'error'); }
    });
    qs('#btnPullBackend')?.addEventListener('click', async () => {
      try { Store.update((draft) => { draft.__syncResult = []; }); const current = Store.get(); Store.update((draft) => { draft.__pulling = true; }); const baseUrl = current.settings.backendUrl; const draftState = Store.get(); await DataSyncService.pullAll(baseUrl, draftState); Store.import(draftState); Toast.show('Datos del backend cargados en localStorage.', 'success'); }
      catch (error) { Toast.show(`No se pudo bajar del backend: ${error.message}`, 'error'); }
    });
    qs('#btnExportState')?.addEventListener('click', () => downloadText('contagest-ve-respaldo-v10-2.json', Store.export(), 'application/json'));
    qs('#btnResetState')?.addEventListener('click', () => Modal.confirm({ title:'Reiniciar demo', body:'Se restaurarán los datos de ejemplo.', confirmText:'Reiniciar', onConfirm:() => Store.reset() }));
  }
};
