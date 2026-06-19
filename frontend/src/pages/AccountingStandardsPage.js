import { PageHeader, Button, Badge } from '../components/ui/index.js';
import { RegulatoryFeedService, REGULATORY_SOURCES } from '../services/regulatoryFeedService.js';

export const AccountingStandardsPage = {
  render(state) {
    const feeds = state.regulatoryFeeds || REGULATORY_SOURCES.map((s) => ({ ...s, status: 'pendiente' }));
    const ifrsMap = state.ifrsTaxonomy || [
      { code:'ifrs-full:Assets', label:'Assets / Activos', statement:'Estado de situación financiera' },
      { code:'ifrs-full:Liabilities', label:'Liabilities / Pasivos', statement:'Estado de situación financiera' },
      { code:'ifrs-full:Equity', label:'Equity / Patrimonio', statement:'Estado de situación financiera' },
      { code:'ifrs-full:Revenue', label:'Revenue / Ingresos', statement:'Rendimiento financiero' },
      { code:'ifrs-full:Expenses', label:'Expenses / Gastos', statement:'Rendimiento financiero' }
    ];
    return `<section class="cg-page-stack">${PageHeader({eyebrowKey:'standardsEyebrow', titleKey:'standardsTitle', descKey:'standardsDesc', actions:`${Button({id:'btnRefreshFeeds', text:'Actualizar feeds', icon:'fa-rotate', variant:'primary'})}${Button({id:'btnImportIfrs', text:'Importar NIIF/XBRL', icon:'fa-sitemap', variant:'secondary'})}`})}
      <div class="pl-grid pl-grid-4">${feeds.map((f) => `<article class="surface p-4 rounded-[1.2rem]"><h3 class="font-black">${f.name}</h3><p class="subtitle">${f.kind} · ${f.mode}</p><div class="mt-3">${Badge(f.status || 'referencia', f.status === 'ok' ? 'success' : 'warning')}</div><a class="mt-3 inline-flex font-bold text-[#1e3a8a]" href="${f.url}" target="_blank" rel="noopener noreferrer">Abrir fuente</a></article>`).join('')}</div>
      <article class="surface p-5 rounded-[1.5rem]"><h3 class="text-2xl font-black">Clasificación NIIF / XBRL base</h3><p class="subtitle">No reemplaza el plan de cuentas operativo; sirve para mapeo, reportes financieros y futura taxonomía XBRL.</p><div class="pl-table-wrap mt-4"><table class="pl-table"><thead><tr><th>Código global</th><th>Etiqueta</th><th>Estado financiero</th></tr></thead><tbody>${ifrsMap.map((x) => `<tr><td><code>${x.code}</code></td><td>${x.label}</td><td>${x.statement}</td></tr>`).join('')}</tbody></table></div></article>
    </section>`;
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
