import { PageHeader, Badge, EmptyState, ErpDataTable, ErpSection } from '../components/ui/index.js';
import { buildKardex } from '../core/businessRules.js';
import { dateTime, usd } from '../core/formatters.js';
import { escapeHtml } from '../utils/dom.js';

const safe=(value)=>escapeHtml(String(value??''));

export const KardexPage = {
  render(state) {
    const product=state.inventory?.[0]||{};
    if(!product.id&&!product.sku) return `<section class="cg-page-stack">${PageHeader({eyebrowKey:'kardexEyebrow',titleKey:'kardexTitle',descKey:'kardexDesc'})}${EmptyState({title:'Sin productos',description:'Registra inventario para habilitar el kardex.',iconName:'fa-boxes-stacked'})}</section>`;
    const sample=[{id:'ini',at:new Date().toISOString(),sku:product.sku,type:'in',qty:Number(product.stock||0),unitCost:Number(product.costUsd||0),note:'Saldo inicial'},...(state.inventoryMovements||[])];
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
    return `<section class="cg-page-stack">${PageHeader({eyebrowKey:'kardexEyebrow',titleKey:'kardexTitle',descKey:'kardexDesc'})}${ErpSection({title:`${product.name||'Producto'} · ${product.sku||'SKU'}`,description:'Costo promedio ponderado. Los movimientos registrados se muestran como historial operativo auditable.',content:table})}</section>`;
  }
};
