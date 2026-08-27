import { PageHeader, Field, Button, Badge, MetricGrid, ErpButton, ErpDataTable, ErpSection, Select } from '../components/ui/index.js';
import { usd } from '../core/formatters.js';
import { calculateInventory } from '../core/calculator.js';
import { escapeHtml, mountSubmit, qsa, uid } from '../utils/dom.js';
import { RuntimePolicy } from '../services/runtimePolicy.js';
import { InventoryService } from '../services/inventoryService.js';
import { t } from '../i18n/useTranslate.js';

const safe = (value) => escapeHtml(String(value ?? ''));

export const InventoryPage = {
  render(state) {
    const lang = state.settings?.lang || 'es';
    const inventory = state.inventory || [];
    const movements = (state.inventoryMovements || []).slice().reverse().slice(0, 20);
    const inv = calculateInventory(inventory);
    const productOptions = inventory.map((item)=>({ value:item.id, label:`${item.sku} · ${item.name}` }));
    const table = ErpDataTable({
      caption:'Inventario y productos',
      columns:[
        { key:'sku', label:'SKU', render:(item)=>safe(item.sku) },
        { key:'name', label:t('product',lang), render:(item)=>safe(item.name) },
        { key:'category', label:t('category',lang), render:(item)=>safe(item.category) },
        { key:'stock', label:t('stock',lang), render:(item)=>`${safe(item.stock)} ${Badge(Number(item.stock || 0) <= Number(item.min || 0) ? 'Bajo' : 'OK', Number(item.stock || 0) <= Number(item.min || 0) ? 'warning' : 'success')}` },
        { key:'reserved', label:t('reserved',lang), render:(item)=>safe(item.reserved) },
        { key:'available', label:'Disponible', render:(item)=>safe(Number(item.stock||0)-Number(item.reserved||0)) },
        { key:'costUsd', label:t('cost',lang), numeric:true, render:(item)=>safe(usd(item.costUsd)) },
        { key:'priceUsd', label:t('price',lang), numeric:true, render:(item)=>safe(usd(item.priceUsd)) },
        { key:'margin', label:t('margin',lang), numeric:true, render:(item)=>safe(usd(Number(item.priceUsd||0)-Number(item.costUsd||0))) },
        { key:'actions', label:t('actions',lang), render:(item)=>ErpButton('Agregar producto al presupuesto', { variant:'secondary', icon:'fa-solid fa-plus', iconOnly:true, data:{ 'add-product':item.id } }) }
      ],
      rows:inventory
    });

    const movementTable = ErpDataTable({
      caption:'Movimientos de inventario recientes',
      columns:[
        {key:'at',label:'Fecha',render:(row)=>safe(String(row.createdAt||row.at||'').replace('T',' ').slice(0,19))},
        {key:'product',label:'Producto',render:(row)=>safe(inventory.find((item)=>item.id===row.productId)?.sku||row.productId)},
        {key:'type',label:'Tipo',render:(row)=>Badge(safe(row.type),row.type==='in'?'success':row.type==='out'?'warning':'neutral')},
        {key:'qty',label:'Cantidad',numeric:true,render:(row)=>safe(row.quantityExact??row.qty??row.quantity)},
        {key:'reason',label:'Motivo',render:(row)=>safe(row.reason||row.note||row.reasonCode||'—')},
        {key:'actions',label:'Acciones',render:(row)=>row.reversedById?Badge('Reversado','neutral'):ErpButton('Reversar movimiento',{variant:'secondary',icon:'fa-solid fa-rotate-left',iconOnly:true,data:{'reverse-movement':row.id}})}
      ],rows:movements
    });

    const form = `<form id="inventoryForm" class="cg-record-form"><div class="cg-record-fields cg-fields-compact">
      ${Field({ labelKey:'sku', name:'sku', required:true })}${Field({ labelKey:'product', name:'name', required:true })}${Field({ labelKey:'category', name:'category', value:'Inventario' })}
      ${Field({ labelKey:'minimum', name:'min', type:'number', attrs:'min="0" step="0.001"', value:'0' })}
      ${Field({ labelKey:'cost', name:'costUsd', type:'number', attrs:'step="0.01" min="0"', value:'0' })}${Field({ labelKey:'price', name:'priceUsd', type:'number', attrs:'step="0.01" min="0"', value:'0' })}
      </div><div class="cg-record-actions">${Button({ text:'Registrar producto', icon:'fa-box-open', type:'submit' })}</div></form>`;

    const movementForm = `<form id="inventoryMovementForm" class="cg-record-form"><div class="cg-record-fields cg-fields-compact">
      ${Select({labelKey:'Producto',name:'productId',options:productOptions})}
      ${Select({labelKey:'Tipo',name:'type',options:[{value:'in',label:'Entrada'},{value:'out',label:'Salida'},{value:'reservation',label:'Reserva'},{value:'release',label:'Liberación'}]})}
      ${Field({labelKey:'Cantidad',name:'quantity',type:'number',required:true,attrs:'min="0.001" step="0.001"'})}
      ${Field({labelKey:'Costo unitario',name:'unitCost',type:'number',attrs:'min="0" step="0.01"'})}
      ${Select({labelKey:'Origen',name:'source',options:[{value:'manual',label:'Movimiento manual'},{value:'opening',label:'Saldo de apertura'}]})}
      ${Field({labelKey:'Código de motivo',name:'reasonCode',value:'MANUAL'})}
      ${Field({labelKey:'Nota',name:'note'})}
      </div><div class="cg-record-actions">${Button({text:'Registrar movimiento',icon:'fa-right-left',type:'submit'})}</div></form>`;

    const adjustmentForm = `<form id="inventoryAdjustmentForm" class="cg-record-form"><div class="cg-record-fields cg-fields-compact">
      ${Select({labelKey:'Producto',name:'productId',options:productOptions})}
      ${Field({labelKey:'Stock físico contado',name:'targetStock',type:'number',required:true,attrs:'min="0" step="0.001"'})}
      ${Field({labelKey:'Código de motivo',name:'reasonCode',required:true,value:'PHYSICAL_COUNT'})}
      ${Field({labelKey:'Motivo / evidencia',name:'note',required:true})}
      </div><div class="cg-record-actions">${Button({text:'Ajustar inventario',icon:'fa-scale-balanced',type:'submit',variant:'secondary'})}</div></form>`;

    return `<section class="cg-page-stack cg-inventory-workspace">${PageHeader({
      eyebrowKey:'inventoryEyebrow', titleKey:'inventoryTitle', descKey:'inventoryDesc',
      actions:Button({ id:'btnSyncProducts', text:t('sync',lang), icon:'fa-cloud-arrow-down', variant:'secondary', attrs:'type="button"' })
    })}${MetricGrid([
      { label:'Costo de existencias', value:usd(inv.valueUsd), iconName:'fa-box', tone:'neutral' },
      { label:'Venta potencial', value:usd(inv.retailUsd), iconName:'fa-sack-dollar', tone:'brand' },
      { label:'Margen bruto', value:usd(inv.marginUsd), iconName:'fa-chart-line', tone:'success' },
      { label:'Alertas de stock', value:String(inv.lowStock), iconName:'fa-triangle-exclamation', tone:inv.lowStock?'warning':'success' }
    ])}${ErpSection({ title:'Producto maestro', description:'SKU, descripción, costos y mínimos. Stock y reservas son de solo lectura y sólo cambian mediante movimientos.', content:form })}${ErpSection({title:'Registrar movimiento',description:'Entrada, salida, reserva, liberación o saldo de apertura. El servidor valida disponibilidad e idempotencia.',content:movementForm})}${ErpSection({title:'Ajuste físico autorizado',description:'El ajuste requiere permiso específico, código de motivo y evidencia; nunca reescribe el Kardex.',content:adjustmentForm})}${ErpSection({ title:'Existencias', description:'Saldos materializados derivados de movimientos auditables.', content:table })}${ErpSection({title:'Historial reciente',description:'Los movimientos no se eliminan. Los errores se corrigen mediante reversos explícitos.',content:movementTable})}</section>`;
  },
  mount(state, { Store, Toast, navigate, SupabaseSyncService }) {
    const refresh=()=>SupabaseSyncService.pullProducts({ Store, Toast, force:true, silent:false });
    document.getElementById('btnSyncProducts')?.addEventListener('click', refresh);
    mountSubmit('#inventoryForm', async (data, form) => {
      const submit = form.querySelector('button[type="submit"], [data-mui-button-fallback]');
      submit?.setAttribute('disabled', 'disabled');
      try {
        const saved = await SupabaseSyncService.createProduct(data);
        Store.update((draft) => { draft.inventory = [saved, ...(draft.inventory || []).filter((item) => item.id !== saved.id)]; });
        form.reset();
        Toast.show('Producto maestro guardado. Registra el saldo inicial como movimiento.', 'success');
      } catch (error) {
        const decision = RuntimePolicy.handlePersistenceFailure(error, 'el producto');
        if (decision.allowFallback) {
          Store.update((draft) => { draft.inventory.unshift({ id:uid('prd'), ...data, stock:0, reserved:0, min:Number(data.min||0), costUsd:Number(data.costUsd||0), priceUsd:Number(data.priceUsd||0), source:'local' }); });
          Toast.show(`Producto maestro guardado localmente sin saldo; sincronización pendiente. ${decision.message}`, 'warning');
        } else Toast.show(decision.message, 'error');
      } finally { submit?.removeAttribute('disabled'); }
    });
    mountSubmit('#inventoryMovementForm',async(data,form)=>{
      if(!data.productId)return Toast.show('Selecciona un producto.','error');
      try{await InventoryService.createMovement(data);form.reset();Toast.show('Movimiento aplicado y auditado.','success');await refresh();}catch(error){Toast.show(`No se aplicó el movimiento: ${error.message}`,'error');}
    });
    mountSubmit('#inventoryAdjustmentForm',async(data,form)=>{
      if(!data.productId)return Toast.show('Selecciona un producto.','error');
      try{await InventoryService.adjust(data);form.reset();Toast.show('Ajuste físico registrado con motivo.','success');await refresh();}catch(error){Toast.show(`No se aplicó el ajuste: ${error.message}`,'error');}
    });
    qsa('[data-reverse-movement]').forEach((button)=>button.addEventListener('click',async()=>{
      const reason=window.prompt('Motivo del reverso (obligatorio):','Corrección de movimiento registrado por error');
      if(!reason)return;
      try{await InventoryService.reverse(button.dataset.reverseMovement,reason);Toast.show('Reverso creado; el movimiento original se conserva.','success');await refresh();}catch(error){Toast.show(`No se creó el reverso: ${error.message}`,'error');}
    }));
    qsa('[data-add-product]').forEach((button) => button.addEventListener('click', () => {
      Store.update((draft) => { const product = draft.inventory.find((item) => item.id === button.dataset.addProduct); if (product) draft.quote.items.push({ id:uid('item'), productId:product.id, name:product.name, qty:1, priceUsd:product.priceUsd }); });
      Toast.show('Producto cargado al presupuesto.', 'success');
      navigate('cotizacion');
    }));
  }
};