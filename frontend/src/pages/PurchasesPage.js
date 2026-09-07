import { PageHeader, Field, Select, Button, Badge, MetricGrid, ErpButton, ErpDataTable, ErpSection } from '../components/ui/index.js';
import { PayablesPanel } from '../components/payables/PayablesPanel.js';
import { bs, shortDate } from '../core/formatters.js';
import { escapeHtml, mountSubmit, qsa, uid, today } from '../utils/dom.js';
import { RuntimePolicy } from '../services/runtimePolicy.js';
import { PurchaseOperationsService } from '../services/purchaseOperationsService.js';
import { t } from '../i18n/useTranslate.js';

const safe = (value) => escapeHtml(String(value ?? ''));
const statusTone = (status) => status === 'Anulada' ? 'danger' : status === 'Borrador' ? 'warning' : status === 'Cobrada' ? 'success' : 'brand';

export const PurchasesPage = {
  render(state) {
    const lang = state.settings?.lang || 'es';
    const purchases = state.purchases || [];
    const suppliers = state.suppliers || [];
    const activePurchases = purchases.filter((purchase) => purchase.status !== 'Anulada');
    const subtotal = activePurchases.reduce((sum, purchase) => sum + Number(purchase.amount || 0), 0);
    const iva = activePurchases.reduce((sum, purchase) => sum + Number(purchase.iva || 0), 0);
    const supplierOptions = [{ value:'', label:'Proveedor no registrado' }, ...suppliers.map((supplier) => ({ value:supplier.id, label:`${supplier.name} · ${supplier.rif}` }))];

    const table = ErpDataTable({
      caption:'Compras registradas',
      columns:[
        { key:'date', label:t('date',lang), render:(purchase) => safe(shortDate(purchase.date)) },
        { key:'supplier', label:t('supplier',lang), render:(purchase) => { const supplier=suppliers.find((item)=>item.id===purchase.supplierId)||purchase.supplier||{}; return safe(supplier.name||'-'); } },
        { key:'reference', label:t('reference',lang), render:(purchase) => `<strong>${safe(purchase.reference)}</strong>` },
        { key:'amount', label:'Base', numeric:true, render:(purchase) => safe(bs(purchase.amount)) },
        { key:'iva', label:'IVA', numeric:true, render:(purchase) => safe(bs(purchase.iva)) },
        { key:'total', label:'Total', numeric:true, render:(purchase) => safe(bs(Number(purchase.amount||0)+Number(purchase.iva||0))) },
        { key:'status', label:t('status',lang), render:(purchase) => Badge(purchase.status||'Pendiente',statusTone(purchase.status||'Pendiente')) },
        { key:'source', label:t('sync',lang), render:(purchase) => purchase.source==='supabase' ? Badge(t('synced',lang),'success') : Badge(t('pendingSync',lang),'warning') },
        { key:'actions', label:t('actions',lang), render:(purchase) => {
          const status=purchase.status||'Pendiente';
          if(status==='Anulada') return `<span class="cg-ui-muted">Sin acciones</span>`;
          if(status==='Borrador'||purchase.source!=='supabase') return ErpButton('Eliminar borrador',{variant:'danger',icon:'fa-solid fa-trash',iconOnly:true,data:{'delete-purchase':purchase.id}});
          return ErpButton('Anular compra',{variant:'secondary',icon:'fa-solid fa-ban',iconOnly:true,data:{'cancel-purchase':purchase.id}});
        } }
      ],
      rows:purchases
    });

    const form = `<form id="purchaseForm" class="cg-record-form"><div class="cg-record-fields cg-fields-compact">
      ${Field({ labelKey:'date', name:'date', type:'date', value:today() })}${Select({ labelKey:'supplier', name:'supplierId', options:supplierOptions })}${Field({ labelKey:'reference', name:'reference', required:true })}${Field({ labelKey:'amount', name:'amount', type:'number', attrs:'step="0.01" min="0"', value:'0' })}${Field({ labelKey:'taxes', name:'iva', type:'number', attrs:'step="0.01" min="0"', value:'0' })}
      </div><div class="cg-record-actions">${Button({ text:'Registrar compra', icon:'fa-cart-plus', type:'submit' })}</div></form>`;

    return `<section class="cg-page-stack">${PageHeader({
      eyebrowKey:'purchasesEyebrow', titleKey:'purchasesTitle', descKey:'purchasesDesc',
      actions:Button({ id:'btnSyncPurchases', text:t('sync',lang), icon:'fa-cloud-arrow-down', variant:'secondary', attrs:'type="button"' })
    })}${MetricGrid([
      {label:'Base vigente',value:bs(subtotal),iconName:'fa-cart-shopping',tone:'neutral'},
      {label:'IVA crédito',value:bs(iva),iconName:'fa-receipt',tone:'brand'},
      {label:'Facturas',value:String(purchases.length),hint:`${purchases.filter((item)=>item.status==='Anulada').length} anuladas`,iconName:'fa-file-invoice',tone:'neutral'},
      {label:'Total vigente',value:bs(subtotal+iva),iconName:'fa-sack-dollar',tone:'success'}
    ])}${PayablesPanel.render(state)}${ErpSection({title:'Registrar compra',description:'Proveedor, referencia y montos que alimentan compras y contabilidad.',content:form})}${ErpSection({title:'Compras registradas',description:'Estado, sincronización y acciones de reverso o borrador.',content:table})}</section>`;
  },

  mount(state, { Store, Toast, SupabaseSyncService }) {
    PayablesPanel.mount(state,{Store,Toast,SupabaseSyncService});
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
          Store.update((draft) => { draft.purchases.unshift({ id:uid('pur'), ...data, amount:Number(data.amount||0), iva:Number(data.iva||0), status:'Borrador', source:'local' }); });
          Toast.show(`Compra guardada localmente; la sincronización está pendiente. ${decision.message}`, 'warning');
        } else Toast.show(decision.message, 'error');
      } finally { submit?.removeAttribute('disabled'); }
    });

    qsa('[data-delete-purchase]').forEach((button) => button.addEventListener('click', async () => {
      const id = button.dataset.deletePurchase;
      const purchase = (Store.get().purchases || []).find((item) => item.id === id);
      if (!window.confirm(`¿Eliminar el borrador ${purchase?.reference || ''}? Esta acción no se puede deshacer.`)) return;
      button.setAttribute('disabled','disabled');
      try {
        if (purchase?.source === 'supabase') await PurchaseOperationsService.deleteDraft(id);
        Store.update((draft) => { draft.purchases = (draft.purchases || []).filter((item) => item.id !== id); });
        Toast.show('Borrador de compra eliminado.', 'success');
      } catch (error) { Toast.show(`No se eliminó la compra: ${error.message}`, 'error'); }
      finally { button.removeAttribute('disabled'); }
    }));

    qsa('[data-cancel-purchase]').forEach((button) => button.addEventListener('click', async () => {
      const id = button.dataset.cancelPurchase;
      const purchase = (Store.get().purchases || []).find((item) => item.id === id);
      if (!window.confirm(`¿Anular la compra ${purchase?.reference || ''}? Se generará un reverso contable y el documento conservará su trazabilidad.`)) return;
      button.setAttribute('disabled','disabled');
      try {
        const result = await PurchaseOperationsService.cancel(id);
        Store.update((draft) => { draft.purchases = (draft.purchases || []).map((item) => item.id === id ? result.purchase : item); });
        Toast.show(result.accountingWarning ? `Compra anulada. ${result.accountingWarning}` : 'Compra anulada y asiento contable revertido.', result.accountingWarning ? 'warning' : 'success');
      } catch (error) { Toast.show(`No se anuló la compra: ${error.message}`, 'error'); }
      finally { button.removeAttribute('disabled'); }
    }));
  }
};
