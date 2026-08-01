import { PageHeader, Field, Button, Table, Badge, StatCard } from '../components/ui/index.js';
import { usd } from '../core/formatters.js';
import { calculateInventory } from '../core/calculator.js';
import { escapeHtml, mountSubmit, qsa, uid } from '../utils/dom.js';
import { RuntimePolicy } from '../services/runtimePolicy.js';

export const InventoryPage = {
  render(state) {
    const inventory = state.inventory || [];
    const inv = calculateInventory(inventory);
    const rows = inventory.map((item) => {
      const margin = Number(item.priceUsd || 0) - Number(item.costUsd || 0);
      const tone = Number(item.stock || 0) <= Number(item.min || 0) ? 'warning' : 'success';
      return `<tr>
        <td class="cg-cell-strong">${escapeHtml(item.sku)}</td><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.category)}</td>
        <td>${item.stock} ${Badge(Number(item.stock || 0) <= Number(item.min || 0) ? 'Bajo' : 'OK', tone)}</td>
        <td>${item.reserved}</td><td class="cg-cell-money">${usd(item.costUsd)}</td><td class="cg-cell-money">${usd(item.priceUsd)}</td>
        <td class="cg-cell-money">${usd(margin)}</td><td>${item.source === 'supabase' ? Badge('Servidor','success') : Badge('Solo desarrollo','warning')}</td>
        <td class="cg-actions-cell"><div class="cg-row-actions"><button class="btn btn-secondary !p-2" type="button" data-add-product="${item.id}" aria-label="Agregar producto al presupuesto"><i class="fa-solid fa-plus"></i></button></div></td>
      </tr>`;
    });
    return `<section class="surface rounded-[1.75rem] p-5 sm:p-7">
      ${PageHeader({ eyebrowKey:'inventoryEyebrow', titleKey:'inventoryTitle', descKey:'inventoryDesc', actions: Button({ id:'btnSyncProducts', text:'Sincronizar', icon:'fa-cloud-arrow-down', variant:'secondary', attrs:'type="button"' }) })}
      <div class="mb-5 grid gap-4 md:grid-cols-4">
        ${StatCard({label:'Costo stock', value:usd(inv.valueUsd), icon:'fa-box'})}${StatCard({label:'Venta potencial', value:usd(inv.retailUsd), icon:'fa-sack-dollar', tone:'accent'})}${StatCard({label:'Margen bruto', value:usd(inv.marginUsd), icon:'fa-chart-line'})}${StatCard({label:'Bajo stock', value:String(inv.lowStock), icon:'fa-triangle-exclamation', tone:'accent'})}
      </div>
      <form id="inventoryForm" class="panel-soft cg-record-form rounded-[1.5rem] p-4">
        <div class="cg-record-fields cg-fields-compact">
          ${Field({ labelKey:'sku', name:'sku', required:true })}${Field({ labelKey:'product', name:'name', required:true })}${Field({ labelKey:'category', name:'category', value:'Inventario' })}
          ${Field({ labelKey:'stock', name:'stock', type:'number', attrs:'min="0" step="1"', value:'0' })}${Field({ labelKey:'reserved', name:'reserved', type:'number', attrs:'min="0" step="1"', value:'0' })}${Field({ labelKey:'minimum', name:'min', type:'number', attrs:'min="0" step="1"', value:'0' })}
          ${Field({ labelKey:'cost', name:'costUsd', type:'number', attrs:'step="0.01" min="0"', value:'0' })}${Field({ labelKey:'price', name:'priceUsd', type:'number', attrs:'step="0.01" min="0"', value:'0' })}
        </div>
        <div class="cg-record-actions">${Button({ text:'Registrar producto', icon:'fa-box-open', type:'submit' })}</div>
      </form>
      <div class="panel-soft cg-record-table rounded-[1.5rem] p-4">${Table({ headers:[{key:'sku'}, {key:'product'}, {key:'category'}, {key:'stock'}, {key:'reserved'}, {key:'cost'}, {key:'price'}, {key:'margin'}, {label:'Persistencia'}, {key:'actions'}], rows })}</div>
    </section>`;
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
        Toast.show('Producto guardado en el servidor.', 'success');
      } catch (error) {
        const decision = RuntimePolicy.handlePersistenceFailure(error, 'el producto');
        if (decision.allowFallback) {
          Store.update((draft) => { draft.inventory.unshift({ id:uid('prd'), ...data, stock:Number(data.stock||0), reserved:Number(data.reserved||0), min:Number(data.min||0), costUsd:Number(data.costUsd||0), priceUsd:Number(data.priceUsd||0), source:'local' }); });
          Toast.show(`Producto guardado solo para desarrollo. ${decision.message}`, 'warning');
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
