import { AnalyticsService } from '../services/analyticsService.js';
import { ExportService } from '../services/exportService.js';
import { PageHeader, Button, MetricGrid, Section, Table, Badge } from '../components/ui/index.js';

const safeWidth = (value, max) => Math.max(6, (value / Math.max(max, 1)) * 100);
const bar = (label, value, max) => `<div class="analytics-route-row"><span>${label}</span><strong>${value}</strong><i style="width:${safeWidth(value, max)}%"></i></div>`;

export const AnalyticsPage = {
  render(state) {
    const summary = AnalyticsService.summary(state);
    const max = Math.max(...summary.topRoutes.map(([, v]) => v), 1);
    const rows = (state.analytics?.events || []).slice(0, 18).map((event) => `<tr>
      <td>${event.createdAt?.replace('T',' ').slice(0,19) || '-'}</td>
      <td>${Badge(event.type, 'brand')}</td>
      <td><code>${event.route || '-'}</code></td>
      <td>${event.viewport || '-'}</td>
      <td>${event.sessionId || '-'}</td>
    </tr>`);
    return `<section class="cgx-page analytics-page">
      ${PageHeader({
        eyebrow:'Analítica interna',
        title:'Control y estadísticas de visitas',
        description:'Registro local y sincronizable de sesiones, rutas visitadas, acciones y tiempos de uso dentro del sistema.',
        actions: `${Button({ id:'btnExportAnalytics', label:'Exportar XLSX', iconName:'fa-file-excel', variant:'secondary' })}${Button({ id:'btnClearAnalytics', label:'Limpiar local', iconName:'fa-trash', variant:'danger' })}`,
        meta:['Privacidad local', 'Multi-tenant ready', 'Sin cookies externas']
      })}
      ${MetricGrid([
        { label:'Eventos', value:summary.totalEvents, hint:'Total almacenado localmente', iconName:'fa-chart-line', tone:'brand' },
        { label:'Hoy', value:summary.todayEvents, hint:'Eventos del día', iconName:'fa-calendar-day', tone:'success' },
        { label:'Sesiones', value:summary.uniqueSessions, hint:'Sesiones detectadas', iconName:'fa-users-viewfinder', tone:'brand' },
        { label:'Último evento', value:summary.lastEventAt ? summary.lastEventAt.slice(11,19) : '-', hint:summary.lastEventAt ? summary.lastEventAt.slice(0,10) : 'Pendiente', iconName:'fa-clock', tone:'warning' }
      ])}
      <section class="cgx-dashboard-grid-secondary">
        ${Section({ title:'Rutas más visitadas', subtitle:'Distribución de navegación del usuario y pantallas de mayor uso.', children:`<div class="analytics-bars">${summary.topRoutes.length ? summary.topRoutes.map(([route, value]) => bar(route, value, max)).join('') : '<div class="cgx-empty">Sin visitas registradas todavía.</div>'}</div>` })}
        ${Section({ title:'Privacidad y alcance', subtitle:'Analítica técnica para mejorar UX y estabilidad sin rastreo externo.', children:`<div class="cgx-timeline"><article><span class="cgx-timeline-dot"></span><div><strong>Multi-tenant ready</strong><p>Preparado para sincronizar con backend por empresa.</p></div></article><article><span class="cgx-timeline-dot"></span><div><strong>No usa cookies externas</strong><p>Registra rutas, sesión técnica y viewport.</p></div></article><article><span class="cgx-timeline-dot"></span><div><strong>Uso interno</strong><p>Sirve para medir pantallas lentas y mejorar UX.</p></div></article></div>` })}
      </section>
      ${Section({ title:'Últimos eventos', subtitle:'Bitácora de navegación y acciones internas.', children:Table({ headers:[{label:'Fecha'}, {label:'Tipo'}, {label:'Ruta'}, {label:'Viewport'}, {label:'Sesión'}], rows, emptyKey:'Sin eventos.' }) })}
    </section>`;
  },
  mount(state, { Store, Toast }) {
    document.getElementById('btnExportAnalytics')?.addEventListener('click', async () => {
      await ExportService.downloadXlsx('analytics-contagest', [{ name: 'Eventos', rows: state.analytics?.events || [] }, { name: 'Rutas', rows: Object.entries(state.analytics?.visits || {}).map(([route, visits]) => ({ route, visits })) }], 'Analítica interna ContaGest-VE');
      Toast.show('Analítica exportada.', 'success');
    });
    document.getElementById('btnClearAnalytics')?.addEventListener('click', () => {
      Store.update((draft) => { draft.analytics = { events: [], visits: {}, sessions: [], lastEventAt: null }; return draft; });
      Toast.show('Analítica local limpiada.', 'success');
    });
  }
};
