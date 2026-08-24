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
      return true;
    });
    const sample=[{id:'ini',at:product.createdAt||new Date().toISOString(),sku:product.sku,productId:product.id,type:'in',qty:Number(product.stock||0),unitCost:Number(product.costUsd||product.cost||0),note:'Saldo disponible al iniciar la vista'},...movements];
    const rows=buildKardex({product,movements:sample});
    const table=ErpDataTable({
      caption:`Kardex ${product.sku||product.name||''}`,
      columns:[
        {key:'at',label:'Fecha',render:(row)=>safe(dateTime(row.at||row.createdAt))},
        {key:'type',label:'Tipo',render:(row)=>Badge(safe(row.type||'-'),'neutral')},
        {key:'inQty',label:'Entrada',numeric:true,render:(row)=>safe(row.inQty)},
        {key:'outQty',label:'Salida',numeric:true,render:(row)=>safe(row.outQty)},
        {key:'balanceQty',label:'Saldo',numeric:true,render:(row)=>safe(row.balanceQty)},
        {key:'averageCost',label:'Costo prom.',numeric:true,render:(row)=>safe(usd(row.averageCost))},
        {key:'balanceValue',label:'Valor',numeric:true,render:(row)=>safe(usd(row.balanceValue))},
        {key:'note',label:'Nota',render:(row)=>safe(row.note||'')}
      ],rows
    });
    const selector=Select({labelKey:'Producto',name:'kardexProduct',value:String(product.id||product.sku||''),options:products.map((item)=>({value:String(item.id||item.sku),label:`${item.sku||'SKU'} · ${item.name||'Producto'}`})),attrs:'data-query-param="product"'});
    return `<section class="cg-page-stack">${PageHeader({eyebrowKey:'kardexEyebrow',titleKey:'kardexTitle',descKey:'kardexDesc'})}${ErpSection({title:'Producto a consultar',description:'Selecciona cualquier producto del inventario; el Kardex ya no queda fijado al primer registro.',content:`<div class="cg-record-fields cg-fields-compact">${selector}</div>`})}${ErpSection({title:`${safe(product.name||'Producto')} · ${safe(product.sku||'SKU')}`,description:'Costo promedio ponderado. Los movimientos se filtran por producto y conservan su historial operativo.',content:table})}</section>`;
  }
};
