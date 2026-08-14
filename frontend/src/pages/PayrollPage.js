import { PageHeader, Field, Select, Button, Badge, MetricGrid, EmptyState, ErpButton, ErpCard, ErpDataTable, ErpGrid, ErpRow, ErpSection } from '../components/ui/index.js';
import { bs, shortDate } from '../core/formatters.js';
import { calculatePayroll } from '../core/calculator.js';
import { escapeHtml, mountSubmit, qsa, today } from '../utils/dom.js';
import { PayrollService } from '../services/enterpriseOperationsService.js';

const safe=(value)=>escapeHtml(String(value??''));
const statusLabel=(status)=>({draft:'Borrador',approved:'Aprobado',paid:'Pagado',cancelled:'Cancelado'}[status]||status||'Borrador');
const statusValue=(label)=>({Borrador:'draft',Aprobado:'approved',Pagado:'paid',Cancelado:'cancelled'}[label]||label||'draft');
const payrollTone=(status)=>status==='Aprobado'||status==='Pagado'?'success':status==='Cancelado'?'danger':'warning';

function flattenPeriods(periods=[]){
  return periods.flatMap((period)=>(period.receipts||[]).map((receipt)=>({...receipt,periodId:period.id,period:period.period,status:statusLabel(period.status),date:receipt.date||receipt.createdAt,employerContributions:Number(receipt.employerContributions||0)})));
}

export const PayrollPage = {
  render(state,{query={}}={}) {
    const payroll=state.payroll||{records:[],employees:[],periods:[]};
    const records=payroll.records||[];
    const employees=payroll.employees||[];
    const periods=payroll.periods||[];
    const status=query.status||'all';
    const search=String(query.search||'').toLowerCase();
    const filtered=records.filter((record)=>{const employee=employees.find((item)=>item.id===record.employeeId);return (status==='all'||record.status===status)&&(!search||[record.employee,employee?.fullName,record.period,record.department].some((value)=>String(value||'').toLowerCase().includes(search)));});
    const totalNet=records.reduce((sum,record)=>sum+Number(record.result?.net||0),0);
    const totalGross=records.reduce((sum,record)=>sum+Number(record.result?.gross||0),0);
    const pendingPeriods=periods.filter((period)=>period.status==='draft').length;
    const employerCost=records.reduce((sum,record)=>sum+Number(record.result?.gross||0)+Number(record.employerContributions||0),0);
    const employeeOptions=employees.map((employee)=>({value:employee.id,label:`${employee.fullName} · ${employee.document||employee.idNumber||'sin documento'}`}));

    const employeeCards=employees.map((employee)=>ErpCard(`<div class="cg-ui-row"><span class="cgx-metric-icon"><i class="fa-solid fa-user-tie"></i></span><div class="cg-u-min-0"><p class="cg-ui-muted">${safe(employee.department||employee.position||'Personal')}</p><strong class="cg-ui-card-title">${safe(employee.fullName)}</strong><small>${safe(employee.position||'Sin cargo')} · ${safe(bs(employee.salary||0))}</small></div></div>`,{tag:'article'})).join('');
    const table=ErpDataTable({
      caption:'Recibos de nómina',
      columns:[
        {key:'date',label:'Fecha',render:(record)=>safe(shortDate(record.date))},
        {key:'employee',label:'Empleado',render:(record)=>{const employee=employees.find((item)=>item.id===record.employeeId)||{};return `<strong>${safe(employee.fullName||record.employee)}</strong><br><small>${safe(employee.department||record.department||employee.position||'')}</small>`;}},
        {key:'period',label:'Período',render:(record)=>safe(record.period||'')},
        {key:'gross',label:'Bruto',numeric:true,render:(record)=>safe(bs(record.result?.gross))},
        {key:'deductions',label:'Deducciones',numeric:true,render:(record)=>safe(bs(record.result?.totalDeductions))},
        {key:'net',label:'Neto',numeric:true,render:(record)=>safe(bs(record.result?.net))},
        {key:'status',label:'Estado',render:(record)=>Badge(record.status||'Borrador',payrollTone(record.status))},
        {key:'actions',label:'Acciones',render:(record)=>ErpRow(ErpButton('Avanzar período',{variant:'secondary',icon:'fa-solid fa-check-double',iconOnly:true,data:{'payroll-status':record.periodId,'payroll-current':statusValue(record.status)}})+ErpButton('Eliminar recibo',{variant:'danger',icon:'fa-solid fa-trash',iconOnly:true,data:{'delete-payroll':record.id,'payroll-period-status':statusValue(record.status)}}),{wrap:true})}
      ],rows:filtered
    });

    const employeeForm=`<form id="employeeForm" class="cg-ui-stack cg-ui-gap-sm">${Field({labelKey:'Nombre completo',name:'fullName',required:true})}${Field({labelKey:'Documento',name:'document',required:true})}${Field({labelKey:'Cargo',name:'position'})}${Field({labelKey:'Departamento',name:'department'})}${Field({labelKey:'Fecha de ingreso',name:'hiredAt',type:'date',value:today()})}${Field({labelKey:'Salario base',name:'salary',type:'number',attrs:'step="0.01" min="0"',value:'0'})}${Button({text:'Registrar empleado',icon:'fa-user-plus',type:'submit'})}</form>`;
    const payrollForm=`<form id="payrollForm" class="cg-ui-stack cg-ui-gap-sm">${Select({labelKey:'Empleado',name:'employeeId',options:employeeOptions})}${Field({labelKey:'Período',name:'period',placeholder:'2026-07-2Q',required:true})}${Field({labelKey:'Fecha',name:'date',type:'date',value:today()})}<div class="cg-ui-grid cg-ui-grid-two">${Field({labelKey:'Días',name:'days',type:'number',attrs:'min="0" max="31"',value:'30'})}${Field({labelKey:'Horas extra',name:'overtimeHours',type:'number',attrs:'step="0.01" min="0"',value:'0'})}${Field({labelKey:'Bonos',name:'bonus',type:'number',attrs:'step="0.01" min="0"',value:'0'})}${Field({labelKey:'Deducciones extra',name:'deductionsExtra',type:'number',attrs:'step="0.01" min="0"',value:'0'})}</div>${Field({labelKey:'Aportes patronales',name:'employerContributions',type:'number',attrs:'step="0.01" min="0"',value:'0'})}${Button({text:'Calcular y guardar',icon:'fa-calculator',type:'submit'})}</form>`;
    const toolbar=`<div class="cgx-toolbar"><strong>${filtered.length} recibos</strong><label><i class="fa-solid fa-magnifying-glass"></i><input type="search" data-query-param="search" value="${safe(query.search||'')}" placeholder="Buscar empleado o período"></label><select class="select" data-query-param="status"><option value="all">Todos</option>${['Borrador','Aprobado','Pagado','Cancelado'].map((value)=>`<option value="${value}" ${status===value?'selected':''}>${value}</option>`).join('')}</select><button type="button" class="btn btn-secondary" data-query-clear="search,status">Limpiar</button></div>`;

    return `<section class="cg-page-stack">${PageHeader({eyebrowKey:'payrollEyebrow',titleKey:'payrollTitle',descKey:'payrollDesc',actions:`${Button({id:'btnPayrollRefresh',text:'Actualizar',icon:'fa-rotate',variant:'secondary'})}${Button({id:'btnPayrollExport',text:'Exportar CSV',icon:'fa-file-csv',variant:'secondary'})}`})}${MetricGrid([
      {label:'Empleados',value:String(employees.length),iconName:'fa-users',tone:'neutral'},
      {label:'Bruto',value:bs(totalGross),iconName:'fa-money-bill-wave',tone:'brand'},
      {label:'Neto',value:bs(totalNet),iconName:'fa-sack-dollar',tone:'success'},
      {label:'Períodos borrador',value:String(pendingPeriods),hint:`Costo patronal ${bs(employerCost)}`,iconName:'fa-clock',tone:pendingPeriods?'warning':'success'}
    ])}${employees.length?ErpGrid(employeeCards,{columns:'four'}):EmptyState({title:'Sin empleados',description:'Registra el primer trabajador.',iconName:'fa-user-plus'})}<div class="cg-ui-grid cg-ui-grid-two">${ErpSection({title:'Nuevo empleado',description:'Ficha laboral para generar períodos.',content:employeeForm})}${ErpSection({title:'Generar recibo',description:'Crea o reutiliza un período en borrador.',content:payrollForm})}</div>${ErpSection({title:'Recibos y aprobación',description:'El período avanza Borrador → Aprobado → Pagado.',content:`${toolbar}${table}`})}</section>`;
  },
  mount(state,{Store,Toast,Loading}) {
    const load=async({silent=false}={})=>{try{if(!silent)Loading?.mount?.('Cargando nómina…');const [employees,periods]=await Promise.all([PayrollService.employees(),PayrollService.periods()]);Store.set({payroll:{...(Store.get().payroll||{}),employees,periods,records:flattenPeriods(periods)},payrollLoadedAt:new Date().toISOString()});}catch(error){Toast.show(`No se pudo cargar nómina: ${error.message}`,'error');}finally{if(!silent)Loading?.unmount?.();}};
    if(!state.payrollLoadedAt)load({silent:true});
    document.getElementById('btnPayrollRefresh')?.addEventListener('click',()=>load());
    mountSubmit('#employeeForm',async(data,form)=>{const submit=form.querySelector('[type="submit"]');submit?.setAttribute('disabled','disabled');try{const employee=await PayrollService.createEmployee(data);Store.update((draft)=>{draft.payroll=draft.payroll||{records:[],employees:[],periods:[]};draft.payroll.employees=[employee,...(draft.payroll.employees||[]).filter((item)=>item.id!==employee.id)];});form.reset();Toast.show('Empleado guardado en el servidor.','success');}catch(error){Toast.show(`No se registró el empleado: ${error.message}`,'error');}finally{submit?.removeAttribute('disabled');}});
    mountSubmit('#payrollForm',async(data,form)=>{const employee=(Store.get().payroll?.employees||[]).find((item)=>item.id===data.employeeId);if(!employee)return Toast.show('Selecciona un empleado.','error');const result=calculatePayroll({...data,salary:employee.salary});const submit=form.querySelector('[type="submit"]');submit?.setAttribute('disabled','disabled');try{await PayrollService.createReceipt({...data,gross:result.gross,deductions:result.totalDeductions,net:result.net,department:employee.department});form.reset();Toast.show(`Recibo guardado. Neto: ${bs(result.net)}`,'success');await load({silent:true});}catch(error){Toast.show(`No se guardó el recibo: ${error.message}`,'error');}finally{submit?.removeAttribute('disabled');}});
    qsa('[data-payroll-status]').forEach((button)=>button.addEventListener('click',async()=>{const current=button.dataset.payrollCurrent;const next=current==='draft'?'approved':current==='approved'?'paid':'draft';try{await PayrollService.setPeriodStatus(button.dataset.payrollStatus,next);Toast.show(`Período actualizado a ${statusLabel(next)}.`,'success');await load({silent:true});}catch(error){Toast.show(`No se actualizó el período: ${error.message}`,'error');}}));
    qsa('[data-delete-payroll]').forEach((button)=>button.addEventListener('click',async()=>{if(button.dataset.payrollPeriodStatus!=='draft')return Toast.show('Solo se eliminan recibos de períodos en borrador.','warning');try{await PayrollService.removeReceipt(button.dataset.deletePayroll);Toast.show('Recibo eliminado y período recalculado.','success');await load({silent:true});}catch(error){Toast.show(`No se eliminó el recibo: ${error.message}`,'error');}}));
    document.getElementById('btnPayrollExport')?.addEventListener('click',()=>{const rows=Store.get().payroll?.records||[];const csv=['date,period,employee,gross,deductions,net,status',...rows.map((row)=>[row.date,row.period,JSON.stringify(row.employee||''),row.result?.gross||0,row.result?.totalDeductions||0,row.result?.net||0,row.status].join(','))].join('\n');const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));link.download='nomina-contagest.csv';link.click();URL.revokeObjectURL(link.href);Toast.show('Nómina exportada.','success');});
  }
};
