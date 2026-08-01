import { PageHeader, Field, Textarea, Button, Table, Badge } from '../components/ui/index.js';
import { escapeHtml, mountSubmit, qsa, uid } from '../utils/dom.js';
import { RuntimePolicy } from '../services/runtimePolicy.js';

export const SuppliersPage = {
  render(state) {
    const suppliers = state.suppliers || [];
    const rows = suppliers.map((supplier) => `<tr>
      <td>${escapeHtml(supplier.name)}</td><td>${escapeHtml(supplier.rif)}</td><td>${escapeHtml(supplier.email)}</td><td>${escapeHtml(supplier.phone)}</td><td>${escapeHtml(supplier.category)}</td>
      <td>${supplier.source === 'supabase' ? Badge('Servidor','success') : Badge('Solo desarrollo','warning')}</td>
      <td class="cg-actions-cell"><button class="btn btn-danger !p-2" type="button" data-delete-supplier="${supplier.id}" aria-label="Eliminar proveedor"><i class="fa-solid fa-trash"></i></button></td>
    </tr>`);
    return `<section class="surface rounded-[1.75rem] p-5 sm:p-7">
      ${PageHeader({ eyebrowKey:'suppliersEyebrow', titleKey:'suppliersTitle', descKey:'suppliersDesc', actions: Button({ text:'Registrar compra', icon:'fa-cart-shopping', variant:'accent', attrs:'type="button" data-route="compras"' }) + Button({ id:'btnSyncSuppliers', text:'Sincronizar', icon:'fa-cloud-arrow-down', variant:'secondary', attrs:'type="button"' }) })}
      <form id="supplierForm" class="panel-soft cg-record-form rounded-[1.5rem] p-4"><div class="cg-record-fields cg-fields-compact">
        ${Field({ labelKey:'name', name:'name', required:true })}${Field({ labelKey:'rif', name:'rif', required:true })}${Field({ labelKey:'email', name:'email', type:'email' })}${Field({ labelKey:'phone', name:'phone' })}${Field({ labelKey:'category', name:'category', value:'Insumos' })}${Textarea({ labelKey:'address', name:'address', className:'cg-field-wide' })}
      </div><div class="cg-record-actions">${Button({ text:'Registrar proveedor', icon:'fa-truck', type:'submit' })}</div></form>
      <div class="panel-soft cg-record-table rounded-[1.5rem] p-4">${Table({ headers:[{key:'name'}, {key:'rif'}, {key:'email'}, {key:'phone'}, {key:'category'}, {label:'Persistencia'}, {key:'actions'}], rows })}</div>
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
        Toast.show('Proveedor guardado en el servidor.', 'success');
      } catch (error) {
        const decision = RuntimePolicy.handlePersistenceFailure(error, 'el proveedor');
        if (decision.allowFallback) {
          Store.update((draft) => { draft.suppliers.unshift({ id:uid('sup'), ...data, source:'local' }); });
          Toast.show(`Proveedor guardado solo para desarrollo. ${decision.message}`, 'warning');
        } else Toast.show(decision.message, 'error');
      } finally { submit?.removeAttribute('disabled'); }
    });
    qsa('[data-delete-supplier]').forEach((button) => button.addEventListener('click', async () => {
      try {
        await SupabaseSyncService.deleteSupplier(button.dataset.deleteSupplier);
        Store.update((draft) => { draft.suppliers = draft.suppliers.filter((item) => item.id !== button.dataset.deleteSupplier); });
        Toast.show('Proveedor eliminado del servidor.', 'success');
      } catch (error) { Toast.show(`No se eliminó el proveedor: ${error.message}`, 'error'); }
    }));
  }
};
