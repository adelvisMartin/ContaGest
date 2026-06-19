import { PageHeader, Field, Button, Table, StatCard } from '../components/ui/index.js';
import { bs, shortDate } from '../core/formatters.js';
import { calculatePayroll } from '../core/calculator.js';
import { escapeHtml, mountSubmit, qsa, uid, today } from '../utils/dom.js';

export const PayrollPage = {
  render(state) {
    const totalNet = state.payroll.records.reduce((s, r) => s + Number(r.result?.net || 0), 0);
    const totalGross = state.payroll.records.reduce((s, r) => s + Number(r.result?.gross || 0), 0);
    const rows = state.payroll.records.map((r) => `<tr><td>${shortDate(r.date)}</td><td>${escapeHtml(r.employee)}</td><td>${bs(r.result.gross)}</td><td>${bs(r.result.totalDeductions)}</td><td>${bs(r.result.net)}</td><td><button class="btn btn-danger !p-2" data-delete-payroll="${r.id}"><i class="fa-solid fa-trash"></i></button></td></tr>`);
    return `<section class="surface rounded-[1.75rem] p-5 sm:p-7">${PageHeader({ eyebrowKey:'payrollEyebrow', titleKey:'payrollTitle', descKey:'payrollDesc' })}
      <div class="mb-5 grid gap-4 md:grid-cols-3">${StatCard({label:'Recibos', value:String(state.payroll.records.length), icon:'fa-receipt'})}${StatCard({label:'Bruto', value:bs(totalGross), icon:'fa-money-bill-wave'})}${StatCard({label:'Neto', value:bs(totalNet), icon:'fa-sack-dollar', tone:'accent'})}</div>
      <div class="grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
        <form id="payrollForm" class="panel-soft grid gap-4 rounded-[1.5rem] p-4 sm:grid-cols-2">
          ${Field({ labelKey:'date', name:'date', type:'date', value:today() })}${Field({ labelKey:'employee', name:'employee', required:true })}${Field({ labelKey:'salary', name:'salary', type:'number', attrs:'step="0.01"', value:'0' })}${Field({ labelKey:'days', name:'days', type:'number', value:'30' })}${Field({ labelKey:'overtimeHours', name:'overtimeHours', type:'number', attrs:'step="0.01"', value:'0' })}${Field({ labelKey:'bonus', name:'bonus', type:'number', attrs:'step="0.01"', value:'0' })}${Field({ labelKey:'deductionsExtra', name:'deductionsExtra', type:'number', attrs:'step="0.01"', value:'0' })}<div class="sm:col-span-2">${Button({ text:'Calcular recibo', i18n:'add', icon:'fa-calculator' })}</div>
        </form>
        <div class="panel-soft rounded-[1.5rem] p-4">${Table({ headers:[{key:'date'}, {key:'employee'}, {label:'Bruto'}, {label:'Deducciones'}, {label:'Neto'}, {key:'actions'}], rows })}</div>
      </div>
    </section>`;
  },
  mount(state, { Store, Toast }) {
    mountSubmit('#payrollForm', (data, form) => { const result = calculatePayroll(data); Store.update((draft) => { draft.payroll.records.unshift({ id:uid('pay'), ...data, result }); }); form.reset(); Toast.show(`Recibo calculado. Neto: ${bs(result.net)}`, 'success'); });
    qsa('[data-delete-payroll]').forEach((button) => button.addEventListener('click', () => Store.update((draft) => { draft.payroll.records = draft.payroll.records.filter((item) => item.id !== button.dataset.deletePayroll); })));
  }
};
