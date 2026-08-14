import { PageHeader, Field, Button, Badge, MetricGrid, ErpButton, ErpDataTable, ErpSection } from '../components/ui/index.js';
import { usd } from '../core/formatters.js';
import { calculateInventory } from '../core/calculator.js';
import { escapeHtml, mountSubmit, qsa, uid } from '../utils/dom.js';
import { RuntimePolicy } from '../services/runtimePolicy.js';
import { t } from '../i18n/useTranslate.js';

const safe = (value) => escapeHtml(String(value ?? ''));

export const InventoryPage = {
  render(state) {
    const lang = state.settings?.lang || 'es';
    const inventory = state.inventory || [];
    const inv = calculateInventory(inventory);
    const table = ErpDataTable({
      caption:'Inventario y productos',
      columns:[
        { key:'sku', label:'SKU', render:(item)=>safe(item.sku) },
        { key:'name', label:t('product',lang), render:(item)=>safe(item.name) },
        { key:'category', label:t('category',lang), render:(item)=>safe(item.category) },
        { key:'stock', label:t('stock',lang), render:(item)=>`${safe(item.stock)} ${Badge(Number(item.stock || 0) <= Number(item.min || 0) ? 'Bajo' : 'OK', Number(item.stock || 0) <= Number(item.min || 0) ? 'warning' : 'success')}` },
        { key:'reserved', label:t('reserved',lang), render:(item)=>safe(item.reserved) },
        { key:'costUsd', label:t('cost',lang), numeric:true, render:(item)=>safe(usd(item.costUsd)) },
        { key:'priceUsd', label:t('price',lang), numeric:true, render:(item)=>safe(usd(item.priceUsd)) },
        { key:'margin', label:t('margin',lang), numeric:true, render:(item)=>safe(usd(Number(item.priceUsd||0)-Number(item.costUsd||0))) },
        { key:'source', label:t('sync',lang), render:(item)=>item.source === 'supabase' ? Badge(t('synced',lang),'success') : Badge(t('pendingSync',lang),'warning') },
        { key:'actions', label:t('actions',lang), render:(item)=>ErpButton('Agregar producto al presupuesto', { variant:'secondary', icon:'fa-solid fa-plus', iconOnly:true, data:{ 'add-product':item.id } }) }
      ],
      rows:inventory
    });

    const form = `<form id="inventoryForm" class="cg-record-form"><div class="cg-record-fields cg-fields-compact">
      ${Field({ labelKey:'sku', name:'sku', required:true })}${Field({ labelKey:'product', name:'name', required:true })}${Field({ labelKey:'category', name:'category', value:'Inventario' })}
      ${Field({ labelKey:'stock', name:'stock', type:'number', attrs:'min="0" step="1"', value:'0' })}${Field({ labelKey:'reserved', name:'reserved', type:'number', attrs:'min="0" step="1"', value:'0' })}${Field({ labelKey:'minimum', name:'min', type:'number', attrs:'min="0" step="1"', value:'0' })}
      ${Field({ labelKey:'cost', name:'costUsd', type:'number', attrs:'step="0.01" min="0"', value:'0' })}${Field({ labelKey:'price', name:'priceUsd', type:'number', attrs:'step="0.01" min="0"', value:'0' })}
      </div><div class="cg-record-actions">${Button({ text:'Registrar producto', icon:'fa-box-open', type:'submit' })}</div></form>`;

    return `<section class="cg-page-stack cg-inventory-workspace">${PageHeader({
      eyebrowKey:'inventoryEyebrow', titleKey:'inventoryTitle', descKey:'inventoryDesc',
      actions:Button({ id:'btnSyncProducts', text:t('sync',lang), icon:'fa-cloud-arrow-down', variant:'secondary', attrs:'type="button"' })
    })}${MetricGrid([
      { label:'Costo de existencias', value:usd(inv.valueUsd), iconName:'fa-box', tone:'neutral' },
      { label:'Venta potencial', value:usd(inv.retailUsd), iconName:'fa-sack-dollar', tone:'brand' },
      { label:'Margen bruto', value:usd(inv.marginUsd), iconName:'fa-chart-line', tone:'success' },
      { label:'Alertas de stock', value:String(inv.lowStock), iconName:'fa-triangle-exclamation', tone:inv.lowStock?'warning':'success' }
    ])}${ErpSection({ title:'Registrar producto', description:'Define identificación, existencias, costo, precio y mínimo operativo.', content:form })}${ErpSection({ title:'Existencias', description:'Disponibilidad, márgenes, estado de sincronización y acciones.', content:table })}</section>`;
  },
  mount(state, { Store, Toast, navigate, SupabaseSyncService }) {
    document.getElementById('btnSyncProducts')?.addEventListener('click', () => SupabaseSyncService.pullProducts({ Store, Toast, force:true, silent:false }));
    mountSubmit('#inventoryForm', async (data, form) => {
      const submit = form.querySelector('button[type="submit"], [data-mui-button-fallback]');
      submit?.setAttribute('disabled', 'disabled');
      try {
        const saved = await SupabaseSyncService.createProduct(data);
        Store.update((draft) => { draft.inventory = [saved, ...(draft.inventory || []).filter((item) => item.id !== saved.id)]; });
        form.reset();
        Toast.show('Producto guardado.', 'success');
      } catch (error) {
        const decision = RuntimePolicy.handlePersistenceFailure(error, 'el producto');
        if (decision.allowFallback) {
          Store.update((draft) => { draft.inventory.unshift({ id:uid('prd'), ...data, stock:Number(data.stock||0), reserved:Number(data.reserved||0), min:Number(data.min||0), costUsd:Number(data.costUsd||0), priceUsd:Number(data.priceUsd||0), source:'local' }); });
          Toast.show(`Producto guardado localmente; la sincronización está pendiente. ${decision.message}`, 'warning');
        } else Toast.show(decision.message, 'error');
      } finally { submit?.removeAttribute('disabled'); }
    });
    qsa('[data-add-product]').forEach((button) => button.addEventListener('click', () => {
      Store.update((draft) => { const product = draft.inventory.find((item) => item.id === button.dataset.addProduct); if (product) draft.quote.items.push({ id:uid('item'), productId:product.id, name:product.name, qty:1, priceUsd:product.priceUsd }); });
      Toast.show('Producto cargado al presupuesto.', 'success');
      navigate('cotizacion');
    }));
  }
};
