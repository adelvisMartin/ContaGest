import { PageHeader, MetricGrid, Section, DataTable, Button, Badge } from '../components/ui/index.js';
import { ExportService } from '../services/exportService.js';
import { escapeHtml } from '../utils/dom.js';

const safe=(value)=>escapeHtml(String(value??''));
const numberOrNull=(value)=>{
  if(value===null||value===undefined||value==='')return null;
  const numeric=Number(value);
  return Number.isFinite(numeric)?numeric:null;
};
const firstNumber=(...values)=>{
  for(const value of values){const numeric=numberOrNull(value);if(numeric!==null)return numeric;}
  return null;
};
const fmt=(value)=>value===null||value===undefined?'—':Number(value).toLocaleString('es-VE',{minimumFractionDigits:2,maximumFractionDigits:2});
const clientName=(sale)=>{
  if(typeof sale?.client==='string')return sale.client;
  return sale?.client?.name||sale?.clientName||sale?.notes||'Consumidor final';
};
const clientRif=(sale)=>typeof sale?.client==='object'&&sale.client?sale.client.rif||'-':sale?.clientRif||'-';

const rowFromSale=(sale)=>{
  const base=firstNumber(sale.subtotal,sale.taxableBase,sale.baseImponible);
  const iva=firstNumber(sale.iva,sale.ivaAmount);
  const total=firstNumber(sale.total,sale.amount);
  const missing=[base===null?'base imponible':'',iva===null?'IVA registrado':'',total===null?'total':''].filter(Boolean);
  return {
    date:sale.date||sale.issueDate||sale.createdAt||'',
    invoice:sale.invoice||sale.number||sale.id,
    control:sale.controlNo||'-',
    rif:clientRif(sale),
    name:clientName(sale),
    base,
    iva,
    igtf:firstNumber(sale.igtf,sale.igtfAmount),
    ret:firstNumber(sale.ret,sale.islrRetention),
    total,
    status:sale.status==='Anulada'||sale.status==='cancelled'?'ANULADA':'OK',
    fiscalReady:missing.length===0,
    fiscalIssue:missing.length?`Falta ${missing.join(', ')}`:''
  };
};
const totalsOf=(rows)=>rows.reduce((acc,row)=>{
  for(const key of ['base','iva','igtf','ret','total'])if(row[key]!==null&&Number.isFinite(Number(row[key])))acc[key]+=Number(row[key]);
  return acc;
},{base:0,iva:0,igtf:0,ret:0,total:0});
const fiscalIssues=(rows)=>rows.filter((row)=>!row.fiscalReady);

export const SalesBookPage = {
  render(state) {
    const persisted=state.sales||[];
    const rowsData=persisted.map(rowFromSale);
    const totals=totalsOf(rowsData);
    const issues=fiscalIssues(rowsData);
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
        {key:'base',label:'Base imponible registrada',align:'right',render:(row)=>safe(fmt(row.base))},
        {key:'iva',label:'IVA registrado',align:'right',render:(row)=>safe(fmt(row.iva))},
        {key:'igtf',label:'IGTF registrado',align:'right',render:(row)=>safe(fmt(row.igtf))},
        {key:'ret',label:'Ret. ISLR',align:'right',render:(row)=>safe(fmt(row.ret))},
        {key:'total',label:'Total',align:'right',render:(row)=>row.total===null?'—':`<strong>${safe(fmt(row.total))}</strong>`},
        {key:'fiscalReady',label:'Integridad fiscal',render:(row)=>row.fiscalReady?Badge('Completo','success'):Badge(row.fiscalIssue,'warning')}
      ],
      rows:rowsData,
      empty:'Sin ventas reales sincronizadas en el período.'
    });

    return `<section class="cgx-page cg-page-stack cg-salesbook">
      ${PageHeader({
        eyebrow:'Fiscal',
        title:'Libro de Ventas',
        description:'Reporte fiscal construido únicamente con importes explícitamente registrados. ContaGest no reconstruye base imponible ni IVA suponiendo una alícuota.',
        meta:[`Período ${new Date().getFullYear()}`,source,`${active} vigentes · ${annulled} anuladas`],
        actions:`${Button({id:'btnSyncSalesBook',text:'Sincronizar',icon:'fa-cloud-arrow-down',variant:'secondary'})}${Button({id:'btnSalesBookPrint',text:'PDF fiscal',icon:'fa-print',variant:'secondary'})}${Button({id:'btnSalesBookExport',text:'XLSX SENIAT',icon:'fa-file-excel'})}${Button({id:'btnSalesBookTxt',text:'TXT',icon:'fa-file-lines',variant:'secondary'})}`
      })}
      ${MetricGrid([
        {label:'Base registrada',value:`Bs. ${fmt(totals.base)}`,hint:'Sin inferencias de alícuota',iconName:'fa-receipt',tone:'brand'},
        {label:'IVA registrado',value:`Bs. ${fmt(totals.iva)}`,hint:'Importe persistido en documentos',iconName:'fa-landmark',tone:'warning'},
        {label:'Total registrado',value:`Bs. ${fmt(totals.total)}`,hint:`IGTF ${fmt(totals.igtf)} · Ret. ${fmt(totals.ret)}`,iconName:'fa-sack-dollar',tone:'success'},
        {label:'Pendientes fiscales',value:String(issues.length),hint:issues.length?'Exportación fiscal bloqueada':'Datos mínimos completos',iconName:'fa-triangle-exclamation',tone:issues.length?'warning':'success'}
      ])}
      ${issues.length?Section({title:'Documentos incompletos para exportación fiscal',subtitle:'Completa base imponible, IVA y total desde el documento fuente. El sistema no calculará valores faltantes usando una tasa asumida.',children:`<div class="cg-ui-stack cg-ui-gap-sm">${issues.slice(0,12).map((row)=>`<p><strong>${safe(row.invoice)}</strong> · ${safe(row.fiscalIssue)}</p>`).join('')}${issues.length>12?`<p class="cg-ui-muted">+ ${issues.length-12} documento(s) adicional(es).</p>`:''}</div>`}):''}
      ${Section({
        title:'Detalle fiscal del período',
        subtitle:'Las exportaciones sólo se habilitan lógicamente cuando todos los documentos tienen importes fiscales explícitos.',
        children:table
      })}
    </section>`;
  },
  mount(_state,{Toast,Store,SupabaseSyncService}) {
    const rowsData=()=>((Store.get().sales||[]).map(rowFromSale));
    const requireRows=()=>{
      const rows=rowsData();
      if(!rows.length){Toast.show('No hay ventas reales para exportar en este período. Sincroniza o registra documentos primero.','warning');return null;}
      const issues=fiscalIssues(rows);
      if(issues.length){
        const sample=issues.slice(0,3).map((row)=>row.invoice).join(', ');
        Toast.show(`Exportación fiscal bloqueada: ${issues.length} documento(s) carecen de base, IVA o total explícitos${sample?` (${sample})`:''}.`,'error');
        return null;
      }
      return rows;
    };
    document.getElementById('btnSyncSalesBook')?.addEventListener('click',()=>SupabaseSyncService.pullSales({Store,Toast,force:true,silent:false}));
    document.getElementById('btnSalesBookPrint')?.addEventListener('click',async()=>{
      const rows=requireRows();if(!rows)return;
      await ExportService.downloadFiscalPdf('libro-ventas-seniat-periodo-actual',{title:'Libro de Ventas SENIAT · Período actual',rows,totals:totalsOf(rows)});
      Toast.show('PDF fiscal solicitado con importes registrados, sin inferencias.', 'info');
    });
    document.getElementById('btnSalesBookExport')?.addEventListener('click',async()=>{
      const rows=requireRows();if(!rows)return;
      const totals=totalsOf(rows);
      await ExportService.downloadXlsx('libro-ventas-seniat-periodo-actual',[{name:'Libro de Ventas',rows},{name:'Totales',rows:[totals]},{name:'Auditoría',rows:[{regla:'Integridad fiscal',estado:'Base, IVA y total provienen del documento; no se infieren alícuotas'},{regla:'Correlativos',estado:'Validar duplicados y anulaciones con motivo'},{regla:'Cierre de período',estado:'Bloquear edición al declarar'}]}],'Libro de Ventas SENIAT');
      Toast.show('XLSX generado con importes fiscales explícitos.','success');
    });
    document.getElementById('btnSalesBookTxt')?.addEventListener('click',()=>{
      const rows=requireRows();if(!rows)return;
      const lines=rows.map((row)=>[row.date,row.invoice,row.rif,row.name,fmt(row.base),fmt(row.iva),fmt(row.total)].join('|')).join('\n');
      ExportService.downloadTxt('libro-ventas-periodo-actual.txt',[{contenido:lines}],'Libro de Ventas TXT');
      Toast.show('TXT fiscal generado con importes registrados.','success');
    });
  }
};
