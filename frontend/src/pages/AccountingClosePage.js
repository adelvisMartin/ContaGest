import { PageHeader, MetricGrid, Section, DataTable, Button, Badge, Field } from '../components/ui/index.js';
import { bs } from '../core/formatters.js';
import { mountSubmit, uid, today } from '../utils/dom.js';
import { buildFinancialStatements } from '../services/accountingReportsService.js';

export const AccountingClosePage = {
  render(state) {
    const statements = buildFinancialStatements(state);
    const periods = state.accounting?.periods || [];
    return `<section class="cgx-page accounting-report-page">
      ${PageHeader({ eyebrow:'Contabilidad', title:'Cierre contable y períodos', description:'Controla períodos abiertos/cerrados, bloquea registros y documenta el traslado de resultado al patrimonio.', actions:Button({ id:'btnSuggestClosingEntry', text:'Ver asiento sugerido', icon:'fa-wand-magic-sparkles', variant:'secondary' }) })}
      ${MetricGrid([
        { label:'Resultado a cerrar', value:bs(statements.netIncome), hint:'Desde estados financieros', iconName:'fa-chart-line', tone:statements.netIncome >= 0 ? 'success' : 'warning' },
        { label:'Períodos registrados', value:String(periods.length), hint:'Abiertos/cerrados', iconName:'fa-calendar-check', tone:'brand' },
        { label:'Control balance', value:bs(statements.balanceCheck), hint:'Debe ser cero', iconName:'fa-scale-balanced', tone:Math.abs(statements.balanceCheck) < 0.01 ? 'success' : 'danger' },
        { label:'Estado recomendado', value:Math.abs(statements.balanceCheck) < 0.01 ? 'Listo' : 'Revisar', hint:'Antes de cierre', iconName:'fa-lock', tone:Math.abs(statements.balanceCheck) < 0.01 ? 'success' : 'danger' }
      ])}
      ${Section({ title:'Crear período contable', subtitle:'Define período y estado para controlar modificaciones.', children:`<form id="periodForm" class="cg-record-form"><div class="cg-record-fields cg-fields-compact">${Field({ labelKey:'Código período', name:'code', value:new Date().toISOString().slice(0,7) })}${Field({ labelKey:'Desde', name:'from', type:'date', value:today().slice(0,8)+'01' })}${Field({ labelKey:'Hasta', name:'to', type:'date', value:today() })}${Field({ labelKey:'Responsable', name:'owner', placeholder:'Contador / administrador' })}</div><div class="cg-record-actions">${Button({ text:'Guardar período', icon:'fa-floppy-disk', type:'submit' })}</div></form>` })}
      ${DataTable({ columns:[{ key:'code', label:'Período' },{ key:'from', label:'Desde' },{ key:'to', label:'Hasta' },{ key:'owner', label:'Responsable' },{ key:'status', label:'Estado', render:(r)=>Badge(r.status || 'abierto', r.status === 'cerrado' ? 'success' : 'warning') }], rows:periods, empty:'Sin períodos configurados' })}
      ${Section({ title:'Asiento de cierre sugerido', subtitle:'Guía para trasladar resultado del período. El asiento definitivo debe registrarse en Libro Diario.', children:`<div id="closingSuggestion" class="cg-ledger-live-preview"><table class="cg-ledger-mini"><thead><tr><th>Cuenta</th><th>Debe</th><th>Haber</th><th>Nota</th></tr></thead><tbody><tr><td>${statements.netIncome >= 0 ? 'Ventas / ingresos' : 'Resultado acumulado'}</td><td>${statements.netIncome >= 0 ? bs(Math.abs(statements.netIncome)) : '-'}</td><td>${statements.netIncome < 0 ? bs(Math.abs(statements.netIncome)) : '-'}</td><td>Cancelación de resultado</td></tr><tr><td>${statements.netIncome >= 0 ? 'Resultado acumulado' : 'Gastos / costos'}</td><td>${statements.netIncome < 0 ? bs(Math.abs(statements.netIncome)) : '-'}</td><td>${statements.netIncome >= 0 ? bs(Math.abs(statements.netIncome)) : '-'}</td><td>Traslado a patrimonio</td></tr></tbody></table></div>` })}
    </section>`;
  },
  mount(state, { Store, Toast }) {
    mountSubmit('#periodForm', (data, form) => { Store.update((draft) => { draft.accounting = draft.accounting || {}; draft.accounting.periods = [{ id:uid('period'), status:'abierto', ...data }, ...(draft.accounting.periods || [])]; }); Toast.show('Período contable guardado.', 'success'); form.reset(); });
    document.getElementById('btnSuggestClosingEntry')?.addEventListener('click', () => Toast.show('El asiento sugerido está abajo. Regístralo en Libro Diario cuando el balance esté cuadrado.', 'success'));
  }
};
