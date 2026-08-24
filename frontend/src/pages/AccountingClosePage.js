import { PageHeader, MetricGrid, Section, DataTable, Button, Badge, Field, EmptyState } from '../components/ui/index.js';
import { bs } from '../core/formatters.js';
import { mountSubmit, qsa } from '../utils/dom.js';
import { buildFinancialStatements } from '../services/accountingReportsService.js';
import { BackendApi } from '../services/backendApi.js';

const statusLabel=(status)=>status==='closed'?'Cerrado':'Abierto';
const periodCode=()=>new Date().toISOString().slice(0,7);
let periodsLoadPromise=null;

export const AccountingClosePage = {
  render(state) {
    const statements = buildFinancialStatements(state);
    const periods = state.accounting?.periods || [];
    const openCount=periods.filter((item)=>item.status!=='closed').length;
    const closedCount=periods.filter((item)=>item.status==='closed').length;
    const rows=periods.map((period)=>({
      ...period,
      period:period.period||period.code,
      statusCell:Badge(statusLabel(period.status),period.status==='closed'?'success':'warning'),
      closedAt:period.closedAt?new Date(period.closedAt).toLocaleString('es-VE'):'—',
      actions:period.status==='closed'?Badge('Bloqueado','success'):Button({text:'Cerrar período',icon:'fa-lock',variant:'danger',attrs:`type="button" data-close-period="${period.id}"`})
    }));
    return `<section class="cg-page-stack accounting-report-page">
      ${PageHeader({ eyebrow:'Contabilidad', title:'Cierre contable y períodos', description:'El cierre se persiste por empresa y bloquea nuevos asientos del período en el backend. Las correcciones posteriores deben registrarse en un período abierto mediante reverso o ajuste.', actions:`${Button({ id:'btnClosingRefresh', text:'Actualizar', icon:'fa-rotate', variant:'secondary' })}${Button({ id:'btnSuggestClosingEntry', text:'Ver asiento sugerido', icon:'fa-wand-magic-sparkles', variant:'secondary' })}` })}
      ${MetricGrid([
        { label:'Resultado a cerrar', value:bs(statements.netIncome), hint:'Desde estados financieros', iconName:'fa-chart-line', tone:statements.netIncome >= 0 ? 'success' : 'warning' },
        { label:'Períodos abiertos', value:String(openCount), hint:`${closedCount} cerrados`, iconName:'fa-calendar-check', tone:openCount?'warning':'success' },
        { label:'Control balance', value:bs(statements.balanceCheck), hint:'Debe ser cero antes de cerrar', iconName:'fa-scale-balanced', tone:Math.abs(statements.balanceCheck) < 0.01 ? 'success' : 'danger' },
        { label:'Estado recomendado', value:Math.abs(statements.balanceCheck) < 0.01 ? 'Listo' : 'Revisar', hint:'Validación previa', iconName:'fa-lock', tone:Math.abs(statements.balanceCheck) < 0.01 ? 'success' : 'danger' }
      ])}
      ${Section({ title:'Registrar período contable', subtitle:'Un período se crea abierto. El cierre posterior es irreversible desde esta interfaz y queda auditado en el servidor.', children:`<form id="periodForm" class="cg-record-form"><div class="cg-record-fields cg-fields-compact">${Field({ labelKey:'Código período', name:'period', value:periodCode(), required:true, attrs:'pattern="\\d{4}-\\d{2}" placeholder="AAAA-MM"' })}${Field({ labelKey:'Nota / responsable', name:'note', placeholder:'Cierre mensual · Contador responsable', className:'cg-field-wide' })}</div><div class="cg-record-actions">${Button({ text:'Crear período abierto', icon:'fa-calendar-plus', type:'submit' })}</div></form>` })}
      ${periods.length?DataTable({ columns:[{ key:'period', label:'Período' },{ key:'note', label:'Nota', render:(r)=>r.note||'—' },{ key:'statusCell', label:'Estado', render:(r)=>r.statusCell },{ key:'closedAt', label:'Cerrado el', render:(r)=>r.closedAt },{ key:'actions', label:'Acción', render:(r)=>r.actions }], rows }):EmptyState({title:'Sin períodos configurados',description:'Crea el primer período contable antes de ejecutar un cierre.',iconName:'fa-calendar-plus'})}
      ${Section({ title:'Asiento de cierre sugerido', subtitle:'Guía visual para trasladar el resultado. El asiento definitivo debe registrarse en Libro Diario antes de cerrar el período.', children:`<div id="closingSuggestion" class="cgx-table-wrap"><table class="cgx-table cg-ledger-mini"><thead><tr><th>Cuenta</th><th>Debe</th><th>Haber</th><th>Nota</th></tr></thead><tbody><tr><td>${statements.netIncome >= 0 ? 'Ventas / ingresos' : 'Resultado acumulado'}</td><td>${statements.netIncome >= 0 ? bs(Math.abs(statements.netIncome)) : '-'}</td><td>${statements.netIncome < 0 ? bs(Math.abs(statements.netIncome)) : '-'}</td><td>Cancelación de resultado</td></tr><tr><td>${statements.netIncome >= 0 ? 'Resultado acumulado' : 'Gastos / costos'}</td><td>${statements.netIncome < 0 ? bs(Math.abs(statements.netIncome)) : '-'}</td><td>${statements.netIncome >= 0 ? bs(Math.abs(statements.netIncome)) : '-'}</td><td>Traslado a patrimonio</td></tr></tbody></table></div>` })}
    </section>`;
  },
  mount(state, { Store, Toast, Loading, Modal }) {
    const load=({silent=false}={})=>{
      if(periodsLoadPromise)return periodsLoadPromise;
      periodsLoadPromise=(async()=>{
        try{
          if(!silent)Loading?.mount?.('Cargando períodos contables…');
          const periods=await BackendApi.get('/accounting/closing-periods');
          Store.update((draft)=>{draft.accounting=draft.accounting||{};draft.accounting.periods=periods||[];draft.accounting.periodsLoaded=true;});
          return periods||[];
        }catch(error){
          Toast.show(`No se cargaron los períodos: ${error.message}`,'error');
          throw error;
        }finally{
          if(!silent)Loading?.unmount?.();
          periodsLoadPromise=null;
        }
      })();
      return periodsLoadPromise;
    };
    if(!state.accounting?.periodsLoaded)void load({silent:true}).catch(()=>undefined);
    document.getElementById('btnClosingRefresh')?.addEventListener('click',()=>void load().catch(()=>undefined));
    mountSubmit('#periodForm',async(data,form)=>{const submit=form.querySelector('[type="submit"]');submit?.setAttribute('disabled','disabled');try{await BackendApi.post('/accounting/closing-periods',{period:data.period,note:data.note||''});Toast.show('Período contable creado en estado abierto.','success');form.reset();if(form.elements.period)form.elements.period.value=periodCode();await load({silent:true});}catch(error){Toast.show(`No se creó el período: ${error.message}`,'error');}finally{submit?.removeAttribute('disabled');}});
    qsa('[data-close-period]').forEach((button)=>button.addEventListener('click',()=>{
      const period=(Store.get().accounting?.periods||[]).find((item)=>item.id===button.dataset.closePeriod);
      if(!period)return;
      if(Math.abs(buildFinancialStatements(Store.get()).balanceCheck)>=0.01)return Toast.show('El balance no cuadra. Corrige las diferencias antes del cierre.','error');
      Modal.confirm({
        title:`Cerrar período ${period.period}`,
        body:'El backend bloqueará nuevos asientos en este período. No existe reapertura automática desde esta pantalla; una corrección posterior debe ir a un período abierto mediante reverso o ajuste autorizado.',
        confirmText:'Cerrar período',
        onConfirm:async()=>{try{await BackendApi.post(`/accounting/closing-periods/${period.id}/close`,{note:period.note||''});Toast.show(`Período ${period.period} cerrado y bloqueado.`, 'success');await load({silent:true});}catch(error){Toast.show(`No se cerró el período: ${error.message}`,'error');}}
      });
    }));
    document.getElementById('btnSuggestClosingEntry')?.addEventListener('click', () => Toast.show('El asiento sugerido está abajo. Regístralo en Libro Diario antes de cerrar el período.', 'success'));
  }
};
