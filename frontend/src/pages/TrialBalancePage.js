import { PageHeader, MetricGrid, Section, DataTable, Button, Badge, EmptyState } from '../components/ui/index.js';
import { bs, usd, number } from '../core/formatters.js';
import { downloadText, qs } from '../utils/dom.js';
import { buildTrialBalance, rowsToCsv } from '../services/accountingReportsService.js';

const filters = () => ({ from: qs('#tbFrom')?.value || '', to: qs('#tbTo')?.value || '' });
const dual = (local, usdValue) => `<strong>${bs(local)}</strong><small>${usd(usdValue)}</small>`;
const printHtml = (state) => { const report = buildTrialBalance(state, filters()); return `<html><head><title>Balance de sumas y saldos</title><style>body{font-family:Arial;margin:24px;color:#0f172a}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #cbd5e1;padding:6px}th{background:#0b1f3a;color:#fff}.right{text-align:right}</style></head><body><h1>Balance de sumas y saldos</h1><p>${state.settings?.companyTradeName || state.settings?.companyName || 'Empresa'} · ${new Date().toLocaleString('es-VE')}</p><table><thead><tr><th>Cuenta</th><th>Tipo</th><th>Sumas Debe</th><th>Sumas Haber</th><th>Saldo Deudor</th><th>Saldo Acreedor</th></tr></thead><tbody>${report.rows.map(r=>`<tr><td>${r.account}</td><td>${r.type}</td><td class="right">${number(r.debitMovLocal)}</td><td class="right">${number(r.creditMovLocal)}</td><td class="right">${number(r.debitBalanceLocal)}</td><td class="right">${number(r.creditBalanceLocal)}</td></tr>`).join('')}</tbody></table></body></html>`; };

export const TrialBalancePage = {
  render(state) {
    const report = buildTrialBalance(state);
    return `<section class="cgx-page accounting-report-page">
      ${PageHeader({ eyebrow:'Contabilidad', title:'Balance de sumas y saldos', description:'Verifica sumas del Debe/Haber, saldos deudores/acreedores y diferencias antes de emitir estados financieros.', actions:`${Button({ id:'btnPrintTrialBalance', text:'Vista / imprimir', icon:'fa-print', variant:'secondary' })}${Button({ id:'btnDownloadTrialBalance', text:'Descargar CSV', icon:'fa-download' })}` })}
      ${MetricGrid([
        { label:'Estado', value:report.totals.isBalanced ? 'Balanceado' : 'Descuadre', hint:`Diferencia ${bs(report.totals.diffLocal || 0)}`, iconName:'fa-scale-balanced', tone:report.totals.isBalanced ? 'success' : 'danger' },
        { label:'Sumas Debe', value:bs(report.totals.debitMovLocal), hint:usd(report.totals.debitMovUsd), iconName:'fa-arrow-up', tone:'success' },
        { label:'Sumas Haber', value:bs(report.totals.creditMovLocal), hint:usd(report.totals.creditMovUsd), iconName:'fa-arrow-down', tone:'warning' },
        { label:'Cuentas', value:String(report.rows.length), hint:'Con movimiento o saldo', iconName:'fa-list-ol', tone:'brand' }
      ])}
      ${Section({ title:'Período', subtitle:'El balance se calcula a partir del Libro Diario mayorado.', children:`<div class="cg-record-fields cg-fields-compact"><div class="cgx-field"><label class="label cgx-label">Desde</label><input id="tbFrom" type="date" class="input cgx-field-normalized"></div><div class="cgx-field"><label class="label cgx-label">Hasta</label><input id="tbTo" type="date" class="input cgx-field-normalized"></div>${Button({ id:'btnApplyTrialBalance', text:'Aplicar período', icon:'fa-filter', variant:'secondary' })}</div>` })}
      ${report.rows.length ? DataTable({ columns:[
        { key:'account', label:'Cuenta' }, { key:'type', label:'Clasificación' },
        { key:'debitMovLocal', label:'Sumas Debe', align:'right', render:(r)=>dual(r.debitMovLocal, r.debitMovUsd) },
        { key:'creditMovLocal', label:'Sumas Haber', align:'right', render:(r)=>dual(r.creditMovLocal, r.creditMovUsd) },
        { key:'debitBalanceLocal', label:'Saldo Deudor', align:'right', render:(r)=>dual(r.debitBalanceLocal, r.debitBalanceUsd) },
        { key:'creditBalanceLocal', label:'Saldo Acreedor', align:'right', render:(r)=>dual(r.creditBalanceLocal, r.creditBalanceUsd) },
        { key:'status', label:'Control', render:(r)=> r.debitBalanceLocal || r.creditBalanceLocal ? Badge('Con saldo','brand') : Badge('Cerrada','success') }
      ], rows:report.rows }) : EmptyState({ title:'Sin saldos contables', description:'Registra asientos para emitir el balance de sumas y saldos.', iconName:'fa-scale-balanced' })}
    </section>`;
  },
  mount(state, { Store, Toast }) {
    qs('#btnApplyTrialBalance')?.addEventListener('click', () => Store.set({ route:'balance-sumas-saldos' }));
    qs('#btnDownloadTrialBalance')?.addEventListener('click', () => { const r = buildTrialBalance(Store.get(), filters()); downloadText('balance-sumas-saldos.csv', rowsToCsv(r.rows, [{label:'Cuenta',key:'account'},{label:'Tipo',key:'type'},{label:'Sumas Debe ML',key:'debitMovLocal'},{label:'Sumas Haber ML',key:'creditMovLocal'},{label:'Saldo Deudor ML',key:'debitBalanceLocal'},{label:'Saldo Acreedor ML',key:'creditBalanceLocal'},{label:'Saldo Deudor USD',key:'debitBalanceUsd'},{label:'Saldo Acreedor USD',key:'creditBalanceUsd'}]), 'text/csv;charset=utf-8'); Toast.show('Balance descargado.', 'success'); });
    qs('#btnPrintTrialBalance')?.addEventListener('click', () => { const win = window.open('', '_blank', 'noopener,noreferrer'); if (!win) return Toast.show('Permite ventanas emergentes.', 'warning'); win.document.write(printHtml(Store.get())); win.document.close(); setTimeout(()=>win.print(),250); });
  }
};
