import { FiscalTable, EnterpriseButton, EnterpriseKpi } from '../components/ui/index.js';
import { ExportService } from '../services/exportService.js';

const fallbackRows = [
  { date:'01/11/2023', invoice:'000451', control:'00-00451', rif:'J-31415926-5', name:'Inversiones Pi C.A.', base:2500, iva:400, igtf:0, ret:0, total:2900, status:'OK' },
  { date:'05/11/2023', invoice:'000452', control:'00-00452', rif:'V-12345678-0', name:'Juan Pérez', base:150, iva:24, igtf:4.5, ret:0, total:178.5, status:'OK' },
  { date:'10/11/2023', invoice:'000453', control:'00-00453', rif:'-', name:'ANULADA', base:0, iva:0, igtf:0, ret:0, total:0, status:'ANULADA' },
  { date:'15/11/2023', invoice:'000454', control:'00-00454', rif:'J-98765432-1', name:'Corporación Alpha S.A.', base:10000, iva:1600, igtf:0, ret:-300, total:11300, status:'OK' }
];

const fmt = (value) => Number(value || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rowFromSale = (sale) => ({
  date: sale.date || sale.issueDate || new Date().toISOString().slice(0, 10),
  invoice: sale.invoice || sale.number || sale.id,
  control: sale.controlNo || '-',
  rif: sale.client?.rif || '-',
  name: sale.client || sale.client?.name || sale.notes || 'Consumidor final',
  base: Number(sale.subtotal || sale.amount || sale.total || 0) / 1.16,
  iva: Number(sale.iva || 0) || (Number(sale.amount || sale.total || 0) / 1.16) * .16,
  igtf: Number(sale.igtf || 0),
  ret: Number(sale.ret || sale.islrRetention || 0),
  total: Number(sale.amount || sale.total || 0),
  status: sale.status === 'Anulada' || sale.status === 'cancelled' ? 'ANULADA' : 'OK'
});
const totalsOf = (rows) => rows.reduce((acc, row) => {
  acc.base += Number(row.base || 0); acc.iva += Number(row.iva || 0); acc.igtf += Number(row.igtf || 0); acc.ret += Number(row.ret || 0); acc.total += Number(row.total || 0);
  return acc;
}, { base:0, iva:0, igtf:0, ret:0, total:0 });

export const SalesBookPage = {
  render(state) {
    const rowsData = (state.sales || []).length ? state.sales.map(rowFromSale) : fallbackRows;
    const totals = totalsOf(rowsData);
    const rows = rowsData.map((r) => `
      <tr class="${r.status === 'ANULADA' ? 'hf-annulled' : ''}">
        <td>${r.date}</td>
        <td class="hf-mono hf-linkish ${r.status === 'ANULADA' ? 'line-through' : ''}">${r.invoice}</td>
        <td class="hf-mono ${r.status === 'ANULADA' ? 'line-through' : ''}">${r.control}</td>
        <td class="hf-mono">${r.rif}</td>
        <td class="hf-strong ${r.status === 'ANULADA' ? 'hf-danger-text' : ''}">${r.name}</td>
        <td class="hf-num">${fmt(r.base)}</td>
        <td class="hf-num">${fmt(r.iva)}</td>
        <td class="hf-num ${r.igtf ? 'hf-danger-text' : ''}">${fmt(r.igtf)}</td>
        <td class="hf-num ${r.ret < 0 ? 'hf-warning-text' : ''}">${fmt(r.ret)}</td>
        <td class="hf-num hf-total-text">${fmt(r.total)}</td>
      </tr>`);
    rows.push(`<tr class="hf-total-row"><td colspan="5" class="text-right uppercase tracking-[.16em]">Totales del período:</td><td class="hf-num">${fmt(totals.base)}</td><td class="hf-num">${fmt(totals.iva)}</td><td class="hf-num hf-danger-text">${fmt(totals.igtf)}</td><td class="hf-num hf-warning-text">${fmt(totals.ret)}</td><td class="hf-num hf-total-text">${fmt(totals.total)}</td></tr>`);
    return `
      <section class="hf-salesbook">
        <div class="hf-page-head">
          <div><h2>Libro de Ventas</h2><p>Gestión y reporte fiscal mensual desde Supabase cuando el backend está conectado.</p></div>
          <div class="hf-actions">${EnterpriseButton({ id:'btnSyncSalesBook', text:'Sync Supabase', icon:'cloud_sync', variant:'secondary' })}${EnterpriseButton({ id:'btnSalesBookPrint', text:'PDF fiscal', icon:'print', variant:'secondary' })}${EnterpriseButton({ id:'btnSalesBookExport', text:'XLSX (SENIAT)', icon:'download', variant:'primary' })}${EnterpriseButton({ id:'btnSalesBookTxt', text:'TXT', icon:'description', variant:'secondary' })}</div>
        </div>
        <div class="hf-filter-card">
          <div class="hf-filter-period"><label>Período fiscal</label><div><span>Actual</span><span>${new Date().getFullYear()}</span></div></div>
          <div class="hf-filter-client"><label>Origen</label><div><span class="material-symbols-outlined">cloud_done</span>${(state.sales || []).some((s)=>s.source==='supabase') ? 'Supabase conectado' : 'Demo/local hasta sincronizar'}</div></div>
          <div class="hf-filter-status"><label>Estatus</label><div>Todos <span class="material-symbols-outlined">expand_more</span></div></div>
        </div>
        ${FiscalTable({ headers:['Fecha','N° Factura','N° Control','RIF Cliente','Razón Social','Base Imponible','IVA (16%)','IGTF (3%)','Ret. ISLR','Total'], rows })}
        <div class="hf-summary-grid">
          ${EnterpriseKpi({ label:'Ventas netas', value:`Bs. ${fmt(totals.base)}`, sub:'Base imponible del período' })}
          ${EnterpriseKpi({ label:'Débito fiscal (IVA)', value:`Bs. ${fmt(totals.iva)}`, sub:'IVA facturado 16%' })}
          ${EnterpriseKpi({ label:'Facturas procesadas', value:String(rowsData.filter((r)=>r.status !== 'ANULADA').length), sub:`/ ${rowsData.filter((r)=>r.status === 'ANULADA').length} anuladas` })}
        </div>
      </section>`;
  },
  mount(state, { Toast, Store, SupabaseSyncService }) {
    const rowsData = (Store.get().sales || []).length ? Store.get().sales.map(rowFromSale) : fallbackRows;
    const totals = totalsOf(rowsData);
    document.getElementById('btnSyncSalesBook')?.addEventListener('click', () => SupabaseSyncService.pullSales({ Store, Toast, force:true, silent:false }));
    document.getElementById('btnSalesBookPrint')?.addEventListener('click', async () => { await ExportService.downloadFiscalPdf('libro-ventas-seniat-periodo-actual', { title:'Libro de Ventas SENIAT · Período actual', rows:rowsData, totals }); Toast.show('PDF fiscal server-side solicitado con hash de integridad.', 'info'); });
    document.getElementById('btnSalesBookExport')?.addEventListener('click', async () => {
      await ExportService.downloadXlsx('libro-ventas-seniat-periodo-actual', [
        { name:'Libro de Ventas', rows:rowsData },
        { name:'Totales', rows:[totals] },
        { name:'Auditoría', rows:[{ regla:'Correlativos', estado:'Validar duplicados y anulaciones con motivo' }, { regla:'Cierre de período', estado:'Bloquear edición al declarar' }] }
      ], 'Libro de Ventas SENIAT');
      Toast.show('XLSX generado.', 'success');
    });
    document.getElementById('btnSalesBookTxt')?.addEventListener('click', () => {
      const lines = rowsData.map((r) => [r.date, r.invoice, r.rif, r.name, fmt(r.base), fmt(r.iva), fmt(r.total)].join('|')).join('\n');
      ExportService.downloadTxt('libro-ventas-periodo-actual.txt', [{ contenido: lines }], 'Libro de Ventas TXT');
      Toast.show('TXT fiscal generado.', 'success');
    });
  }
};
