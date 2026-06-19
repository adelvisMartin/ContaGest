import { PageHeader, Field, Select, Button, Table, StatCard, Badge } from '../components/ui/index.js';
import { bs, shortDate } from '../core/formatters.js';
import { escapeHtml, mountSubmit, qsa, uid, today } from '../utils/dom.js';

export const PurchasesPage = {
  render(state) {
    const subtotal = state.purchases.reduce((s, p) => s + Number(p.amount || 0), 0);
    const iva = state.purchases.reduce((s, p) => s + Number(p.iva || 0), 0);
    const supplierOptions = [{ value:'', label:'Proveedor no registrado' }, ...state.suppliers.map((s) => ({ value:s.id, label:`${s.name} · ${s.rif}` }))];
    const rows = state.purchases.map((p) => {
      const supplier = state.suppliers.find((s) => s.id === p.supplierId) || p.supplier || {};
      return `<tr>
        <td>${shortDate(p.date)}</td>
        <td>${escapeHtml(supplier.name || '-')}</td>
        <td class="cg-cell-strong">${escapeHtml(p.reference)}</td>
        <td class="cg-cell-money">${bs(p.amount)}</td>
        <td class="cg-cell-money">${bs(p.iva)}</td>
        <td class="cg-cell-money">${bs(Number(p.amount || 0) + Number(p.iva || 0))}</td>
        <td>${p.source === 'supabase' ? Badge('Supabase','success') : Badge('Local','warning')}</td>
        <td class="cg-actions-cell"><div class="cg-row-actions"><button class="btn btn-danger !p-2" type="button" data-delete-purchase="${p.id}" aria-label="Eliminar compra"><i class="fa-solid fa-trash"></i></button></div></td>
      </tr>`;
    });

    return `<section class="surface rounded-[1.75rem] p-5 sm:p-7">
      ${PageHeader({ eyebrowKey:'suppliersEyebrow', titleKey:'suppliersTitle', descKey:'suppliersDesc', actions: Button({ id:'btnSyncPurchases', text:'Sincronizar Supabase', icon:'fa-cloud-arrow-down', variant:'secondary', attrs:'type="button"' }) })}
      <div class="mb-5 grid gap-4 md:grid-cols-3">
        ${StatCard({label:'Base compras', value:bs(subtotal), icon:'fa-cart-shopping'})}
        ${StatCard({label:'IVA crédito', value:bs(iva), icon:'fa-receipt', tone:'accent'})}
        ${StatCard({label:'Facturas', value:String(state.purchases.length), icon:'fa-file-invoice'})}
      </div>

      <form id="purchaseForm" class="panel-soft cg-record-form rounded-[1.5rem] p-4">
        <div class="cg-record-fields cg-fields-compact">
          ${Field({ labelKey:'date', name:'date', type:'date', value:today() })}
          ${Select({ labelKey:'supplier', name:'supplierId', options:supplierOptions })}
          ${Field({ labelKey:'reference', name:'reference', required:true })}
          ${Field({ labelKey:'amount', name:'amount', type:'number', attrs:'step="0.01"', value:'0' })}
          ${Field({ labelKey:'taxes', name:'iva', type:'number', attrs:'step="0.01"', value:'0' })}
        </div>
        <div class="cg-record-actions">${Button({ text:'Agregar compra', i18n:'add', icon:'fa-cart-plus', type:'submit' })}</div>
      </form>

      <div class="panel-soft cg-record-table rounded-[1.5rem] p-4">
        ${Table({ headers:[{key:'date'}, {key:'supplier'}, {key:'reference'}, {label:'Base'}, {label:'IVA'}, {label:'Total'}, {label:'Origen'}, {key:'actions'}], rows })}
      </div>
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
        Toast.show('Compra guardada en Supabase y asiento generado.', 'success');
      } catch (error) {
        Store.update((draft) => { draft.purchases.unshift({ id:uid('pur'), ...data, amount:Number(data.amount||0), iva:Number(data.iva||0), source:'local' }); });
        Toast.show(`Compra guardada localmente. Backend: ${error.message}`, 'warning');
      } finally {
        submit?.removeAttribute('disabled');
      }
    });
    qsa('[data-delete-purchase]').forEach((button) => button.addEventListener('click', () => Store.update((draft) => { draft.purchases = draft.purchases.filter((item) => item.id !== button.dataset.deletePurchase); })));
  }
};
