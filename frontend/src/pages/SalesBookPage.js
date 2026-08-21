import { PageHeader, MetricGrid, Section, DataTable, Button, Badge } from '../components/ui/index.js';
import { ExportService } from '../services/exportService.js';
import { escapeHtml } from '../utils/dom.js';

const fallbackRows = [
  { date:'01/11/2023', invoice:'000451', control:'00-00451', rif:'J-31415926-5', name:'Inversiones Pi C.A.', base:2500, iva:400, igtf:0, ret:0, total:2900, status:'OK' },
  { date:'05/11/2023', invoice:'000452', control:'00-00452', rif:'V-12345678-0', name:'Juan Pérez', base:150, iva:24, igtf:4.5, ret:0, total:178.5, status:'OK' },
  { date:'10/11/2023', invoice:'000453', control:'00-00453', rif:'-', name:'ANULADA', base:0, iva:0, igtf:0, ret:0, total:0, status:'ANULADA' },
  { date:'15/11/2023', invoice:'000454', control:'00-00454', rif:'J-98765432-1', name:'Corporación Alpha S.A.', base:10000, iva:1600, igtf:0, ret:-300, total:11300, status:'OK' }
];

const safe=(value)=>escapeHtml(String(value??''));
const fmt=(value)=>Number(value||0).toLocaleString('es-VE',{minimumFractionDigits:2,maximumFractionDigits:2});
const clientName=(sale)=>{
  if(typeof sale?.client==='string')return sale.client;
  return sale?.client?.name||sale?.clientName||sale?.notes||'Consumidor final';
};
const clientRif=(sale)=>typeof sale?.client==='object'&&sale.client?sale.client.rif||'-':sale?.clientRif||'-';
const rowFromSale=(sale)=>({
  date:sale.date||sale.issueDate||new Date().toISOString().slice(0,10),
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
    const rowsData=persisted.length?persisted.map(rowFromSale):fallbackRows;
    const totals=totalsOf(rowsData);
    const active=rowsData.filter((row)=>row.status!=='ANULADA').length;
    const annulled=rowsData.length-active;
    const source=persisted.some((sale)=>sale.source==='supabase')?'Supabase conectado':persisted.length?'Datos locales / pendientes':'Datos de referencia hasta sincronizar';

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
      empty:'Sin ventas en el período'
    });

    return `<section class="cgx-page cg-page-stack cg-salesbook">
      ${PageHeader({
        eyebrow:'Fiscal',
        title:'Libro de Ventas',
        description:'Gestión y reporte fiscal mensual con lectura compacta, importes alineados y exportación controlada.',
        meta:[`Período ${new Date().getFullYear()}`,source,`${active} vigentes · ${annulled} anuladas`],
        actions:`${Button({id:'btnSyncSalesBook',text:'Sync Supabase',icon:'fa-cloud-arrow-down',variant:'secondary'})}${Button({id:'btnSalesBookPrint',text:'PDF fiscal',icon:'fa-print',variant:'secondary'})}${Button({id:'btnSalesBookExport',text:'XLSX SENIAT',icon:'fa-file-excel'})}${Button({id:'btnSalesBookTxt',text:'TXT',icon:'fa-file-lines',variant:'secondary'})}`
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
    const rowsData=()=>((Store.get().sales||[]).length?Store.get().sales.map(rowFromSale):fallbackRows);
    document.getElementById('btnSyncSalesBook')?.addEventListener('click',()=>SupabaseSyncService.pullSales({Store,Toast,force:true,silent:false}));
    document.getElementById('btnSalesBookPrint')?.addEventListener('click',async()=>{
      const rows=rowsData();
      await ExportService.downloadFiscalPdf('libro-ventas-seniat-periodo-actual',{title:'Libro de Ventas SENIAT · Período actual',rows,totals:totalsOf(rows)});
      Toast.show('PDF fiscal server-side solicitado con hash de integridad.','info');
    });
    document.getElementById('btnSalesBookExport')?.addEventListener('click',async()=>{
      const rows=rowsData(),totals=totalsOf(rows);
      await ExportService.downloadXlsx('libro-ventas-seniat-periodo-actual',[
        {name:'Libro de Ventas',rows},
        {name:'Totales',rows:[totals]},
        {name:'Auditoría',rows:[{regla:'Correlativos',estado:'Validar duplicados y anulaciones con motivo'},{regla:'Cierre de período',estado:'Bloquear edición al declarar'}]}
      ],'Libro de Ventas SENIAT');
      Toast.show('XLSX generado.','success');
    });
    document.getElementById('btnSalesBookTxt')?.addEventListener('click',()=>{
      const lines=rowsData().map((row)=>[row.date,row.invoice,row.rif,row.name,fmt(row.base),fmt(row.iva),fmt(row.total)].join('|')).join('\n');
      ExportService.downloadTxt('libro-ventas-periodo-actual.txt',[{contenido:lines}],'Libro de Ventas TXT');
      Toast.show('TXT fiscal generado.','success');
    });
  }
};
