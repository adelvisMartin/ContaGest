import { PageHeader, MetricGrid, Section, DataTable, Button, Select, Field, EmptyState, Badge } from '../components/ui/index.js';
import { bs } from '../core/formatters.js';
import { downloadText, mountSubmit, qs, uid, today } from '../utils/dom.js';
import { buildWorksheet, getAccounts, rowsToCsv } from '../services/accountingReportsService.js';

const dual = (local) => `<strong>${bs(local)}</strong>`;

export const WorksheetPage = {
  render(state) {
    const report = buildWorksheet(state);
    const accounts = getAccounts(state);
    return `<section class="cgx-page accounting-report-page accounting-worksheet-page">
      ${PageHeader({ eyebrow:'Contabilidad', title:'Hoja de trabajo', description:'Integra balance de comprobación y ajustes de trabajo para análisis de cierre. Los ajustes de esta pantalla NO son asientos contabilizados.', actions:`${Button({ id:'btnDownloadWorksheet', text:'Descargar CSV', icon:'fa-download' })}${Button({ id:'btnPrintWorksheet', text:'Vista / imprimir', icon:'fa-print', variant:'secondary' })}` })}
      ${Section({ title:'Alcance contable', subtitle:'La hoja de trabajo es un papel de trabajo. Para afectar libros, saldos oficiales o períodos, registra un asiento balanceado en Libro Diario.', actions:Badge('NO POSTEADO','warning'), children:'<p class="cg-ui-muted">Agregar, exportar o imprimir un ajuste aquí no crea LedgerEntry, no modifica el diario y no debe interpretarse como contabilización.</p>' })}
      ${MetricGrid([
        { label:'Ajustes de trabajo', value:String(report.adjustments.length), hint:'NO POSTEADOS en Libro Diario', iconName:'fa-sliders', tone:'warning' },
        { label:'Balance ajustado', value:report.totals.checkLocal === 0 ? 'Cuadrado' : 'Revisar', hint:`Diferencia ${bs(report.totals.checkLocal)}`, iconName:'fa-scale-balanced', tone:report.totals.checkLocal === 0 ? 'success' : 'danger' },
        { label:'Resultado estimado', value:bs(report.totals.netIncomeLocal), hint:'Proyección de trabajo', iconName:'fa-chart-line', tone:report.totals.netIncomeLocal >= 0 ? 'success' : 'warning' },
        { label:'Cuentas evaluadas', value:String(report.rows.length), hint:'Con saldos/ajustes', iconName:'fa-table', tone:'brand' }
      ])}
      ${Section({ title:'Ajuste de trabajo (no contabilizado)', subtitle:'Úsalo para preparar cierre o conciliación. Después registra el asiento definitivo en Libro Diario.', children:`<form id="worksheetAdjustmentForm" class="cg-record-form"><div class="cg-record-fields cg-fields-compact">${Field({ labelKey:'Fecha', name:'date', type:'date', value:today() })}${Select({ labelKey:'Cuenta', name:'account', options:accounts.map(a=>({ value:a, label:a })) })}${Field({ labelKey:'Debe', name:'debit', type:'number', attrs:'step="0.01" min="0"', value:'0' })}${Field({ labelKey:'Haber', name:'credit', type:'number', attrs:'step="0.01" min="0"', value:'0' })}${Field({ labelKey:'Descripción', name:'description', className:'cg-field-wide', placeholder:'Depreciación, provisión, ajuste de inventario...' })}</div><div class="cg-record-actions">${Button({ text:'Agregar ajuste de trabajo', icon:'fa-plus', type:'submit' })}</div></form>` })}
      ${report.rows.length ? DataTable({ columns:[
        { key:'account', label:'Cuenta' }, { key:'type', label:'Tipo' },
        { key:'tbDebitLocal', label:'B. Comp. Debe', align:'right', render:(r)=>dual(r.tbDebitLocal) },
        { key:'tbCreditLocal', label:'B. Comp. Haber', align:'right', render:(r)=>dual(r.tbCreditLocal) },
        { key:'adjDebitLocal', label:'Ajuste Debe', align:'right', render:(r)=>dual(r.adjDebitLocal) },
        { key:'adjCreditLocal', label:'Ajuste Haber', align:'right', render:(r)=>dual(r.adjCreditLocal) },
        { key:'adjustedDebitLocal', label:'Ajustado Debe', align:'right', render:(r)=>dual(r.adjustedDebitLocal) },
        { key:'adjustedCreditLocal', label:'Ajustado Haber', align:'right', render:(r)=>dual(r.adjustedCreditLocal) },
        { key:'incomeDebitLocal', label:'Resultado Debe', align:'right', render:(r)=>dual(r.incomeDebitLocal) },
        { key:'incomeCreditLocal', label:'Resultado Haber', align:'right', render:(r)=>dual(r.incomeCreditLocal) },
        { key:'balanceDebitLocal', label:'Balance Debe', align:'right', render:(r)=>dual(r.balanceDebitLocal) },
        { key:'balanceCreditLocal', label:'Balance Haber', align:'right', render:(r)=>dual(r.balanceCreditLocal) }
      ], rows:report.rows }) : EmptyState({ title:'Sin hoja de trabajo', description:'Registra asientos en Diario o ajustes de trabajo para generar la hoja.', iconName:'fa-table-columns' })}
      ${Section({ title:'Resumen de cierre', subtitle:'Resultado de trabajo; cualquier traslado a patrimonio debe contabilizarse en Libro Diario.', children:`<div class="cgx-metric-grid"><article class="cgx-metric"><div><p>Ingresos/Egresos</p><strong>${bs(report.totals.incomeCreditLocal - report.totals.incomeDebitLocal)}</strong><small>Estimación del período</small></div></article><article class="cgx-metric"><div><p>Balance general</p><strong>${bs(report.totals.balanceDebitLocal - report.totals.balanceCreditLocal)}</strong><small>Debe - Haber del balance</small></div></article><article class="cgx-metric"><div><p>Control</p><strong>${report.totals.checkLocal === 0 ? 'OK' : 'Revisar'}</strong><small>${bs(report.totals.checkLocal)}</small></div></article></div>` })}
    </section>`;
  },
  mount(state, { Store, Toast }) {
    mountSubmit('#worksheetAdjustmentForm', (data, form) => {
      const debit = Number(data.debit || 0); const credit = Number(data.credit || 0);
      if (!data.account) return Toast.show('Selecciona una cuenta.', 'warning');
      if ((debit <= 0 && credit <= 0) || (debit > 0 && credit > 0)) return Toast.show('El ajuste debe tener Debe o Haber, no ambos.', 'warning');
      Store.update((draft) => { draft.accounting = draft.accounting || {}; draft.accounting.adjustments = [{ id:uid('adj'), ...data, debit, credit, currency:'VES', postingState:'unposted_working_paper' }, ...(draft.accounting.adjustments || [])]; });
      Toast.show('Ajuste de trabajo agregado. NO se registró ningún asiento en Libro Diario.', 'warning'); form.reset();
    });
    qs('#btnDownloadWorksheet')?.addEventListener('click', () => { const r = buildWorksheet(Store.get()); downloadText('hoja-de-trabajo.csv', rowsToCsv(r.rows, [{label:'Cuenta',key:'account'},{label:'Tipo',key:'type'},{label:'B.Comp Debe',key:'tbDebitLocal'},{label:'B.Comp Haber',key:'tbCreditLocal'},{label:'Ajuste Debe',key:'adjDebitLocal'},{label:'Ajuste Haber',key:'adjCreditLocal'},{label:'Ajustado Debe',key:'adjustedDebitLocal'},{label:'Ajustado Haber',key:'adjustedCreditLocal'},{label:'Resultado Debe',key:'incomeDebitLocal'},{label:'Resultado Haber',key:'incomeCreditLocal'},{label:'Balance Debe',key:'balanceDebitLocal'},{label:'Balance Haber',key:'balanceCreditLocal'}]), 'text/csv;charset=utf-8'); Toast.show('Hoja de trabajo descargada; el archivo no constituye un asiento contabilizado.', 'success'); });
    qs('#btnPrintWorksheet')?.addEventListener('click', () => window.print());
  }
};
