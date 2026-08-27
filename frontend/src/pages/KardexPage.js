import { PageHeader, Badge, EmptyState, ErpDataTable, ErpSection, Select } from '../components/ui/index.js';
import { buildKardex } from '../core/businessRules.js';
import { dateTime, usd } from '../core/formatters.js';
import { escapeHtml } from '../utils/dom.js';

const safe=(value)=>escapeHtml(String(value??''));

export const KardexPage = {
  render(state,{query={}}={}) {
    const products=state.inventory||[];
    if(!products.length) return `<section class="cg-page-stack">${PageHeader({eyebrowKey:'kardexEyebrow',titleKey:'kardexTitle',descKey:'kardexDesc'})}${EmptyState({title:'Sin productos',description:'Registra inventario para habilitar el kardex.',iconName:'fa-boxes-stacked'})}</section>`;
    const selectedKey=String(query.product||products[0]?.id||products[0]?.sku||'');
    const product=products.find((item)=>String(item.id||item.sku)===selectedKey)||products[0];
    const movements=(state.inventoryMovements||[]).filter((movement)=>{
      if(movement.productId&&product.id)return String(movement.productId)===String(product.id);
      if(movement.sku&&product.sku)return String(movement.sku)===String(product.sku);
      return false;
    });
    const rows=buildKardex({product,movements});
    const table=ErpDataTable({
      caption:`Kardex ${product.sku||product.name||''}`,
      columns:[
        {key:'at',label:'Fecha',render:(row)=>safe(dateTime(row.at||row.createdAt))},
        {key:'type',label:'Tipo',render:(row)=>Badge(safe(row.lifecycle==='reversal'?`reverso/${row.type}`:row.type||'-'),row.lifecycle==='reversal'?'warning':'neutral')},
        {key:'inQty',label:'Entrada',numeric:true,render:(row)=>safe(row.inQty)},
        {key:'outQty',label:'Salida',numeric:true,render:(row)=>safe(row.outQty)},
        {key:'balanceQty',label:'Stock',numeric:true,render:(row)=>safe(row.balanceQty)},
        {key:'reservedQty',label:'Reservado',numeric:true,render:(row)=>safe(row.reservedQty)},
        {key:'availableQty',label:'Disponible',numeric:true,render:(row)=>safe(row.availableQty)},
        {key:'averageCost',label:'Costo prom.',numeric:true,render:(row)=>safe(usd(row.averageCost))},
        {key:'balanceValue',label:'Valor',numeric:true,render:(row)=>safe(usd(row.balanceValue))},
        {key:'note',label:'Motivo / referencia',render:(row)=>safe(row.reason||row.note||row.reasonCode||row.source||'')}
      ],rows
    });
    const selector=Select({labelKey:'Producto',name:'kardexProduct',value:String(product.id||product.sku||''),options:products.map((item)=>({value:String(item.id||item.sku),label:`${item.sku||'SKU'} · ${item.name||'Producto'}`})),attrs:'data-query-param="product"'});
    const legacyWarning=!movements.length&&Number(product.stock||0)!==0?`<div class="alert alert-warning"><strong>Saldo histórico sin Kardex reconstruible.</strong> El sistema no inventa un movimiento inicial. Registra/migra el baseline mediante el workflow autorizado antes de declarar integridad.</div>`:'';
    return `<section class="cg-page-stack">${PageHeader({eyebrowKey:'kardexEyebrow',titleKey:'kardexTitle',descKey:'kardexDesc'})}${ErpSection({title:'Producto a consultar',description:'Selecciona cualquier producto del inventario. Stock y reservas se reconstruyen exclusivamente desde movimientos persistidos.',content:`<div class="cg-record-fields cg-fields-compact">${selector}</div>${legacyWarning}`})}${movements.length?ErpSection({title:`${safe(product.name||'Producto')} · ${safe(product.sku||'SKU')}`,description:'Kardex append-only: entradas, salidas, ajustes, reservas, liberaciones y reversos.',content:table}):EmptyState({title:'Sin movimientos auditables',description:'Este producto todavía no posee movimientos persistidos. El saldo materializado no se usa como evidencia sustituta.',iconName:'fa-clock-rotate-left'})}</section>`;
  }
};