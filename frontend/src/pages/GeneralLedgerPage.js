import { PageHeader, MetricGrid, Section, DataTable, Button, Select, Field, Badge, EmptyState } from '../components/ui/index.js';
import { bs, usd, number, shortDate } from '../core/formatters.js';
import { downloadText, qs } from '../utils/dom.js';
import { buildGeneralLedger, getAccounts, rowsToCsv } from '../services/accountingReportsService.js';

const filters = () => ({ from: qs('#glFrom')?.value || '', to: qs('#glTo')?.value || '', account: qs('#glAccount')?.value || '' });
const fmtDual = (local, usdValue) => `<strong>${bs(local)}</strong><small>${usd(usdValue)}</small>`;
const printHtml = (state) => `<html><head><title>Libro mayor</title><style data-cg-print-only>body{font-family:Arial;margin:24px;color:#0f172a}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #cbd5e1;padding:6px;text-align:left}th{background:#0b1f3a;color:#fff}.right{text-align:right}.account{margin-top:18px}.meta{color:#475569}</style></head><body><h1>Libro Mayor</h1><p class="meta">${state.settings?.companyTradeName || state.settings?.companyName || 'Empresa'} · ${new Date().toLocaleString('es-VE')}</p>${buildGeneralLedger(state, filters()).map(group=>`<section class="account"><h2>${group.account}</h2><table><thead><tr><th>Fecha</th><th>Doc.</th><th>Referencia</th><th>Descripción</th><th class="right">Debe ML</th><th class="right">Haber ML</th><th class="right">Saldo ML</th></tr></thead><tbody>${group.rows.map(row=>`<tr><td>${row.date}</td><td>${row.docNo}</td><td>${row.reference}</td><td>${row.description}</td><td class="right">${number(row.debitLocal)}</td><td class="right">${number(row.creditLocal)}</td><td class="right">${number(row.runningLocal)}</td></tr>`).join('')}</tbody></table></section>`).join('')}</body></html>`;

export const GeneralLedgerPage = {
  render(state) {
    const accounts = getAccounts(state);
    const groups = buildGeneralLedger(state);
    const totals = groups.reduce((acc, group) => ({ debit: acc.debit + group.debitLocal, credit: acc.credit + group.creditLocal, balance: acc.balance + group.balanceLocal, debitUsd: acc.debitUsd + group.debitUsd, creditUsd: acc.creditUsd + group.creditUsd }), { debit:0, credit:0, balance:0, debitUsd:0, creditUsd:0 });
    const rows = groups.flatMap((group) => [
      { __group:true, account: group.account, type: group.meta.label, debitLocal: group.debitLocal, creditLocal: group.creditLocal, balanceLocal: group.balanceLocal, debitUsd: group.debitUsd, creditUsd: group.creditUsd, balanceUsd: group.balanceUsd },
      ...group.rows.map((row) => ({ ...row, type:'Movimiento' }))
    ]);
    return `<section class="cgx-page accounting-report-page">
      ${PageHeader({ eyebrow:'Contabilidad', title:'Libro mayor', description:'Mayoriza automáticamente los asientos del Libro Diario por cuenta, muestra saldo corrido y permite imprimir o descargar la hoja.', actions:`${Button({ id:'btnPrintGeneralLedger', text:'Imprimir / Vista hoja', icon:'fa-print', variant:'secondary' })}${Button({ id:'btnDownloadGeneralLedger', text:'Descargar CSV', icon:'fa-download' })}` })}
      ${MetricGrid([
        { label:'Cuentas mayoradas', value:String(groups.length), hint:'Desde libro diario', iconName:'fa-book-open', tone:'brand' },
        { label:'Debe acumulado', value:bs(totals.debit), hint:usd(totals.debitUsd), iconName:'fa-arrow-trend-up', tone:'success' },
        { label:'Haber acumulado', value:bs(totals.credit), hint:usd(totals.creditUsd), iconName:'fa-arrow-trend-down', tone:'warning' },
        { label:'Saldo neto', value:bs(totals.balance), hint:'Debe - Haber', iconName:'fa-scale-balanced', tone:Math.abs(totals.balance) < 0.01 ? 'success' : 'brand' }
      ])}
      ${Section({ title:'Filtros del mayor', subtitle:'Filtra por período y cuenta contable antes de imprimir o descargar.', children:`<div class="cg-record-fields cg-fields-compact"><div class="cgx-field"><label class="label cgx-label">Desde</label><input id="glFrom" type="date" class="input cgx-field-normalized"></div><div class="cgx-field"><label class="label cgx-label">Hasta</label><input id="glTo" type="date" class="input cgx-field-normalized"></div>${Select({ labelKey:'Cuenta', name:'glAccountFake', options:[{ value:'', label:'Todas las cuentas' }, ...accounts.map(a => ({ value:a, label:a }))], attrs:'id="glAccount"' })}${Button({ id:'btnApplyGeneralLedger', text:'Aplicar filtros', icon:'fa-filter', variant:'secondary' })}</div>` })}
      ${rows.length ? DataTable({ columns:[
        { key:'date', label:'Fecha', render:(r)=> r.__group ? `<strong>${r.account}</strong><br><small>${r.type}</small>` : shortDate(r.date) },
        { key:'docNo', label:'Doc.', render:(r)=> r.__group ? Badge('Total mayor', 'brand') : r.docNo },
        { key:'reference', label:'Referencia', render:(r)=> r.__group ? '' : r.reference },
        { key:'description', label:'Descripción', render:(r)=> r.__group ? `Saldo de cuenta ${r.account}` : r.description },
        { key:'debitLocal', label:'Debe ML / USD', align:'right', render:(r)=> fmtDual(r.debitLocal || 0, r.debitUsd || 0) },
        { key:'creditLocal', label:'Haber ML / USD', align:'right', render:(r)=> fmtDual(r.creditLocal || 0, r.creditUsd || 0) },
        { key:'runningLocal', label:'Saldo corrido', align:'right', render:(r)=> r.__group ? fmtDual(r.balanceLocal || 0, r.balanceUsd || 0) : fmtDual(r.runningLocal || 0, r.runningUsd || 0) }
      ], rows }) : EmptyState({ title:'Sin movimientos mayorables', description:'Registra asientos en Libro Diario para alimentar el mayor.', iconName:'fa-book' })}
    </section>`;
  },
  mount(state, { Store, Toast }) {
    const redraw = () => Store.set({ route:'libro-mayor' });
    qs('#btnApplyGeneralLedger')?.addEventListener('click', redraw);
    qs('#btnDownloadGeneralLedger')?.addEventListener('click', () => {
      const groups = buildGeneralLedger(Store.get(), filters());
      const flat = groups.flatMap(group => group.rows.map(row => ({ cuenta:group.account, fecha:row.date, documento:row.docNo, referencia:row.reference, descripcion:row.description, debe_ml:row.debitLocal, haber_ml:row.creditLocal, saldo_ml:row.runningLocal, debe_usd:row.debitUsd, haber_usd:row.creditUsd, saldo_usd:row.runningUsd })));
      downloadText('libro-mayor.csv', rowsToCsv(flat, [{label:'Cuenta',key:'cuenta'},{label:'Fecha',key:'fecha'},{label:'Documento',key:'documento'},{label:'Referencia',key:'referencia'},{label:'Descripción',key:'descripcion'},{label:'Debe ML',key:'debe_ml'},{label:'Haber ML',key:'haber_ml'},{label:'Saldo ML',key:'saldo_ml'},{label:'Debe USD',key:'debe_usd'},{label:'Haber USD',key:'haber_usd'},{label:'Saldo USD',key:'saldo_usd'}]), 'text/csv;charset=utf-8');
      Toast.show('Libro mayor descargado.', 'success');
    });
    qs('#btnPrintGeneralLedger')?.addEventListener('click', () => { const win = window.open('', '_blank', 'noopener,noreferrer'); if (!win) return Toast.show('Permite ventanas emergentes para imprimir.', 'warning'); win.document.write(printHtml(Store.get())); win.document.close(); setTimeout(()=>win.print(), 250); });
  }
};
