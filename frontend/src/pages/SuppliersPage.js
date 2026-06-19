import { PageHeader, Field, Textarea, Button, Table, Badge } from '../components/ui/index.js';
import { escapeHtml, mountSubmit, qsa, uid } from '../utils/dom.js';

export const SuppliersPage = {
  render(state) {
    const rows = state.suppliers.map((s) => `<tr>
      <td>${escapeHtml(s.name)}</td>
      <td>${escapeHtml(s.rif)}</td>
      <td>${escapeHtml(s.email)}</td>
      <td>${escapeHtml(s.phone)}</td>
      <td>${escapeHtml(s.category)}</td>
      <td>${s.source === 'supabase' ? Badge('Supabase','success') : Badge('Local','warning')}</td>
      <td class="cg-actions-cell"><div class="cg-row-actions"><button class="btn btn-danger !p-2" type="button" data-delete-supplier="${s.id}" aria-label="Eliminar proveedor"><i class="fa-solid fa-trash"></i></button></div></td>
    </tr>`);
    return `<section class="surface rounded-[1.75rem] p-5 sm:p-7">
      ${PageHeader({
        eyebrowKey:'suppliersEyebrow',
        titleKey:'suppliersTitle',
        descKey:'suppliersDesc',
        actions: Button({ text:'Registrar compra', icon:'fa-cart-shopping', variant:'accent', attrs:'type="button" data-route="compras"' }) + Button({ id:'btnSyncSuppliers', text:'Sincronizar Supabase', icon:'fa-cloud-arrow-down', variant:'secondary', attrs:'type="button"' })
      })}

      <form id="supplierForm" class="panel-soft cg-record-form rounded-[1.5rem] p-4">
        <div class="cg-record-fields cg-fields-compact">
          ${Field({ labelKey:'name', name:'name', required:true })}
          ${Field({ labelKey:'rif', name:'rif', required:true })}
          ${Field({ labelKey:'email', name:'email' })}
          ${Field({ labelKey:'phone', name:'phone' })}
          ${Field({ labelKey:'category', name:'category', value:'Insumos' })}
          ${Textarea({ labelKey:'address', name:'address', className:'cg-field-wide' })}
        </div>
        <div class="cg-record-actions">${Button({ text:'Agregar proveedor', i18n:'add', icon:'fa-truck', type:'submit' })}</div>
      </form>

      <div class="panel-soft cg-record-table rounded-[1.5rem] p-4">
        ${Table({ headers:[{key:'name'}, {key:'rif'}, {key:'email'}, {key:'phone'}, {key:'category'}, {label:'Origen'}, {key:'actions'}], rows })}
      </div>
    </section>`;
  },
  mount(state, { Store, Toast, SupabaseSyncService }) {
    document.getElementById('btnSyncSuppliers')?.addEventListener('click', () => SupabaseSyncService.pullSuppliers({ Store, Toast, force:true, silent:false }));
    mountSubmit('#supplierForm', async (data, form) => {
      const submit = form.querySelector('button[type="submit"], [data-mui-button-fallback]');
      submit?.setAttribute('disabled', 'disabled');
      try {
        const saved = await SupabaseSyncService.createSupplier(data);
        Store.update((draft) => { draft.suppliers = [saved, ...(draft.suppliers || []).filter((item) => item.id !== saved.id)]; });
        form.reset();
        Toast.show('Proveedor guardado en Supabase.', 'success');
      } catch (error) {
        Store.update((draft) => { draft.suppliers.unshift({ id:uid('sup'), ...data, source:'local' }); });
        Toast.show(`Proveedor guardado localmente. Backend: ${error.message}`, 'warning');
      } finally {
        submit?.removeAttribute('disabled');
      }
    });
    qsa('[data-delete-supplier]').forEach((button) => button.addEventListener('click', async () => {
      try { await SupabaseSyncService.deleteSupplier(button.dataset.deleteSupplier); Toast.show('Proveedor eliminado de Supabase.', 'success'); }
      catch (error) { Toast.show(`No se eliminó en backend: ${error.message}`, 'warning'); }
      Store.update((draft) => { draft.suppliers = draft.suppliers.filter((item) => item.id !== button.dataset.deleteSupplier); });
    }));
  }
};
