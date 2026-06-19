import { PageHeader, Button, Badge } from '../components/ui/index.js';
import { DataImportService, IMPORT_TEMPLATES } from '../services/dataImportService.js';
import { uid } from '../utils/dom.js';

export const DataImportPage = {
  render(state) {
    const preview = state.importPreview || [];
    return `<section class="cg-page-stack">${PageHeader({eyebrowKey:'dataImportEyebrow', titleKey:'dataImportTitle', descKey:'dataImportDesc', actions: Button({id:'btnDownloadTemplate', text:'Plantilla CSV', icon:'fa-download', variant:'secondary'})})}
      <form id="importForm" class="surface p-5 rounded-[1.5rem] grid gap-4 md:grid-cols-[220px_1fr_auto]">
        <select id="importType" class="select"><option value="inventory">Inventario</option><option value="clients">Clientes</option><option value="suppliers">Proveedores</option><option value="accounts">Plan de cuentas</option><option value="payroll">Nómina</option></select>
        <input id="importFile" class="input" type="file" accept=".csv,.txt,.tsv,.json,.xlsx" />
        ${Button({text:'Previsualizar', icon:'fa-file-import', variant:'primary'})}
      </form>
      <div class="surface p-5 rounded-[1.5rem]"><h3 class="text-xl font-black">Campos esperados</h3><div class="cg-feature-grid mt-3">${Object.entries(IMPORT_TEMPLATES).map(([type, fields]) => `<span class="cg-feature-pill"><strong>${type}</strong> ${fields.join(', ')}</span>`).join('')}</div></div>
      <div class="pl-table-wrap"><table class="pl-table"><thead><tr><th>#</th><th>Estado</th><th>Registro</th></tr></thead><tbody>${preview.length ? preview.slice(0,50).map((r) => `<tr><td>${r.index}</td><td>${r.ok ? Badge('OK','success') : Badge('Faltan: '+r.missing.join(', '),'danger')}</td><td><code>${JSON.stringify(r.row).replaceAll('<','&lt;')}</code></td></tr>`).join('') : '<tr><td colspan="3" class="text-center">Sube un CSV/TXT/JSON para previsualizar antes de cargar.</td></tr>'}</tbody></table></div>
      ${preview.length ? `<button id="btnApplyImport" class="btn btn-primary"><i class="fa-solid fa-check"></i> Aplicar importación validada</button>` : ''}
    </section>`;
  },
  mount(_state, { Store, Toast }) {
    document.getElementById('btnDownloadTemplate')?.addEventListener('click', () => {
      const type = document.getElementById('importType')?.value || 'inventory';
      const blob = new Blob([DataImportService.buildTemplateCsv(type)], { type: 'text/csv' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `plantilla-${type}.csv`; a.click(); URL.revokeObjectURL(a.href);
    });
    document.getElementById('importForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const type = document.getElementById('importType').value;
      const file = document.getElementById('importFile').files[0];
      if (!file) return Toast.show('Selecciona un archivo.', 'warning');
      const rows = await DataImportService.parseFile(file, type);
      const preview = DataImportService.validateRows(rows, type);
      Store.set({ importPreview: preview, importType: type });
      Toast.show('Archivo previsualizado. Revisa errores antes de aplicar.', 'info');
    });
    document.getElementById('btnApplyImport')?.addEventListener('click', () => {
      Store.update((draft) => {
        const rows = (draft.importPreview || []).filter((r) => r.ok).map((r) => ({ id: uid('imp'), ...r.row }));
        if (draft.importType === 'inventory') draft.inventory = [...rows, ...(draft.inventory || [])];
        if (draft.importType === 'clients') draft.clients = [...rows, ...(draft.clients || [])];
        if (draft.importType === 'suppliers') draft.suppliers = [...rows, ...(draft.suppliers || [])];
        if (draft.importType === 'accounts') draft.customAccounts = [...rows, ...(draft.customAccounts || [])];
        if (draft.importType === 'payroll') draft.payroll.records = [...rows, ...(draft.payroll.records || [])];
      });
      Toast.show('Data cargada en el módulo correspondiente.', 'success');
    });
  }
};
