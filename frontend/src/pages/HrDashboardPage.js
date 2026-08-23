import { PageHeader, MetricGrid, Button, Badge, ErpDataTable, ErpGrid, ErpSection } from '../components/ui/index.js';
import { bs } from '../core/formatters.js';
import { ExportService } from '../services/exportService.js';
import { escapeHtml } from '../utils/dom.js';

const safe=(value)=>escapeHtml(String(value??''));

export const HrDashboardPage = {
  render(state) {
    const records = state.payroll?.records || [];
    const gross = records.reduce((sum, record) => sum + Number(record.result?.gross || 0), 0);
    const net = records.reduce((sum, record) => sum + Number(record.result?.net || 0), 0);
    const deductions = records.reduce((sum, record) => sum + Number(record.result?.totalDeductions || 0), 0);
    const rows = records.slice(0, 50);
    const payrollTable=ErpDataTable({
      caption:'Resumen de recibos de nómina',
      columns:[
        {key:'employee',label:'Empleado',render:(record)=>safe(record.employee||record.employeeName||'—')},
        {key:'date',label:'Fecha',render:(record)=>safe(record.date||'—')},
        {key:'gross',label:'Bruto',numeric:true,render:(record)=>safe(bs(record.result?.gross||0))},
        {key:'deductions',label:'Deducciones',numeric:true,render:(record)=>safe(bs(record.result?.totalDeductions||0))},
        {key:'net',label:'Neto',numeric:true,render:(record)=>`<strong>${safe(bs(record.result?.net||0))}</strong>`}
      ],rows
    });
    const parameterCards=[
      ['IVSS','Empleado y patronal por vigencia','fa-shield-heart'],
      ['FAOV','Empleado y patronal por vigencia','fa-house'],
      ['LOTTT','Prestaciones, vacaciones y utilidades','fa-scale-balanced']
    ].map(([title,description,icon])=>ErpSection({tag:'article',title,description,actions:Badge('Versionado','brand'),content:`<span class="cgx-metric-icon"><i class="fa-solid ${icon}" aria-hidden="true"></i></span>`})).join('');

    return `<section class="cg-page-stack">
      ${PageHeader({eyebrow:'RRHH',title:'Recursos Humanos y Nómina',description:'Indicadores laborales derivados de los recibos disponibles y parámetros versionados por vigencia.',actions:`${Button({id:'btnHrXlsx',text:'Exportar XLSX',icon:'fa-file-excel'})}${Button({id:'btnHrPdf',text:'PDF fiscal',icon:'fa-file-pdf',variant:'secondary'})}`})}
      ${MetricGrid([
        {label:'Recibos',value:String(records.length),hint:'Registros disponibles',iconName:'fa-receipt',tone:'neutral'},
        {label:'Bruto',value:bs(gross),hint:'Total evaluado',iconName:'fa-money-bill-wave',tone:'brand'},
        {label:'Deducciones',value:bs(deductions),hint:'Trabajador / legales',iconName:'fa-minus-circle',tone:'warning'},
        {label:'Neto',value:bs(net),hint:'Total por pagar',iconName:'fa-wallet',tone:'success'}
      ])}
      ${ErpSection({title:'Resumen de nómina',description:'Esta vista resume recibos existentes; la aprobación y pago de períodos se realiza en el módulo Nómina.',content:payrollTable})}
      ${ErpSection({title:'Parámetros laborales versionados',description:'IVSS, FAOV, INCES, vacaciones, utilidades y prestaciones deben resolverse por fecha de vigencia. Ningún porcentaje mostrado por el sistema debe asumirse vigente sin su versión efectiva.',content:ErpGrid(parameterCards,{columns:'three'})})}
    </section>`;
  },
  mount(state, { Toast }) {
    const exportRows = () => (state.payroll?.records || []).map((record) => ({
      empleado:record.employee||record.employeeName||'',
      fecha:record.date,
      bruto:record.result?.gross,
      deducciones:record.result?.totalDeductions,
      neto:record.result?.net
    }));
    document.getElementById('btnHrXlsx')?.addEventListener('click', async () => {
      await ExportService.downloadXlsx('rrhh-nomina-contagest', [{ name:'Nómina', rows:exportRows() }], 'RRHH y Nómina');
      Toast.show('XLSX de RRHH solicitado.', 'success');
    });
    document.getElementById('btnHrPdf')?.addEventListener('click', async () => {
      await ExportService.downloadFiscalPdf('rrhh-nomina-contagest', { title:'Resumen de nómina', rows:exportRows() });
      Toast.show('PDF de resumen de nómina solicitado al backend.', 'info');
    });
  }
};
