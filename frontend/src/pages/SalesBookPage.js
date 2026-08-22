import { PageHeader, MetricGrid, Section, DataTable, Button, Badge } from '../components/ui/index.js';
import { ExportService } from '../services/exportService.js';
import { escapeHtml } from '../utils/dom.js';

const safe=(value)=>escapeHtml(String(value??''));
const fmt=(value)=>Number(value||0).toLocaleString('es-VE',{minimumFractionDigits:2,maximumFractionDigits:2});
const clientName=(sale)=>{
  if(typeof sale?.client==='string')return sale.client;
  return sale?.client?.name||sale?.clientName||sale?.notes||'Consumidor final';
};
const clientRif=(sale)=>typeof sale?.client==='object'&&sale.client?sale.client.rif||'-':sale?.clientRif||'-';
const rowFromSale=(sale)=>({
  date:sale.date||sale.issueDate||sale.createdAt||'',
  invoice:sale.invoice||sale.number||sale.id,
  control:sale.controlNo||'-',
  rif:clientRif(sale),
  name:clientName(sale),
  base:Number(sale.subtotal||sale.amount||sale.total||0)/1.16,
  iva:Number(sale.iva||0)||(Number(sale.amount||sale.total||0)/1.16)*.16,
  igtf:Number(sale.igtf||0),
  ret:Number(sale.ret||sale.islrRetention||0),
  total:Number(sale.amount||sale.total||0),
  status:sale.status==='Anulada'||sale.status==='cancelled'?'ANULADA':'OK'
});
const totalsOf=(rows)=>rows.reduce((acc,row)=>{
  acc.base+=Number(row.base||0);acc.iva+=Number(row.iva||0);acc.igtf+=Number(row.igtf||0);acc.ret+=Number(row.ret||0);acc.total+=Number(row.total||0);return acc;
},{base:0,iva:0,igtf:0,ret:0,total:0});

export const SalesBookPage = {
  render(state) {
    const persisted=state.sales||[];
    const rowsData=persisted.map(rowFromSale);
    const totals=totalsOf(rowsData);
    const active=rowsData.filter((row)=>row.status!=='ANULADA').length;
    const annulled=rowsData.length-active;
    const source=persisted.some((sale)=>sale.source==='supabase')?'Datos sincronizados':'Sincronización pendiente o datos locales';

    const table=DataTable({
      columns:[
        {key:'date',label:'Fecha',render:(row)=>safe(row.date)},
        {key:'invoice',label:'N° Factura',render:(row)=>`<span class="cg-ui-code">${safe(row.invoice)}</span>`},
        {key:'control',label:'N° Control',render:(row)=>`<span class="cg-ui-code">${safe(row.control)}</span>`},
        {key:'rif',label:'RIF Cliente',render:(row)=>`<span class="cg-ui-code">${safe(row.rif)}</span>`},
        {key:'name',label:'Razón Social',render:(row)=>`<strong>${safe(row.name)}</strong>${row.status==='ANULADA'?`<br>${Badge('Anulada','danger')}`:''}`},
        {key:'base',label:'Base Imponible',align:'right',render:(row)=>safe(fmt(row.base))},
        {key:'iva',label:'IVA 16%',align:'right',render:(row)=>safe(fmt(row.iva))},
        {key:'igtf',label:'IGTF 3%',align:'right',render:(row)=>safe(fmt(row.igtf))},
        {key:'ret',label:'Ret. ISLR',align:'right',render:(row)=>safe(fmt(row.ret))},
        {key:'total',label:'Total',align:'right',render:(row)=>`<strong>${safe(fmt(row.total))}</strong>`}
      ],
      rows:rowsData,
      empty:'Sin ventas reales sincronizadas en el período.'
    });

    return `<section class="cgx-page cg-page-stack cg-salesbook">
      ${PageHeader({
        eyebrow:'Fiscal',
        title:'Libro de Ventas',
        description:'Reporte fiscal construido únicamente con documentos registrados. Nunca se inyectan facturas, RIF o montos de demostración en el libro fiscal.',
        meta:[`Período ${new Date().getFullYear()}`,source,`${active} vigentes · ${annulled} anuladas`],
        actions:`${Button({id:'btnSyncSalesBook',text:'Sincronizar',icon:'fa-cloud-arrow-down',variant:'secondary'})}${Button({id:'btnSalesBookPrint',text:'PDF fiscal',icon:'fa-print',variant:'secondary'})}${Button({id:'btnSalesBookExport',text:'XLSX SENIAT',icon:'fa-file-excel'})}${Button({id:'btnSalesBookTxt',text:'TXT',icon:'fa-file-lines',variant:'secondary'})}`
      })}
      ${MetricGrid([
        {label:'Ventas netas',value:`Bs. ${fmt(totals.base)}`,hint:'Base imponible del período',iconName:'fa-receipt',tone:'brand'},
        {label:'Débito fiscal IVA',value:`Bs. ${fmt(totals.iva)}`,hint:'IVA facturado 16%',iconName:'fa-landmark',tone:'warning'},
        {label:'Total facturado',value:`Bs. ${fmt(totals.total)}`,hint:`IGTF ${fmt(totals.igtf)} · Ret. ${fmt(totals.ret)}`,iconName:'fa-sack-dollar',tone:'success'},
        {label:'Documentos',value:String(rowsData.length),hint:`${active} vigentes · ${annulled} anuladas`,iconName:'fa-file-invoice',tone:annulled?'warning':'neutral'}
      ])}
      ${Section({
        title:'Detalle fiscal del período',
        subtitle:'La tabla conserva su propio desplazamiento horizontal cuando las diez columnas no caben en el viewport.',
        children:table
      })}
    </section>`;
  },
  mount(_state,{Toast,Store,SupabaseSyncService}) {
    const rowsData=()=>((Store.get().sales||[]).map(rowFromSale));
    const requireRows=()=>{const rows=rowsData();if(!rows.length){Toast.show('No hay ventas reales para exportar en este período. Sincroniza o registra documentos primero.','warning');return null;}return rows;};
    document.getElementById('btnSyncSalesBook')?.addEventListener('click',()=>SupabaseSyncService.pullSales({Store,Toast,force:true,silent:false}));
    document.getElementById('btnSalesBookPrint')?.addEventListener('click',async()=>{
      const rows=requireRows();if(!rows)return;
      await ExportService.downloadFiscalPdf('libro-ventas-seniat-periodo-actual',{title:'Libro de Ventas SENIAT · Período actual',rows,totals:totalsOf(rows)});
      Toast.show('PDF fiscal server-side solicitado con datos registrados.','info');
    });
    document.getElementById('btnSalesBookExport')?.addEventListener('click',async()=>{
      const rows=requireRows();if(!rows)return;const totals=totalsOf(rows);
      await ExportService.downloadXlsx('libro-ventas-seniat-periodo-actual',[{name:'Libro de Ventas',rows},{name:'Totales',rows:[totals]},{name:'Auditoría',rows:[{regla:'Correlativos',estado:'Validar duplicados y anulaciones con motivo'},{regla:'Cierre de período',estado:'Bloquear edición al declarar'}]}],'Libro de Ventas SENIAT');
      Toast.show('XLSX generado con documentos registrados.','success');
    });
    document.getElementById('btnSalesBookTxt')?.addEventListener('click',()=>{
      const rows=requireRows();if(!rows)return;
      const lines=rows.map((row)=>[row.date,row.invoice,row.rif,row.name,fmt(row.base),fmt(row.iva),fmt(row.total)].join('|')).join('\n');
      ExportService.downloadTxt('libro-ventas-periodo-actual.txt',[{contenido:lines}],'Libro de Ventas TXT');
      Toast.show('TXT fiscal generado con documentos registrados.','success');
    });
  }
};
