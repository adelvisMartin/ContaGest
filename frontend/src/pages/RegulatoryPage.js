import { PageHeader, Field, Button, Table, Badge } from '../components/ui/index.js';
import { RegulatoryService } from '../services/regulatoryService.js';
import { escapeHtml, mountSubmit, qs } from '../utils/dom.js';

export const RegulatoryPage = {
  render(state) {
    const sources = state.regulatory.sources || [];
    const updates = state.regulatory.updates || [];
    const sourceRows = sources.map((source) => `<tr><td>${escapeHtml(source.name)}</td><td>${escapeHtml(source.kind)}</td><td>${Badge(source.status || 'Referencial', source.status?.includes('manual') ? 'warning' : 'brand')}</td><td><a class="font-black text-[#1e3a8a] dark:text-white" href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">Abrir</a></td></tr>`);
    const updateRows = updates.map((item) => `<tr><td>${escapeHtml(item.date || '-')}</td><td>${escapeHtml(item.source || '-')}</td><td><p class="font-black">${escapeHtml(item.title)}</p><p class="text-xs font-bold text-slate-600 dark:text-slate-300">${escapeHtml(item.summary || '')}</p></td></tr>`);
    return `<section class="surface rounded-[1.75rem] p-5 sm:p-7">${PageHeader({ eyebrowKey:'regulatoryEyebrow', titleKey:'regulatoryTitle', descKey:'regulatoryDesc', actions:Button({ id:'btnLoadRegulatory', text:'Consultar backend', icon:'fa-rotate', variant:'accent', attrs:'type="button"' }) })}
      <div class="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"><i class="fa-solid fa-triangle-exclamation"></i> La información normativa es referencial. Antes de declarar o aplicar cambios, valida Gaceta Oficial, providencias y comprobantes oficiales.</div>
      <form id="regulatoryForm" class="panel-soft mb-5 grid gap-4 rounded-[1.5rem] p-4 sm:grid-cols-[1fr_auto]">${Field({ labelKey:'search', name:'query', value:state.regulatory.query || 'iva' })}<div class="self-end">${Button({ text:'Buscar', i18n:'search', icon:'fa-magnifying-glass' })}</div></form>
      <div class="grid gap-5 xl:grid-cols-[.9fr_1.1fr]"><div class="panel-soft rounded-[1.5rem] p-4"><h3 class="mb-3 text-xl font-black text-[#1e3a8a] dark:text-white">Fuentes oficiales</h3>${Table({ headers:[{label:'Fuente'}, {label:'Tipo'}, {key:'status'}, {key:'actions'}], rows:sourceRows })}</div><div class="panel-soft rounded-[1.5rem] p-4"><h3 class="mb-3 text-xl font-black text-[#1e3a8a] dark:text-white">Monitor tributario</h3>${Table({ headers:[{key:'date'}, {key:'source'}, {label:'Resumen'}], rows:updateRows })}</div></div>
    </section>`;
  },
  mount(state, { Store, Toast }) {
    const load = async (query = Store.get().regulatory.query || 'iva') => {
      try {
        const [sources, updates] = await Promise.all([RegulatoryService.sources(Store.get().settings.backendUrl), RegulatoryService.updates(Store.get().settings.backendUrl, query)]);
        Store.update((draft) => { draft.regulatory.sources = sources.sources || sources; draft.regulatory.updates = updates.updates || updates; draft.regulatory.query = query; });
        Toast.show('Normativa actualizada en modo referencial.', 'success');
      } catch (error) { Toast.show(error.message, 'error'); }
    };
    qs('#btnLoadRegulatory')?.addEventListener('click', () => load());
    mountSubmit('#regulatoryForm', (data) => load(data.query));
  }
};
