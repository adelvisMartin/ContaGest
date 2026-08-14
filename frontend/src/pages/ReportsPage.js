import { PageHeader, MetricGrid, Badge, Button, EmptyState, ErpButton, ErpDataTable, ErpSection } from '../components/ui/index.js';
import { bs, usd } from '../core/formatters.js';
import { calculateInventory, calculateLedger } from '../core/calculator.js';
import { escapeHtml } from '../utils/dom.js';

const safe=(value)=>escapeHtml(String(value??''));
const asDate=(value)=>{if(!value)return null;const date=new Date(value);return Number.isNaN(date.getTime())?null:date;};
const within=(value,from,to)=>{const date=asDate(value);return Boolean(date)&&(!from||date>=from)&&(!to||date<=to);};
const pct=(current,previous)=>previous?((current-previous)/Math.abs(previous))*100:current?100:0;
const trend=(current,previous)=>`${pct(current,previous)>=0?'+':''}${pct(current,previous).toFixed(1)}%`;

function downloadCsv(name,rows){
  const headers=Object.keys(rows[0]||{metric:'',value:'',source:''});
  const csv=[headers.join(','),...rows.map((row)=>headers.map((key)=>JSON.stringify(row[key]??'')).join(','))].join('\n');
  const link=document.createElement('a');
  link.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  link.download=name;link.click();URL.revokeObjectURL(link.href);
}

export const ReportsPage={
  render(state,{query={}}={}){
    const now=new Date();
    const defaultFrom=new Date(now.getFullYear(),now.getMonth(),1);
    const from=asDate(query.dateFrom)||defaultFrom;
    const to=asDate(query.dateTo?`${query.dateTo}T23:59:59`:null)||now;
    const span=Math.max(to.getTime()-from.getTime(),86400000);
    const previousTo=new Date(from.getTime()-1);
    const previousFrom=new Date(previousTo.getTime()-span);
    const tab=['financial','operations','customers'].includes(query.tab)?query.tab:'financial';

    const sales=(state.sales||[]).filter((item)=>within(item.date,from,to));
    const prevSales=(state.sales||[]).filter((item)=>within(item.date,previousFrom,previousTo));
    const purchases=(state.purchases||[]).filter((item)=>within(item.date,from,to));
    const prevPurchases=(state.purchases||[]).filter((item)=>within(item.date,previousFrom,previousTo));
    const history=(state.history||[]).filter((item)=>within(item.createdAt,from,to));
    const inventory=calculateInventory(state.inventory||[]);
    const ledger=calculateLedger(state.ledger?.entries||[]);

    const revenue=sales.reduce((sum,item)=>sum+Number(item.amount||0),0)||history.reduce((sum,item)=>sum+Number(item.calculation?.total||0),0);
    const prevRevenue=prevSales.reduce((sum,item)=>sum+Number(item.amount||0),0);
    const purchaseTotal=purchases.reduce((sum,item)=>sum+Number(item.amount||item.total||0)+Number(item.iva||0),0);
    const prevPurchaseTotal=prevPurchases.reduce((sum,item)=>sum+Number(item.amount||item.total||0)+Number(item.iva||0),0);
    const pendingReceivables=sales.filter((item)=>item.status!=='Cobrada').reduce((sum,item)=>sum+Number(item.amount||0),0);
    const taxes=history.reduce((sum,item)=>sum+Number(item.calculation?.taxesTotal||0),0);
    const grossMargin=revenue-purchaseTotal;
    const clients=new Map();
    sales.forEach((sale)=>clients.set(sale.client,(clients.get(sale.client)||0)+Number(sale.amount||0)));
    const topClients=[...clients.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10);
    const lowStock=(state.inventory||[]).filter((item)=>Number(item.stock||0)<=Number(item.min||0));

    const financialRows=[
      {metric:'Ventas',value:bs(revenue),comparison:trend(revenue,prevRevenue),source:'Ventas',route:'ventas'},
      {metric:'Compras',value:bs(purchaseTotal),comparison:trend(purchaseTotal,prevPurchaseTotal),source:'Compras',route:'compras'},
      {metric:'Margen operativo',value:bs(grossMargin),comparison:'Período actual',source:'Ventas - compras',route:'estados-financieros'},
      {metric:'Cobranza pendiente',value:bs(pendingReceivables),comparison:`${sales.filter((item)=>item.status!=='Cobrada').length} documentos`,source:'Ventas',route:'ventas'},
      {metric:'Tributos facturados',value:bs(taxes),comparison:'Histórico fiscal',source:'Cotizador',route:'tributos'},
      {metric:'Descuadre contable',value:bs(ledger.diff),comparison:ledger.balanced?'Balanceado':'Revisar',source:'Libro diario',route:'contabilidad'}
    ];
    const operationsRows=[
      {metric:'Valor de inventario',value:usd(inventory.valueUsd),comparison:`${state.inventory?.length||0} SKU`,source:'Inventario',route:'inventario'},
      {metric:'Venta potencial',value:usd(inventory.retailUsd),comparison:`Margen ${usd(inventory.marginUsd)}`,source:'Inventario',route:'inventario'},
      {metric:'Stock crítico',value:String(lowStock.length),comparison:lowStock.slice(0,3).map((item)=>item.sku).join(', ')||'Sin alertas',source:'Inventario',route:'inventario'},
      {metric:'Pedidos',value:String(state.foodOrders?.length||0),comparison:`${(state.foodOrders||[]).filter((item)=>!['delivered','cancelled'].includes(item.status)).length} abiertos`,source:'Operaciones',route:'tracking-pedidos'},
      {metric:'Tareas vencidas',value:String((state.tasks||[]).filter((item)=>item.status!=='Completada'&&item.due&&new Date(item.due)<now).length),comparison:'Plan operativo',source:'Tareas',route:'tasks'}
    ];
    const customerRows=topClients.map(([name,value],index)=>({metric:`#${index+1} ${name||'Cliente sin nombre'}`,value:bs(value),comparison:`${((value/Math.max(revenue,1))*100).toFixed(1)}% de ventas`,source:'Clientes',route:'clientes'}));
    const activeRows=tab==='operations'?operationsRows:tab==='customers'?customerRows:financialRows;
    const table=ErpDataTable({
      caption:'Reporte empresarial',
      columns:[
        {key:'metric',label:'Indicador',render:(row)=>`<strong>${safe(row.metric)}</strong>`},
        {key:'value',label:'Valor',numeric:true,render:(row)=>safe(row.value)},
        {key:'comparison',label:'Comparación',render:(row)=>Badge(row.comparison,row.comparison.startsWith('+')?'success':row.comparison.startsWith('-')?'warning':'brand')},
        {key:'source',label:'Fuente',render:(row)=>safe(row.source)},
        {key:'detail',label:'Detalle',render:(row)=>ErpButton('Abrir detalle',{variant:'secondary',icon:'fa-solid fa-arrow-up-right-from-square',iconOnly:true,data:{route:row.route}})}
      ],
      rows:activeRows
    });

    const period=`<section class="cgx-toolbar"><strong>Período</strong><label>Desde<input class="input" type="date" data-query-param="dateFrom" value="${safe(query.dateFrom||from.toISOString().slice(0,10))}"></label><label>Hasta<input class="input" type="date" data-query-param="dateTo" value="${safe(query.dateTo||to.toISOString().slice(0,10))}"></label><button type="button" class="btn btn-secondary" data-query-clear="dateFrom,dateTo">Mes actual</button></section>`;
    const tabs=`<nav class="cgx-toolbar" aria-label="Tipo de reporte"><strong>Vista</strong>${[['financial','Finanzas','fa-building-columns'],['operations','Operación','fa-gears'],['customers','Clientes','fa-users']].map(([value,label,icon])=>`<button type="button" class="btn ${tab===value?'btn-primary':'btn-secondary'}" data-report-tab="${value}"><i class="fa-solid ${icon}"></i> ${label}</button>`).join('')}</nav>`;
    const sectionTitle=tab==='financial'?'Desempeño financiero':tab==='operations'?'Eficiencia operativa':'Concentración de clientes';

    return `<section class="cg-page-stack">${PageHeader({eyebrowKey:'reportsEyebrow',titleKey:'reportsTitle',descKey:'reportsDesc',actions:`${Button({id:'btnReportExport',text:'Exportar CSV',icon:'fa-file-csv',variant:'secondary'})}${Button({id:'btnReportPrint',text:'Imprimir',icon:'fa-print',variant:'secondary'})}`})}${period}${MetricGrid([
      {label:'Ventas',value:bs(revenue),hint:trend(revenue,prevRevenue),iconName:'fa-chart-line',tone:'brand'},
      {label:'Margen',value:bs(grossMargin),hint:`Compras ${bs(purchaseTotal)}`,iconName:'fa-sack-dollar',tone:grossMargin>=0?'success':'danger'},
      {label:'Por cobrar',value:bs(pendingReceivables),iconName:'fa-clock',tone:pendingReceivables?'warning':'success'},
      {label:'Inventario',value:usd(inventory.retailUsd),hint:`${lowStock.length} alertas`,iconName:'fa-boxes-stacked',tone:'neutral'}
    ])}${tabs}${ErpSection({title:sectionTitle,description:'Selecciona cualquier indicador para abrir su módulo de origen.',content:activeRows.length?table:EmptyState({title:'Sin datos para el período',description:'Cambia las fechas o registra operaciones.',iconName:'fa-chart-simple'})})}</section>`;
  },
  mount(state,{Toast,UrlStateService}){
    document.querySelectorAll('[data-report-tab]').forEach((button)=>button.addEventListener('click',()=>UrlStateService.setParams({tab:button.dataset.reportTab})));
    document.getElementById('btnReportPrint')?.addEventListener('click',()=>window.print());
    document.getElementById('btnReportExport')?.addEventListener('click',()=>{
      const table=document.querySelector('.cg-ui-table,.cgx-table');
      const rows=table?[...table.querySelectorAll('tbody tr')].map((row)=>{const cells=[...row.querySelectorAll('td')].slice(0,4).map((cell)=>cell.textContent.trim());return {indicador:cells[0],valor:cells[1],comparacion:cells[2],fuente:cells[3]};}):[];
      if(!rows.length)return Toast.show('No hay datos para exportar.','warning');
      downloadCsv('reportes-contagest.csv',rows);Toast.show('Reporte exportado.','success');
    });
  }
};
