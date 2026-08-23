import { PageHeader, Field, Textarea, Button, Badge, ErpButton, ErpDataTable, ErpSection } from '../components/ui/index.js';
import { escapeHtml, mountSubmit, qsa, uid } from '../utils/dom.js';
import { isValidRif } from '../core/validators.js';
import { RuntimePolicy } from '../services/runtimePolicy.js';

const safe = (value) => escapeHtml(String(value ?? ''));

export const SuppliersPage = {
  render(state) {
    const suppliers = state.suppliers || [];
    const table = ErpDataTable({
      caption:'Directorio de proveedores',
      columns:[
        { key:'name', label:'Nombre', render:(supplier) => safe(supplier.name) },
        { key:'rif', label:'RIF', render:(supplier) => `<span class="cg-inline-pair"><span class="cg-ui-code">${safe(supplier.rif)}</span>${isValidRif(supplier.rif) ? Badge('OK','success') : Badge('Revisar','warning')}</span>` },
        { key:'email', label:'Email', render:(supplier) => safe(supplier.email) },
        { key:'phone', label:'Teléfono', render:(supplier) => safe(supplier.phone) },
        { key:'category', label:'Categoría', render:(supplier) => safe(supplier.category) },
        { key:'source', label:'Persistencia', render:(supplier) => supplier.source === 'supabase' ? Badge('Servidor','success') : Badge('Solo desarrollo','warning') },
        { key:'actions', label:'Acciones', render:(supplier) => ErpButton('Eliminar proveedor', { variant:'danger', icon:'fa-solid fa-trash', iconOnly:true, data:{ 'delete-supplier':supplier.id } }) }
      ],
      rows:suppliers
    });

    const form = `<form id="supplierForm" class="cg-record-form"><div class="cg-record-fields cg-fields-compact">
      ${Field({ labelKey:'name', name:'name', required:true })}${Field({ labelKey:'rif', name:'rif', required:true })}${Field({ labelKey:'email', name:'email', type:'email' })}${Field({ labelKey:'phone', name:'phone' })}${Field({ labelKey:'category', name:'category', value:'Insumos' })}${Textarea({ labelKey:'address', name:'address', className:'cg-field-wide' })}
      </div><div class="cg-record-actions">${Button({ text:'Registrar proveedor', icon:'fa-truck', type:'submit' })}</div></form>`;

    return `<section class="cg-page-stack">${PageHeader({
      eyebrowKey:'suppliersEyebrow',
      titleKey:'suppliersTitle',
      descKey:'suppliersDesc',
      actions:Button({ text:'Registrar compra', icon:'fa-cart-shopping', variant:'accent', attrs:'type="button" data-route="compras"' })
        + Button({ id:'btnSyncSuppliers', text:'Sincronizar', icon:'fa-cloud-arrow-down', variant:'secondary', attrs:'type="button"' })
    })}${ErpSection({ title:'Registrar proveedor', description:'Información operativa, fiscal y de contacto para compras y abastecimiento.', content:form })}${ErpSection({ title:'Directorio de proveedores', description:'Persistencia, validación fiscal y acciones operativas.', content:table })}</section>`;
  },
  mount(state, { Store, Toast, Modal, SupabaseSyncService }) {
    document.getElementById('btnSyncSuppliers')?.addEventListener('click', () => SupabaseSyncService.pullSuppliers({ Store, Toast, force:true, silent:false }));
    mountSubmit('#supplierForm', async (data, form) => {
      const submit = form.querySelector('button[type="submit"], [data-mui-button-fallback]');
      submit?.setAttribute('disabled', 'disabled');
      try {
        if (!isValidRif(data.rif)) throw new Error('El RIF no tiene un formato válido.');
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
    qsa('[data-delete-supplier]').forEach((button) => button.addEventListener('click', () => {
      const supplier = Store.get().suppliers?.find((item) => item.id === button.dataset.deleteSupplier);
      Modal.confirm({
        title:'Eliminar proveedor',
        body:`Confirma la eliminación de ${supplier?.name || 'este proveedor'}. Las compras históricas deben conservar sus referencias contables y fiscales.`,
        confirmText:'Eliminar proveedor',
        onConfirm: async () => {
          try {
            await SupabaseSyncService.deleteSupplier(button.dataset.deleteSupplier);
            Store.update((draft) => { draft.suppliers = draft.suppliers.filter((item) => item.id !== button.dataset.deleteSupplier); });
            Toast.show('Proveedor eliminado del servidor.', 'success');
          } catch (error) { Toast.show(`No se eliminó el proveedor: ${error.message}`, 'error'); }
        }
      });
    }));
  }
};
