import { DS } from '../components/ui/index.js';
import { bs } from '../core/formatters.js';
import { ExportService } from '../services/exportService.js';

export const HrDashboardPage = {
  render(state) {
    const records = state.payroll?.records || [];
    const gross = records.reduce((s, r) => s + Number(r.result?.gross || 0), 0);
    const net = records.reduce((s, r) => s + Number(r.result?.net || 0), 0);
    const deductions = records.reduce((s, r) => s + Number(r.result?.totalDeductions || 0), 0);
    const rows = records.slice(0, 12).map((r) => ({ empleado: r.employee, fecha: r.date, bruto: bs(r.result?.gross), deducciones: bs(r.result?.totalDeductions), neto: bs(r.result?.net) }));
    return DS.ResourcePage({
      title: 'Recursos Humanos & Nómina',
      subtitle: 'KPIs de nómina, incidencias, obligaciones laborales y parámetros vigentes.',
      actions: '<button id="btnHrXlsx" class="ds-btn ds-btn-primary"><span class="material-symbols-outlined">download</span>XLSX</button><button id="btnHrPdf" class="ds-btn ds-btn-secondary"><span class="material-symbols-outlined">picture_as_pdf</span>PDF fiscal</button>',
      kpis: [
        { label: 'Recibos', value: records.length, sub: 'Procesados', iconName: 'receipt_long', tone: 'info' },
        { label: 'Bruto', value: bs(gross), sub: 'Período', iconName: 'payments', tone: 'neutral' },
        { label: 'Deducciones', value: bs(deductions), sub: 'Trabajador / legales', iconName: 'remove_circle', tone: 'warning' },
        { label: 'Neto', value: bs(net), sub: 'Por pagar', iconName: 'account_balance_wallet', tone: 'success' }
      ],
      columns: [{key:'empleado',label:'Empleado'}, {key:'fecha',label:'Fecha'}, {key:'bruto',label:'Bruto'}, {key:'deducciones',label:'Deducciones'}, {key:'neto',label:'Neto'}],
      rows
    }) + `<section class="pl-card pl-card-pad mt-6"><h3 class="text-2xl font-black">Parámetros laborales versionados</h3><p class="subtitle mt-2">IVSS, FAOV, INCES, vacaciones, utilidades y prestaciones se manejan por vigencia para evitar cálculos obsoletos.</p><div class="mt-4 grid gap-3 md:grid-cols-3"><div class="pl-card pl-card-pad"><strong>IVSS</strong><p>Empleado y patronal por vigencia</p></div><div class="pl-card pl-card-pad"><strong>FAOV</strong><p>Empleado y patronal por vigencia</p></div><div class="pl-card pl-card-pad"><strong>LOTTT</strong><p>Prestaciones, vacaciones y utilidades</p></div></div></section>`;
  },
  mount(state, { Toast }) {
    const rows = (state.payroll?.records || []).map((r) => ({ empleado: r.employee, fecha: r.date, bruto: r.result?.gross, deducciones: r.result?.totalDeductions, neto: r.result?.net }));
    document.getElementById('btnHrXlsx')?.addEventListener('click', async () => { await ExportService.downloadXlsx('rrhh-nomina-contagest', [{ name: 'Nómina', rows }], 'RRHH y Nómina'); Toast.show('XLSX de RRHH solicitado.', 'success'); });
    document.getElementById('btnHrPdf')?.addEventListener('click', async () => { await ExportService.downloadFiscalPdf('rrhh-nomina-contagest', { title: 'Resumen de nómina', rows }); Toast.show('PDF fiscal server-side solicitado.', 'info'); });
  }
};
