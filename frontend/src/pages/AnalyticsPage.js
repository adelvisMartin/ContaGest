import { AnalyticsService } from '../services/analyticsService.js';
import { ExportService } from '../services/exportService.js';
import { PageHeader, Button, MetricGrid, Section, Table, Badge, EmptyState } from '../components/ui/index.js';
import { escapeHtml } from '../utils/dom.js';

const safeWidth = (value, max) => Math.max(5, (value / Math.max(max, 1)) * 100);
const bar = (label, value, max, tone = '') => `<button type="button" class="analytics-route-row ${tone}" data-analytics-route="${escapeHtml(label)}"><span>${escapeHtml(label)}</span><strong>${value}</strong><i style="width:${safeWidth(value,max)}%"></i></button>`;
const formatDuration = (ms) => ms < 1000 ? `${ms} ms` : `${(ms/1000).toFixed(1)} s`;

export const AnalyticsPage = {
  render(state, { query = {} } = {}) {
    const filters = { from:query.dateFrom, to:query.dateTo, type:query.type || 'all', route:query.route || 'all' };
    const events = AnalyticsService.filter(state, filters);
    const summary = AnalyticsService.summary(state, filters);
    const max = Math.max(...summary.topRoutes.map(([,value])=>value),1);
    const errorMax = Math.max(...summary.errorRoutes.map(([,value])=>value),1);
    const eventTypes = [...new Set((state.analytics?.events || []).map((event)=>event.type).filter(Boolean))].sort();
    const routes = [...new Set((state.analytics?.events || []).map((event)=>event.route).filter(Boolean))].sort();
    const rows = events.slice(0,40).map((event)=>`<tr><td>${escapeHtml(event.createdAt?.replace('T',' ').slice(0,19)||'-')}</td><td>${Badge(event.type,event.type==='runtime_error'?'danger':event.type==='business_action'?'success':'brand')}</td><td><code>${escapeHtml(event.route||'-')}</code></td><td>${escapeHtml(event.viewport||'-')}</td><td>${escapeHtml(event.payload?.message||event.payload?.action||event.payload?.title||'-')}</td><td>${escapeHtml(event.sessionId||'-')}</td></tr>`);

    return `<section class="cg-page-stack analytics-page">
      ${PageHeader({eyebrow:'Analítica interna',title:'Uso, rendimiento y errores',description:'Sesiones, navegación, acciones empresariales, tiempos de página y errores sin rastreadores externos.',actions:`${Button({id:'btnAnalyticsFlush',text:'Sincronizar',icon:'fa-cloud-arrow-up',variant:'secondary'})}${Button({id:'btnExportAnalytics',text:'Exportar XLSX',icon:'fa-file-excel',variant:'secondary'})}${Button({id:'btnClearAnalytics',text:'Limpiar local',icon:'fa-trash',variant:'danger'})}`})}
      <section class="cgx-toolbar"><strong>Filtros</strong><label>Desde<input class="input" type="date" data-query-param="dateFrom" value="${escapeHtml(query.dateFrom||'')}"></label><label>Hasta<input class="input" type="date" data-query-param="dateTo" value="${escapeHtml(query.dateTo||'')}"></label><select class="select" data-query-param="type"><option value="all">Todos los eventos</option>${eventTypes.map((value)=>`<option value="${escapeHtml(value)}" ${filters.type===value?'selected':''}>${escapeHtml(value)}</option>`).join('')}</select><select class="select" data-query-param="route"><option value="all">Todas las rutas</option>${routes.map((value)=>`<option value="${escapeHtml(value)}" ${filters.route===value?'selected':''}>${escapeHtml(value)}</option>`).join('')}</select><button type="button" class="btn btn-secondary" data-query-clear="dateFrom,dateTo,type,route">Limpiar</button></section>
      ${MetricGrid([
        {label:'Eventos',value:summary.totalEvents,hint:'Según filtros',iconName:'fa-chart-line',tone:'brand'},
        {label:'Sesiones',value:summary.uniqueSessions,hint:'Sesiones únicas',iconName:'fa-users-viewfinder',tone:'success'},
        {label:'Tiempo promedio',value:formatDuration(summary.averagePageMs),hint:'Permanencia por página',iconName:'fa-stopwatch',tone:'brand'},
        {label:'Errores',value:summary.errors,hint:summary.errors?'Requieren revisión':'Sin errores registrados',iconName:'fa-triangle-exclamation',tone:summary.errors?'danger':'success'},
        {label:'Acciones',value:summary.actions,hint:'Operaciones auditadas',iconName:'fa-bolt',tone:'warning'},
        {label:'Backend',value:summary.backendEnabled?'Activo':'Local',hint:summary.lastFlushAt?`Último envío ${summary.lastFlushAt.slice(11,19)}`:'Sin envío',iconName:'fa-cloud',tone:summary.backendEnabled?'success':'neutral'}
      ])}
      <section class="cgx-dashboard-grid-secondary">
        ${Section({title:'Rutas más visitadas',subtitle:'Navega al módulo para revisar la experiencia.',children:`<div class="analytics-bars">${summary.topRoutes.length?summary.topRoutes.map(([route,value])=>bar(route,value,max)).join(''):EmptyState({title:'Sin visitas',description:'Todavía no hay navegación en el período.',iconName:'fa-route'})}</div>`})}
        ${Section({title:'Errores por ruta',subtitle:'Priorización de pantallas con fallos de runtime.',children:`<div class="analytics-bars">${summary.errorRoutes.length?summary.errorRoutes.map(([route,value])=>bar(route,value,errorMax,'is-error')).join(''):EmptyState({title:'Sin errores',description:'No se registraron excepciones para los filtros.',iconName:'fa-circle-check'})}</div>`})}
      </section>
      ${Section({title:'Bitácora de eventos',subtitle:'Máximo 40 eventos visibles; exporta para el detalle completo.',children:Table({headers:[{label:'Fecha'},{label:'Tipo'},{label:'Ruta'},{label:'Viewport'},{label:'Detalle'},{label:'Sesión'}],rows,emptyKey:'Sin eventos para los filtros.'})})}
      <section class="cgx-section"><header class="cgx-section-head"><div><h2>Privacidad y sincronización</h2><p>La analítica permanece local salvo activación explícita del envío al backend.</p></div><label class="cg-check-row"><input id="analyticsBackendToggle" type="checkbox" ${summary.backendEnabled?'checked':''}><span>Enviar eventos técnicos al backend del tenant</span></label></header><div class="cgx-section-body"><p>No se usan cookies publicitarias. Los eventos contienen ruta, viewport, sesión técnica y usuario autenticado para auditoría interna.</p></div></section>
    </section>`;
  },
  mount(state,{Store,Toast,navigate}) {
    document.querySelectorAll('[data-analytics-route]').forEach((button)=>button.addEventListener('click',()=>navigate(button.dataset.analyticsRoute)));
    document.getElementById('analyticsBackendToggle')?.addEventListener('change',(event)=>{AnalyticsService.setBackendEnabled(event.target.checked);Toast.show(event.target.checked?'Sincronización analítica activada.':'Analítica conservada solo localmente.','success');Store.set({analytics:{...Store.get().analytics,lastEventAt:Store.get().analytics?.lastEventAt}});});
    document.getElementById('btnAnalyticsFlush')?.addEventListener('click',async()=>{try{await AnalyticsService.flush();Toast.show('Eventos sincronizados.','success');}catch(error){Toast.show(`No se pudo sincronizar: ${error.message}`,'error');}});
    document.getElementById('btnExportAnalytics')?.addEventListener('click',async()=>{await ExportService.downloadXlsx('analytics-contagest',[{name:'Eventos',rows:state.analytics?.events||[]},{name:'Rutas',rows:Object.entries(state.analytics?.visits||{}).map(([route,visits])=>({route,visits}))}],'Analítica interna ContaGest-VE');Toast.show('Analítica exportada.','success');});
    document.getElementById('btnClearAnalytics')?.addEventListener('click',()=>{if(!confirm('¿Eliminar la analítica almacenada localmente?'))return;Store.update((draft)=>{draft.analytics={events:[],visits:{},sessions:[],lastEventAt:null};});Toast.show('Analítica local eliminada.','success');});
  }
};
