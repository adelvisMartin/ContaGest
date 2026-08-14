import { PageHeader, Button, Badge, ErpCard, ErpDataTable, ErpGrid, ErpSection, ErpStack } from '../components/ui/index.js';
import { escapeHtml } from '../utils/dom.js';
import { RegulatoryFeedService, REGULATORY_SOURCES } from '../services/regulatoryFeedService.js';

const safe = (value) => escapeHtml(String(value ?? ''));

function feedCard(feed) {
  const status = feed.status || 'referencia';
  return ErpCard(
    ErpStack(`
      <h2 class="cg-ui-card-title">${safe(feed.name)}</h2>
      <p class="cg-ui-muted">${safe(feed.kind)} · ${safe(feed.mode)}</p>
      <div>${Badge(status, status === 'ok' ? 'success' : 'warning')}</div>
      <a class="cg-ui-link" href="${safe(feed.url)}" target="_blank" rel="noopener noreferrer">Abrir fuente <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i></a>
    `, { gap:'sm' }),
    { tag:'article' }
  );
}

export const AccountingStandardsPage = {
  render(state) {
    const feeds = state.regulatoryFeeds || REGULATORY_SOURCES.map((source) => ({ ...source, status: 'pendiente' }));
    const ifrsMap = state.ifrsTaxonomy || [
      { code:'ifrs-full:Assets', label:'Assets / Activos', statement:'Estado de situación financiera' },
      { code:'ifrs-full:Liabilities', label:'Liabilities / Pasivos', statement:'Estado de situación financiera' },
      { code:'ifrs-full:Equity', label:'Equity / Patrimonio', statement:'Estado de situación financiera' },
      { code:'ifrs-full:Revenue', label:'Revenue / Ingresos', statement:'Rendimiento financiero' },
      { code:'ifrs-full:Expenses', label:'Expenses / Gastos', statement:'Rendimiento financiero' }
    ];

    const actions = `${Button({id:'btnRefreshFeeds', text:'Actualizar feeds', icon:'fa-rotate', variant:'primary'})}${Button({id:'btnImportIfrs', text:'Importar NIIF/XBRL', icon:'fa-sitemap', variant:'secondary'})}`;
    const table = ErpDataTable({
      caption: 'Clasificación NIIF y XBRL base',
      columns: [
        { key:'code', label:'Código global', render:(row) => `<code class="cg-ui-code">${safe(row.code)}</code>` },
        { key:'label', label:'Etiqueta' },
        { key:'statement', label:'Estado financiero' }
      ],
      rows: ifrsMap
    });

    return `<section class="cg-page-stack">${PageHeader({
      eyebrowKey:'standardsEyebrow',
      titleKey:'standardsTitle',
      descKey:'standardsDesc',
      actions
    })}${ErpGrid(feeds.map(feedCard).join(''), { columns:'four' })}${ErpSection({
      title:'Clasificación NIIF / XBRL base',
      description:'No reemplaza el plan de cuentas operativo; sirve para mapeo, reportes financieros y futura taxonomía XBRL.',
      content:table
    })}</section>`;
  },
  mount(_state, { Store, Toast }) {
    document.getElementById('btnRefreshFeeds')?.addEventListener('click', async () => {
      const res = await RegulatoryFeedService.refresh();
      Store.set({ regulatoryFeeds: res.data || [] });
      Toast.show('Fuentes contables actualizadas o cargadas desde fallback.', 'info');
    });
    document.getElementById('btnImportIfrs')?.addEventListener('click', async () => {
      await RegulatoryFeedService.importIfrsTaxonomy();
      Toast.show('Conector NIIF/XBRL preparado. La importación completa requiere backend con acceso a internet.', 'success');
    });
  }
};
