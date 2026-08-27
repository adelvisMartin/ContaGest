import { PageHeader, MetricGrid, Section, DataTable, Button, Badge, Field, EmptyState, Select } from '../components/ui/index.js';
import { bs } from '../core/formatters.js';
import { mountSubmit, qsa } from '../utils/dom.js';
import { buildFinancialStatements } from '../services/accountingReportsService.js';
import { BackendApi } from '../services/backendApi.js';
import { FiscalService, FISCAL_MODULES } from '../services/fiscalService.js';

const statusLabel=(status)=>status==='closed'?'Cerrado':'Abierto';
const periodCode=()=>new Date().toISOString().slice(0,7);
let periodsLoadPromise=null;
let fiscalLoadPromise=null;

export const AccountingClosePage = {
  render(state) {
    const statements = buildFinancialStatements(state);
    const periods = state.accounting?.periods || [];
    const fiscal=state.fiscalGovernance||{periods:[],capabilities:{}};
    const openCount=periods.filter((item)=>item.status!=='closed').length;
    const closedCount=periods.filter((item)=>item.status==='closed').length;
    const rows=periods.map((period)=>({
      ...period,
      period:period.period||period.code,
      statusCell:Badge(statusLabel(period.status),period.status==='closed'?'success':'warning'),
      closedAt:period.closedAt?new Date(period.closedAt).toLocaleString('es-VE'):'—',
      actions:period.status==='closed'?Badge('Bloqueado','success'):Button({text:'Cerrar período',icon:'fa-lock',variant:'danger',attrs:`type="button" data-close-period="${period.id}"`})
    }));
    const fiscalRows=(fiscal.periods||[]).map((item)=>({
      ...item,
      statusCell:Badge(statusLabel(item.status),item.status==='closed'?'success':'warning'),
      closedAt:item.closedAt?new Date(item.closedAt).toLocaleString('es-VE'):'—',
      actions:item.status==='closed'?(fiscal.capabilities?.reopen?Button({text:'Reabrir',icon:'fa-lock-open',variant:'secondary',attrs:`type="button" data-fiscal-reopen="${item.id}"`}):Badge('Sin permiso de reapertura','neutral')):(fiscal.capabilities?.close?Button({text:'Cerrar',icon:'fa-lock',variant:'danger',attrs:`type="button" data-fiscal-close="${item.id}"`}):Badge('Solo lectura','neutral'))
    }));
    const fiscalContent=fiscal.denied?`<div class="cg-ui-row-wrap">${Badge('PERMISSION DENIED','danger')}<span class="cg-ui-muted">Tu sesión no posee fiscal.read. El servidor no expone períodos fiscales.</span></div>`:`${fiscal.capabilities?.close?`<form id="fiscalPeriodForm" class="cg-record-form"><div class="cg-record-fields cg-fields-compact">${Field({labelKey:'Período fiscal',name:'period',value:periodCode(),required:true,attrs:'pattern="\\d{4}-\\d{2}"'})}${Select({labelKey:'Módulo fiscal',name:'module',options:FISCAL_MODULES})}${Field({labelKey:'Nota',name:'note',placeholder:'Responsable / alcance del período'})}</div><div class="cg-record-actions">${Button({text:'Crear período fiscal abierto',icon:'fa-calendar-plus',type:'submit'})}</div></form>`:''}${fiscalRows.length?DataTable({columns:[{key:'period',label:'Período'},{key:'module',label:'Módulo'},{key:'statusCell',label:'Estado',render:(r)=>r.statusCell},{key:'closedAt',label:'Último cierre',render:(r)=>r.closedAt},{key:'note',label:'Nota / motivo',render:(r)=>r.note||'—'},{key:'actions',label:'Acción',render:(r)=>r.actions}],rows:fiscalRows}):EmptyState({title:'Sin períodos fiscales',description:fiscal.capabilities?.close?'Crea un período abierto antes de cerrarlo.':'No hay períodos visibles para esta sesión.',iconName:'fa-receipt'})}`;
    return `<section class="cg-page-stack accounting-report-page">
      ${PageHeader({ eyebrow:'Contabilidad', title:'Cierres contables y fiscales', description:'Los cierres se persisten por empresa con workflows separados. Reabrir fiscal nunca reabre automáticamente el ledger contable.', actions:`${Button({ id:'btnClosingRefresh', text:'Actualizar', icon:'fa-rotate', variant:'secondary' })}${Button({ id:'btnSuggestClosingEntry', text:'Ver asiento sugerido', icon:'fa-wand-magic-sparkles', variant:'secondary' })}` })}
      ${MetricGrid([
        { label:'Resultado a cerrar', value:bs(statements.netIncome), hint:'Desde estados financieros', iconName:'fa-chart-line', tone:statements.netIncome >= 0 ? 'success' : 'warning' },
        { label:'Períodos abiertos', value:String(openCount), hint:`${closedCount} cerrados`, iconName:'fa-calendar-check', tone:openCount?'warning':'success' },
        { label:'Control balance', value:bs(statements.balanceCheck), hint:'Debe ser cero antes de cerrar', iconName:'fa-scale-balanced', tone:Math.abs(statements.balanceCheck) < 0.01 ? 'success' : 'danger' },
        { label:'Estado recomendado', value:Math.abs(statements.balanceCheck) < 0.01 ? 'Listo' : 'Revisar', hint:'Validación previa', iconName:'fa-lock', tone:Math.abs(statements.balanceCheck) < 0.01 ? 'success' : 'danger' }
      ])}
      ${Section({ title:'Registrar período contable', subtitle:'Un período se crea abierto. El cierre posterior bloquea posting en el backend y queda auditado.', children:`<form id="periodForm" class="cg-record-form"><div class="cg-record-fields cg-fields-compact">${Field({ labelKey:'Código período', name:'period', value:periodCode(), required:true, attrs:'pattern="\\d{4}-\\d{2}" placeholder="AAAA-MM"' })}${Field({ labelKey:'Nota / responsable', name:'note', placeholder:'Cierre mensual · Contador responsable', className:'cg-field-wide' })}</div><div class="cg-record-actions">${Button({ text:'Crear período abierto', icon:'fa-calendar-plus', type:'submit' })}</div></form>` })}
      ${periods.length?DataTable({ columns:[{ key:'period', label:'Período' },{ key:'note', label:'Nota', render:(r)=>r.note||'—' },{ key:'statusCell', label:'Estado', render:(r)=>r.statusCell },{ key:'closedAt', label:'Cerrado el', render:(r)=>r.closedAt },{ key:'actions', label:'Acción', render:(r)=>r.actions }], rows }):EmptyState({title:'Sin períodos configurados',description:'Crea el primer período contable antes de ejecutar un cierre.',iconName:'fa-calendar-plus'})}
      ${Section({title:'Gobierno fiscal',subtitle:fiscal.denied?'Acceso fiscal denegado por RBAC.':`Permisos servidor · cerrar: ${fiscal.capabilities?.close?'sí':'no'} · reabrir: ${fiscal.capabilities?.reopen?'sí':'no'} · documentos: ${fiscal.capabilities?.manageDocuments?'sí':'no'}.`,children:fiscalContent})}
      ${Section({ title:'Asiento de cierre sugerido', subtitle:'Guía visual para trasladar el resultado. El asiento definitivo debe registrarse en Libro Diario antes de cerrar el período.', children:`<div id="closingSuggestion" class="cgx-table-wrap"><table class="cgx-table cg-ledger-mini"><thead><tr><th>Cuenta</th><th>Debe</th><th>Haber</th><th>Nota</th></tr></thead><tbody><tr><td>${statements.netIncome >= 0 ? 'Ventas / ingresos' : 'Resultado acumulado'}</td><td>${statements.netIncome >= 0 ? bs(Math.abs(statements.netIncome)) : '-'}</td><td>${statements.netIncome < 0 ? bs(Math.abs(statements.netIncome)) : '-'}</td><td>Cancelación de resultado</td></tr><tr><td>${statements.netIncome >= 0 ? 'Resultado acumulado' : 'Gastos / costos'}</td><td>${statements.netIncome < 0 ? bs(Math.abs(statements.netIncome)) : '-'}</td><td>${statements.netIncome >= 0 ? bs(Math.abs(statements.netIncome)) : '-'}</td><td>Traslado a patrimonio</td></tr></tbody></table></div>` })}
    </section>`;
  },
  mount(state, { Store, Toast, Loading, Modal }) {
    const loadAccounting=({silent=false}={})=>{
      if(periodsLoadPromise)return periodsLoadPromise;
      periodsLoadPromise=(async()=>{try{if(!silent)Loading?.mount?.('Cargando períodos contables…');const periods=await BackendApi.get('/accounting/closing-periods');Store.update((draft)=>{draft.accounting=draft.accounting||{};draft.accounting.periods=periods||[];draft.accounting.periodsLoaded=true;});return periods||[];}catch(error){Toast.show(`No se cargaron los períodos: ${error.message}`,'error');throw error;}finally{if(!silent)Loading?.unmount?.();periodsLoadPromise=null;}})();return periodsLoadPromise;
    };
    const loadFiscal=({silent=false}={})=>{
      if(fiscalLoadPromise)return fiscalLoadPromise;
      fiscalLoadPromise=(async()=>{try{if(!silent)Loading?.mount?.('Cargando gobierno fiscal…');const result=await FiscalService.periods();Store.set({fiscalGovernance:{...result,denied:false,loaded:true}});return result;}catch(error){if(error.status===403){Store.set({fiscalGovernance:{periods:[],capabilities:{},denied:true,loaded:true}});return null;}Toast.show(`No se cargó fiscal: ${error.message}`,'error');throw error;}finally{if(!silent)Loading?.unmount?.();fiscalLoadPromise=null;}})();return fiscalLoadPromise;
    };
    const loadAll=async({silent=false}={})=>Promise.allSettled([loadAccounting({silent}),loadFiscal({silent})]);
    if(!state.accounting?.periodsLoaded||!state.fiscalGovernance?.loaded)void loadAll({silent:true});
    document.getElementById('btnClosingRefresh')?.addEventListener('click',()=>void loadAll());
    mountSubmit('#periodForm',async(data,form)=>{const submit=form.querySelector('[type="submit"]');submit?.setAttribute('disabled','disabled');try{await BackendApi.post('/accounting/closing-periods',{period:data.period,note:data.note||''});Toast.show('Período contable creado en estado abierto.','success');form.reset();if(form.elements.period)form.elements.period.value=periodCode();await loadAccounting({silent:true});}catch(error){Toast.show(`No se creó el período: ${error.message}`,'error');}finally{submit?.removeAttribute('disabled');}});
    mountSubmit('#fiscalPeriodForm',async(data,form)=>{try{await FiscalService.createPeriod({period:data.period,module:data.module,note:data.note||''});Toast.show('Período fiscal creado abierto.','success');form.reset();if(form.elements.period)form.elements.period.value=periodCode();await loadFiscal({silent:true});}catch(error){Toast.show(`No se creó el período fiscal: ${error.message}`,'error');}});
    qsa('[data-close-period]').forEach((button)=>button.addEventListener('click',()=>{const period=(Store.get().accounting?.periods||[]).find((item)=>item.id===button.dataset.closePeriod);if(!period)return;if(Math.abs(buildFinancialStatements(Store.get()).balanceCheck)>=0.01)return Toast.show('El balance no cuadra. Corrige las diferencias antes del cierre.','error');Modal.confirm({title:`Cerrar período ${period.period}`,body:'El backend bloqueará nuevos asientos en este período. Las correcciones posteriores deben ir a un período abierto mediante reverso o ajuste autorizado.',confirmText:'Cerrar período',onConfirm:async()=>{try{await BackendApi.post(`/accounting/closing-periods/${period.id}/close`,{note:period.note||''});Toast.show(`Período ${period.period} cerrado y bloqueado.`,'success');await loadAccounting({silent:true});}catch(error){Toast.show(`No se cerró el período: ${error.message}`,'error');}}});}));
    qsa('[data-fiscal-close]').forEach((button)=>button.addEventListener('click',()=>{const period=(Store.get().fiscalGovernance?.periods||[]).find((item)=>item.id===button.dataset.fiscalClose);if(!period)return;Modal.confirm({title:`Cerrar ${period.module} · ${period.period}`,body:'El servidor bloqueará nuevos documentos fiscales compatibles con este módulo/período. El cierre contable no cambia.',confirmText:'Cerrar fiscal',onConfirm:async()=>{try{await FiscalService.closePeriod({period:period.period,module:period.module,note:period.note||''});Toast.show('Período fiscal cerrado y auditado.','success');await loadFiscal({silent:true});}catch(error){Toast.show(`No se cerró fiscal: ${error.message}`,'error');}}});}));
    qsa('[data-fiscal-reopen]').forEach((button)=>button.addEventListener('click',async()=>{const period=(Store.get().fiscalGovernance?.periods||[]).find((item)=>item.id===button.dataset.fiscalReopen);if(!period)return;const reason=window.prompt(`Motivo obligatorio para reabrir ${period.module} ${period.period}:`,'Corrección autorizada con expediente');if(!reason||reason.trim().length<5)return Toast.show('La reapertura exige un motivo de al menos 5 caracteres.','warning');try{await FiscalService.reopenPeriod({period:period.period,module:period.module,reason:reason.trim()});Toast.show('Período fiscal reabierto; la transición quedó auditada.','success');await loadFiscal({silent:true});}catch(error){Toast.show(`No se reabrió fiscal: ${error.message}`,'error');}}));
    document.getElementById('btnSuggestClosingEntry')?.addEventListener('click', () => Toast.show('El asiento sugerido está abajo. Regístralo en Libro Diario antes de cerrar el período.', 'success'));
  }
};
