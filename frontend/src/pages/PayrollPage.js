import { PageHeader, Field, Select, Button, Table, Badge, StatCard, EmptyState } from '../components/ui/index.js';
import { bs, shortDate } from '../core/formatters.js';
import { calculatePayroll } from '../core/calculator.js';
import { escapeHtml, mountSubmit, qsa, uid, today } from '../utils/dom.js';

const payrollTone = (status) => status === 'Aprobado' ? 'success' : status === 'Rechazado' ? 'danger' : status === 'En revisión' ? 'warning' : 'neutral';

export const PayrollPage = {
  render(state, { query = {} } = {}) {
    const payroll = state.payroll || { records:[], employees:[] };
    const records = payroll.records || [];
    const employees = payroll.employees || [];
    const status = query.status || 'all';
    const search = String(query.search || '').toLowerCase();
    const filtered = records.filter((record)=>{
      const employee=employees.find((item)=>item.id===record.employeeId);
      return (status==='all'||record.status===status) && (!search||[record.employee,employee?.fullName,record.period,record.department].some((value)=>String(value||'').toLowerCase().includes(search)));
    });
    const totalNet = records.reduce((sum,record)=>sum+Number(record.result?.net||0),0);
    const totalGross = records.reduce((sum,record)=>sum+Number(record.result?.gross||0),0);
    const pending = records.filter((record)=>record.status!=='Aprobado').length;
    const employerCost = records.reduce((sum,record)=>sum+Number(record.result?.gross||0)+Number(record.employerContributions||0),0);
    const employeeOptions = employees.map((employee)=>({value:employee.id,label:`${employee.fullName} · ${employee.document||'sin documento'}`}));
    const rows = filtered.map((record)=>{
      const employee=employees.find((item)=>item.id===record.employeeId)||{};
      return `<tr><td>${shortDate(record.date)}</td><td><strong>${escapeHtml(employee.fullName||record.employee)}</strong><br><small>${escapeHtml(employee.department||record.department||'')}</small></td><td>${escapeHtml(record.period||'')}</td><td class="cg-cell-money">${bs(record.result?.gross)}</td><td class="cg-cell-money">${bs(record.result?.totalDeductions)}</td><td class="cg-cell-money">${bs(record.result?.net)}</td><td>${Badge(record.status||'Borrador',payrollTone(record.status))}</td><td><div class="cg-row-actions"><button class="btn btn-secondary !p-2" data-payroll-status="${record.id}" aria-label="Cambiar estado"><i class="fa-solid fa-check-double"></i></button><button class="btn btn-danger !p-2" data-delete-payroll="${record.id}" aria-label="Eliminar"><i class="fa-solid fa-trash"></i></button></div></td></tr>`;
    });
    const employeeCards=employees.map((employee)=>`<article class="cgx-metric"><div class="cgx-metric-icon"><i class="fa-solid fa-user-tie"></i></div><div><p>${escapeHtml(employee.department||'Personal')}</p><strong>${escapeHtml(employee.fullName)}</strong><small>${escapeHtml(employee.position||'Sin cargo')} · ${bs(employee.salary||0)}</small></div></article>`).join('');

    return `<section class="cg-page-stack">
      ${PageHeader({eyebrow:'RRHH y nómina',title:'Nómina por períodos',description:'Empleados, incidencias, deducciones, aprobación y contabilización.',actions:`${Button({id:'btnPayrollExport',text:'Exportar CSV',icon:'fa-file-csv',variant:'secondary'})}`})}
      <div class="grid gap-3 md:grid-cols-4">${StatCard({label:'Empleados',value:String(employees.length),icon:'fa-users'})}${StatCard({label:'Bruto',value:bs(totalGross),icon:'fa-money-bill-wave'})}${StatCard({label:'Neto',value:bs(totalNet),icon:'fa-sack-dollar',tone:'accent'})}${StatCard({label:'Pendientes',value:String(pending),hint:`Costo patronal ${bs(employerCost)}`,icon:'fa-clock',tone:pending?'warning':'success'})}</div>
      <section class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">${employeeCards || EmptyState({title:'Sin empleados',description:'Registra el primer trabajador.',iconName:'fa-user-plus'})}</section>
      <div class="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div class="grid gap-4">
          <form id="employeeForm" class="cgx-section"><header class="cgx-section-head"><div><h2>Nuevo empleado</h2><p>Ficha mínima laboral para generar períodos.</p></div></header><div class="cgx-section-body grid gap-3">${Field({labelKey:'Nombre completo',name:'fullName',required:true})}${Field({labelKey:'Documento',name:'document',required:true})}${Field({labelKey:'Cargo',name:'position'})}${Field({labelKey:'Departamento',name:'department'})}${Field({labelKey:'Fecha de ingreso',name:'hiredAt',type:'date',value:today()})}${Field({labelKey:'Salario base',name:'salary',type:'number',attrs:'step="0.01" min="0"',value:'0'})}${Button({text:'Registrar empleado',icon:'fa-user-plus',type:'submit'})}</div></form>
          <form id="payrollForm" class="cgx-section"><header class="cgx-section-head"><div><h2>Generar recibo</h2><p>Calcula incidencias y deja el registro en borrador.</p></div></header><div class="cgx-section-body grid gap-3">${Select({labelKey:'Empleado',name:'employeeId',options:employeeOptions})}${Field({labelKey:'Período',name:'period',placeholder:'2026-07-2Q',required:true})}${Field({labelKey:'Fecha',name:'date',type:'date',value:today()})}<div class="grid grid-cols-2 gap-3">${Field({labelKey:'Días',name:'days',type:'number',attrs:'min="0" max="31"',value:'30'})}${Field({labelKey:'Horas extra',name:'overtimeHours',type:'number',attrs:'step="0.01" min="0"',value:'0'})}${Field({labelKey:'Bonos',name:'bonus',type:'number',attrs:'step="0.01" min="0"',value:'0'})}${Field({labelKey:'Deducciones extra',name:'deductionsExtra',type:'number',attrs:'step="0.01" min="0"',value:'0'})}</div>${Field({labelKey:'Aportes patronales',name:'employerContributions',type:'number',attrs:'step="0.01" min="0"',value:'0'})}${Button({text:'Calcular recibo',icon:'fa-calculator',type:'submit'})}</div></form>
        </div>
        <section class="cgx-section"><header class="cgx-section-head"><div><h2>Recibos y aprobación</h2><p>Un clic avanza Borrador → En revisión → Aprobado.</p></div></header><div class="cgx-section-body"><div class="cgx-toolbar"><strong>${filtered.length} recibos</strong><label><i class="fa-solid fa-magnifying-glass"></i><input type="search" data-query-param="search" value="${escapeHtml(query.search||'')}" placeholder="Buscar empleado o período"></label><select class="select" data-query-param="status"><option value="all">Todos</option>${['Borrador','En revisión','Aprobado','Rechazado'].map((value)=>`<option value="${value}" ${status===value?'selected':''}>${value}</option>`).join('')}</select><button type="button" class="btn btn-secondary" data-query-clear="search,status">Limpiar</button></div>${Table({headers:[{label:'Fecha'},{label:'Empleado'},{label:'Período'},{label:'Bruto'},{label:'Deducciones'},{label:'Neto'},{label:'Estado'},{label:'Acciones'}],rows})}</div></section>
      </div>
    </section>`;
  },
  mount(state,{Store,Toast}) {
    mountSubmit('#employeeForm',(data,form)=>{
      Store.update((draft)=>{draft.payroll=draft.payroll||{records:[],employees:[]};draft.payroll.employees=draft.payroll.employees||[];draft.payroll.employees.push({id:uid('emp'),...data,salary:Number(data.salary||0),status:'Activo',createdAt:new Date().toISOString()});});
      form.reset();Toast.show('Empleado registrado.','success');
    });
    mountSubmit('#payrollForm',(data,form)=>{
      const employee=(Store.get().payroll?.employees||[]).find((item)=>item.id===data.employeeId);
      if(!employee)return Toast.show('Selecciona un empleado.','error');
      const calculation={...data,salary:employee.salary};
      const result=calculatePayroll(calculation);
      Store.update((draft)=>{draft.payroll.records=draft.payroll.records||[];draft.payroll.records.unshift({id:uid('pay'),...data,employee:employee.fullName,department:employee.department,salary:employee.salary,employerContributions:Number(data.employerContributions||0),status:'Borrador',result,createdAt:new Date().toISOString()});});
      form.reset();Toast.show(`Recibo calculado. Neto: ${bs(result.net)}`,'success');
    });
    qsa('[data-payroll-status]').forEach((button)=>button.addEventListener('click',()=>Store.update((draft)=>{const record=(draft.payroll?.records||[]).find((item)=>item.id===button.dataset.payrollStatus);if(!record)return;record.status=record.status==='Borrador'?'En revisión':record.status==='En revisión'?'Aprobado':'Borrador';record.approvedAt=record.status==='Aprobado'?new Date().toISOString():null;})));
    qsa('[data-delete-payroll]').forEach((button)=>button.addEventListener('click',()=>Store.update((draft)=>{draft.payroll.records=(draft.payroll?.records||[]).filter((item)=>item.id!==button.dataset.deletePayroll);})));
    document.getElementById('btnPayrollExport')?.addEventListener('click',()=>{
      const rows=Store.get().payroll?.records||[];
      const csv=['date,period,employee,gross,deductions,net,status',...rows.map((row)=>[row.date,row.period,JSON.stringify(row.employee||''),row.result?.gross||0,row.result?.totalDeductions||0,row.result?.net||0,row.status].join(','))].join('\n');
      const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));link.download='nomina-contagest.csv';link.click();URL.revokeObjectURL(link.href);Toast.show('Nómina exportada.','success');
    });
  }
};
