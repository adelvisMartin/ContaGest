import { PageHeader, MetricGrid, Section, DataTable, Button, Badge } from '../components/ui/index.js';
import { bs } from '../core/formatters.js';
import { downloadText, qs } from '../utils/dom.js';
import { buildFinancialStatements, rowsToCsv } from '../services/accountingReportsService.js';

export const FinancialStatementsPage = {
  render(state) {
    const report = buildFinancialStatements(state);
    return `<section class="cgx-page accounting-report-page">
      ${PageHeader({ eyebrow:'Contabilidad', title:'Estados financieros', description:'Genera borrador operativo de estado de resultados y balance general desde la hoja de trabajo.', actions:`${Button({ id:'btnDownloadStatements', text:'Descargar CSV', icon:'fa-download' })}${Button({ id:'btnPrintStatements', text:'Imprimir estados', icon:'fa-print', variant:'secondary' })}` })}
      ${MetricGrid([
        { label:'Ingresos', value:bs(report.revenue), hint:'Estado de resultados', iconName:'fa-arrow-trend-up', tone:'success' },
        { label:'Egresos / costos', value:bs(report.expenses), hint:'Estado de resultados', iconName:'fa-arrow-trend-down', tone:'warning' },
        { label:'Resultado neto', value:bs(report.netIncome), hint:'Utilidad o pérdida', iconName:'fa-chart-line', tone:report.netIncome >= 0 ? 'success' : 'danger' },
        { label:'Chequeo balance', value:bs(report.balanceCheck), hint:'Activo - Pasivo - Patrimonio - Resultado', iconName:'fa-scale-balanced', tone:Math.abs(report.balanceCheck) < 0.01 ? 'success' : 'danger' }
      ])}
      <div class="cgx-grid-2">
        ${Section({ title:'Estado de resultados', subtitle:'Ingresos, costos y gastos del período.', children:DataTable({ columns:[{ key:'account', label:'Cuenta' },{ key:'type', label:'Tipo' },{ key:'incomeDebitLocal', label:'Debe', align:'right', render:(r)=>bs(r.incomeDebitLocal) },{ key:'incomeCreditLocal', label:'Haber', align:'right', render:(r)=>bs(r.incomeCreditLocal) }], rows:report.incomeRows, empty:'Sin cuentas de resultado' }) + `<div class="cg-statement-total"><span>Resultado neto</span><strong>${bs(report.netIncome)}</strong></div>` })}
        ${Section({ title:'Balance general', subtitle:'Activo, pasivo y patrimonio con resultado del período.', children:DataTable({ columns:[{ key:'account', label:'Cuenta' },{ key:'type', label:'Tipo' },{ key:'balanceDebitLocal', label:'Debe', align:'right', render:(r)=>bs(r.balanceDebitLocal) },{ key:'balanceCreditLocal', label:'Haber', align:'right', render:(r)=>bs(r.balanceCreditLocal) }], rows:report.balanceRows, empty:'Sin cuentas patrimoniales' }) + `<div class="cg-statement-total"><span>Activo</span><strong>${bs(report.assets)}</strong></div><div class="cg-statement-total"><span>Pasivo + patrimonio + resultado</span><strong>${bs(report.liabilities + report.equity + report.netIncome)}</strong></div>${Math.abs(report.balanceCheck) < 0.01 ? Badge('Balance cuadrado','success') : Badge('Balance con diferencia','danger')}` })}
      </div>
    </section>`;
  },
  mount(state, { Store, Toast }) {
    qs('#btnDownloadStatements')?.addEventListener('click', () => { const r = buildFinancialStatements(Store.get()); const rows = [...r.incomeRows.map(x=>({ section:'Estado de resultados', ...x })), ...r.balanceRows.map(x=>({ section:'Balance general', ...x }))]; downloadText('estados-financieros.csv', rowsToCsv(rows, [{label:'Sección',key:'section'},{label:'Cuenta',key:'account'},{label:'Tipo',key:'type'},{label:'Debe resultado',key:'incomeDebitLocal'},{label:'Haber resultado',key:'incomeCreditLocal'},{label:'Debe balance',key:'balanceDebitLocal'},{label:'Haber balance',key:'balanceCreditLocal'}]), 'text/csv;charset=utf-8'); Toast.show('Estados financieros descargados.', 'success'); });
    qs('#btnPrintStatements')?.addEventListener('click', () => window.print());
  }
};
