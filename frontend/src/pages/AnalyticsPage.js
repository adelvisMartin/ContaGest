import { AnalyticsService } from '../services/analyticsService.js';
import { ExportService } from '../services/exportService.js';
import { PageHeader, Button, MetricGrid, ErpDataTable, ErpSection, EmptyState, Badge } from '../components/ui/index.js';
import { escapeHtml } from '../utils/dom.js';

const safe = (value) => escapeHtml(String(value ?? ''));
const formatDuration = (ms) => ms < 1000 ? `${ms} ms` : `${(ms/1000).toFixed(1)} s`;
const routeBar = (route, value, max, error = false) => `<button type="button" class="analytics-route-row ${error?'is-error':''}" data-analytics-route="${safe(route)}"><span>${safe(route)}</span><strong>${Number(value)||0}</strong><progress max="${Math.max(Number(max)||1,1)}" value="${Math.max(Number(value)||0,0)}" aria-label="${safe(route)} ${Number(value)||0}"></progress></button>`;

export const AnalyticsPage = {
  render(state, { query = {} } = {}) {
    const filters={ from:query.dateFrom,to:query.dateTo,type:query.type||'all',route:query.route||'all' };
    const events=AnalyticsService.filter(state,filters);
    const summary=AnalyticsService.summary(state,filters);
    const max=Math.max(...summary.topRoutes.map(([,value])=>value),1);
    const errorMax=Math.max(...summary.errorRoutes.map(([,value])=>value),1);
    const eventTypes=[...new Set((state.analytics?.events||[]).map((event)=>event.type).filter(Boolean))].sort();
    const routes=[...new Set((state.analytics?.events||[]).map((event)=>event.route).filter(Boolean))].sort();

    const table=ErpDataTable({
      caption:'Actividad del sistema',
      columns:[
        {key:'createdAt',label:'Fecha',render:(event)=>safe(event.createdAt?.replace('T',' ').slice(0,19)||'-')},
        {key:'type',label:'Tipo',render:(event)=>Badge(event.type,event.type==='runtime_error'?'danger':event.type==='business_action'?'success':'brand')},
        {key:'route',label:'Ruta',render:(event)=>`<code>${safe(event.route||'-')}</code>`},
        {key:'viewport',label:'Dispositivo',render:(event)=>safe(event.viewport||'-')},
        {key:'detail',label:'Detalle',render:(event)=>safe(event.payload?.message||event.payload?.action||event.payload?.title||'-')},
        {key:'sessionId',label:'Sesión',render:(event)=>safe(event.sessionId||'-')}
      ],
      rows:events.slice(0,40)
    });

    const toolbar=`<section class="cgx-toolbar"><strong>Filtros</strong><label>Desde<input class="input" type="date" data-query-param="dateFrom" value="${safe(query.dateFrom||'')}"></label><label>Hasta<input class="input" type="date" data-query-param="dateTo" value="${safe(query.dateTo||'')}"></label><select class="select" data-query-param="type"><option value="all">Todos los eventos</option>${eventTypes.map((value)=>`<option value="${safe(value)}" ${filters.type===value?'selected':''}>${safe(value)}</option>`).join('')}</select><select class="select" data-query-param="route"><option value="all">Todas las rutas</option>${routes.map((value)=>`<option value="${safe(value)}" ${filters.route===value?'selected':''}>${safe(value)}</option>`).join('')}</select><button type="button" class="btn btn-secondary" data-query-clear="dateFrom,dateTo,type,route">Limpiar</button></section>`;

    return `<section class="cg-page-stack analytics-page">${PageHeader({eyebrowKey:'analyticsEyebrow',titleKey:'analyticsTitle',descKey:'analyticsDesc',actions:`${Button({id:'btnAnalyticsFlush',text:'Sincronizar',icon:'fa-cloud-arrow-up',variant:'secondary'})}${Button({id:'btnExportAnalytics',text:'Exportar XLSX',icon:'fa-file-excel',variant:'secondary'})}${Button({id:'btnClearAnalytics',text:'Limpiar local',icon:'fa-trash',variant:'danger'})}`})}${toolbar}${MetricGrid([
      {label:'Eventos',value:summary.totalEvents,hint:'Según filtros',iconName:'fa-chart-line',tone:'brand'},
      {label:'Sesiones',value:summary.uniqueSessions,hint:'Sesiones únicas',iconName:'fa-users-viewfinder',tone:'success'},
      {label:'Tiempo promedio',value:formatDuration(summary.averagePageMs),hint:'Permanencia por página',iconName:'fa-stopwatch',tone:'brand'},
      {label:'Errores',value:summary.errors,hint:summary.errors?'Requieren revisión':'Sin errores registrados',iconName:'fa-triangle-exclamation',tone:summary.errors?'danger':'success'},
      {label:'Acciones',value:summary.actions,hint:'Operaciones registradas',iconName:'fa-bolt',tone:'warning'},
      {label:'Sincronización',value:summary.backendEnabled?'Activa':'Local',hint:summary.lastFlushAt?`Último envío ${summary.lastFlushAt.slice(11,19)}`:'Sin envío',iconName:'fa-cloud',tone:summary.backendEnabled?'success':'neutral'}
    ])}<div class="cgx-dashboard-grid-secondary">${ErpSection({title:'Rutas más visitadas',description:'Abre el módulo para revisar su uso.',content:`<div class="analytics-bars">${summary.topRoutes.length?summary.topRoutes.map(([route,value])=>routeBar(route,value,max)).join(''):EmptyState({title:'Sin visitas',description:'No hay navegación registrada en el período.',iconName:'fa-route'})}</div>`})}${ErpSection({title:'Errores por ruta',description:'Ayuda a priorizar las pantallas que requieren revisión.',content:`<div class="analytics-bars">${summary.errorRoutes.length?summary.errorRoutes.map(([route,value])=>routeBar(route,value,errorMax,true)).join(''):EmptyState({title:'Sin errores',description:'No se registraron excepciones para los filtros.',iconName:'fa-circle-check'})}</div>`})}</div>${ErpSection({title:'Actividad reciente',description:'Se muestran hasta 40 eventos. Exporta el archivo para consultar el detalle completo.',content:table})}${ErpSection({title:'Privacidad y sincronización',description:'La analítica permanece local salvo activación explícita del envío al backend.',content:`<label class="cg-check-row"><input id="analyticsBackendToggle" type="checkbox" ${summary.backendEnabled?'checked':''}><span>Enviar eventos técnicos al backend de la empresa</span></label><p class="cg-ui-muted">No se utilizan cookies publicitarias. La telemetría operativa se limita a la información necesaria para rendimiento, auditoría y diagnóstico.</p>`})}</section>`;
  },
  mount(state,{Store,Toast,navigate}) {
    document.querySelectorAll('[data-analytics-route]').forEach((button)=>button.addEventListener('click',()=>navigate(button.dataset.analyticsRoute)));
    document.getElementById('analyticsBackendToggle')?.addEventListener('change',(event)=>{AnalyticsService.setBackendEnabled(event.target.checked);Toast.show(event.target.checked?'Sincronización analítica activada.':'Analítica conservada localmente.','success');Store.set({analytics:{...Store.get().analytics,lastEventAt:Store.get().analytics?.lastEventAt}});});
    document.getElementById('btnAnalyticsFlush')?.addEventListener('click',async()=>{try{await AnalyticsService.flush();Toast.show('Eventos sincronizados.','success');}catch(error){Toast.show(`No se pudo sincronizar: ${error.message}`,'error');}});
    document.getElementById('btnExportAnalytics')?.addEventListener('click',async()=>{await ExportService.downloadXlsx('analytics-contagest',[{name:'Eventos',rows:state.analytics?.events||[]},{name:'Rutas',rows:Object.entries(state.analytics?.visits||{}).map(([route,visits])=>({route,visits}))}],'Analítica ContaGest-VE');Toast.show('Analítica exportada.','success');});
    document.getElementById('btnClearAnalytics')?.addEventListener('click',()=>{if(!confirm('¿Eliminar la analítica almacenada localmente?'))return;Store.update((draft)=>{draft.analytics={events:[],visits:{},sessions:[],lastEventAt:null};});Toast.show('Analítica local eliminada.','success');});
  }
};
