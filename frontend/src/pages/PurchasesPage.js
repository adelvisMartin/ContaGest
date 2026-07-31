import { PageHeader, Field, Select, Button, Table, StatCard, Badge } from '../components/ui/index.js';
import { bs, shortDate } from '../core/formatters.js';
import { escapeHtml, mountSubmit, qsa, uid, today } from '../utils/dom.js';
import { RuntimePolicy } from '../services/runtimePolicy.js';

export const PurchasesPage = {
  render(state) {
    const purchases = state.purchases || [];
    const suppliers = state.suppliers || [];
    const subtotal = purchases.reduce((sum, purchase) => sum + Number(purchase.amount || 0), 0);
    const iva = purchases.reduce((sum, purchase) => sum + Number(purchase.iva || 0), 0);
    const supplierOptions = [{ value:'', label:'Proveedor no registrado' }, ...suppliers.map((supplier) => ({ value:supplier.id, label:`${supplier.name} · ${supplier.rif}` }))];
    const rows = purchases.map((purchase) => {
      const supplier = suppliers.find((item) => item.id === purchase.supplierId) || purchase.supplier || {};
      return `<tr><td>${shortDate(purchase.date)}</td><td>${escapeHtml(supplier.name || '-')}</td><td class="cg-cell-strong">${escapeHtml(purchase.reference)}</td><td class="cg-cell-money">${bs(purchase.amount)}</td><td class="cg-cell-money">${bs(purchase.iva)}</td><td class="cg-cell-money">${bs(Number(purchase.amount || 0) + Number(purchase.iva || 0))}</td><td>${purchase.source === 'supabase' ? Badge('Servidor','success') : Badge('Solo desarrollo','warning')}</td><td class="cg-actions-cell"><button class="btn btn-danger !p-2" type="button" data-delete-purchase="${purchase.id}" aria-label="Eliminar compra"><i class="fa-solid fa-trash"></i></button></td></tr>`;
    });
    return `<section class="surface rounded-[1.75rem] p-5 sm:p-7">
      ${PageHeader({ eyebrowKey:'suppliersEyebrow', titleKey:'suppliersTitle', descKey:'suppliersDesc', actions: Button({ id:'btnSyncPurchases', text:'Sincronizar', icon:'fa-cloud-arrow-down', variant:'secondary', attrs:'type="button"' }) })}
      <div class="mb-5 grid gap-4 md:grid-cols-3">${StatCard({label:'Base compras', value:bs(subtotal), icon:'fa-cart-shopping'})}${StatCard({label:'IVA crédito', value:bs(iva), icon:'fa-receipt', tone:'accent'})}${StatCard({label:'Facturas', value:String(purchases.length), icon:'fa-file-invoice'})}</div>
      <form id="purchaseForm" class="panel-soft cg-record-form rounded-[1.5rem] p-4"><div class="cg-record-fields cg-fields-compact">
        ${Field({ labelKey:'date', name:'date', type:'date', value:today() })}${Select({ labelKey:'supplier', name:'supplierId', options:supplierOptions })}${Field({ labelKey:'reference', name:'reference', required:true })}${Field({ labelKey:'amount', name:'amount', type:'number', attrs:'step="0.01" min="0"', value:'0' })}${Field({ labelKey:'taxes', name:'iva', type:'number', attrs:'step="0.01" min="0"', value:'0' })}
      </div><div class="cg-record-actions">${Button({ text:'Registrar compra', icon:'fa-cart-plus', type:'submit' })}</div></form>
      <div class="panel-soft cg-record-table rounded-[1.5rem] p-4">${Table({ headers:[{key:'date'}, {key:'supplier'}, {key:'reference'}, {label:'Base'}, {label:'IVA'}, {label:'Total'}, {label:'Persistencia'}, {key:'actions'}], rows })}</div>
    </section>`;
  },
  mount(state, { Store, Toast, SupabaseSyncService }) {
    document.getElementById('btnSyncPurchases')?.addEventListener('click', () => SupabaseSyncService.pullPurchases({ Store, Toast, force:true, silent:false }));
    mountSubmit('#purchaseForm', async (data, form) => {
      const submit = form.querySelector('button[type="submit"], [data-mui-button-fallback]');
      submit?.setAttribute('disabled', 'disabled');
      try {
        const saved = await SupabaseSyncService.createPurchase(data);
        Store.update((draft) => { draft.purchases = [saved, ...(draft.purchases || []).filter((item) => item.id !== saved.id)]; });
        form.reset();
        Toast.show('Compra guardada y contabilizada en el servidor.', 'success');
      } catch (error) {
        const decision = RuntimePolicy.handlePersistenceFailure(error, 'la compra');
        if (decision.allowFallback) {
          Store.update((draft) => { draft.purchases.unshift({ id:uid('pur'), ...data, amount:Number(data.amount||0), iva:Number(data.iva||0), source:'local' }); });
          Toast.show(`Compra guardada solo para desarrollo. ${decision.message}`, 'warning');
        } else Toast.show(decision.message, 'error');
      } finally { submit?.removeAttribute('disabled'); }
    });
    qsa('[data-delete-purchase]').forEach((button) => button.addEventListener('click', async () => {
      try {
        await SupabaseSyncService.deletePurchase?.(button.dataset.deletePurchase);
        Store.update((draft) => { draft.purchases = draft.purchases.filter((item) => item.id !== button.dataset.deletePurchase); });
        Toast.show('Compra eliminada.', 'success');
      } catch (error) { Toast.show(`No se eliminó la compra: ${error.message}`, 'error'); }
    }));
  }
};
