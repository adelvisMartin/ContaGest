
import { STITCH_VIEWS, STITCH_CATEGORIES } from '../data/stitchManifest.js';
import { Pro, MI } from '../components/proComponents.js';
import { PageHeader } from '../components/ui/index.js';
import { escapeHtml } from '../utils/dom.js';

const categoryTone = (cat) => cat.includes('Seguridad') ? 'danger' : cat.includes('Fiscal') ? 'warning' : cat.includes('IA') ? 'info' : 'neutral';

export const ModuleCatalogPage = {
  render() {
    const total = STITCH_VIEWS.length;
    const premium = STITCH_VIEWS.filter((view)=>view.premium).length;
    const desktop = STITCH_VIEWS.filter((view)=>view.device === 'desktop').length;
    const actions = `${Pro.button({ id:'btnExportModuleManifest', label:'Exportar catálogo', icon:'download', tone:'secondary' })}${Pro.button({ id:'btnSecurityChecklist', label:'Checklist seguridad', icon:'shield', tone:'primary' })}`;
    return `<section class="pl-page">
      ${PageHeader({ eyebrow:'Stitch Bulk Import', title:'Biblioteca de prototipos Stitch', description:'Las vistas importadas desde Stitch funcionan como biblioteca de referencia visual/prototipos. Sirven para abrir, comparar y convertir gradualmente a módulos nativos con reglas de negocio.', actions })}
      ${Pro.kpiGrid([
        { label:'Prototipos importados', value:total, sub:'Referencia visual disponible', icon:'widgets' },
        { label:'Categorías', value:STITCH_CATEGORIES.length, sub:'Agrupación por dominio', icon:'category' },
        { label:'Premium / Pro', value:premium, sub:'Vistas de alta fidelidad', icon:'workspace_premium' },
        { label:'Desktop', value:desktop, sub:'Mobile y tablet también incluidos', icon:'desktop_windows' }
      ])}
      ${Pro.toolbar({ searchId:'moduleSearch', placeholder:'Buscar vista, módulo, fiscal, nómina, IA...', tabs:`<div class="pl-tabs" id="moduleTabs"><button class="pl-tab active" data-category="all">Todas</button>${STITCH_CATEGORIES.map((cat)=>`<button class="pl-tab" data-category="${escapeHtml(cat)}">${escapeHtml(cat)}</button>`).join('')}</div>` })}
      <section class="pl-module-grid" id="moduleGrid">
        ${STITCH_VIEWS.map((view)=>`
          <article class="pl-card pl-module-card" data-module-card data-title="${escapeHtml(view.title.toLowerCase())}" data-category="${escapeHtml(view.category)}">
            <button class="pl-module-shot" data-route="${escapeHtml(view.route)}" aria-label="Abrir ${escapeHtml(view.title)}">${view.image ? `<img loading="lazy" src="${escapeHtml(view.image)}" alt="${escapeHtml(view.title)}" />` : MI(view.icon)}</button>
            <div class="pl-module-body">
              <div class="flex items-start justify-between gap-3"><h3 class="pl-module-title">${escapeHtml(view.title)}</h3>${MI(view.icon)}</div>
              <div class="pl-route-pill">${escapeHtml(view.endpoint)}</div>
              <div class="pl-module-meta">${Pro.chip(view.category, categoryTone(view.category))}${Pro.chip(view.device, 'neutral', view.device === 'mobile' ? 'smartphone' : view.device === 'tablet' ? 'tablet_mac' : 'desktop_windows')}${view.premium ? Pro.chip('Premium', 'info', 'workspace_premium') : ''}</div>
              <div class="pl-actions"><button class="pl-btn pl-btn-primary w-full" data-route="${escapeHtml(view.route)}">${MI('open_in_new','text-[18px]')}<span>Abrir prototipo</span></button></div>
            </div>
          </article>`).join('')}
      </section>
    </section>`;
  },
  mount(_state, { Toast }) {
    const search = document.getElementById('moduleSearch');
    const tabs = document.getElementById('moduleTabs');
    const cards = [...document.querySelectorAll('[data-module-card]')];
    let active = 'all';
    const filter = () => {
      const q = (search?.value || '').toLowerCase().trim();
      cards.forEach((card) => {
        const okCat = active === 'all' || card.dataset.category === active;
        const okText = !q || card.dataset.title.includes(q) || card.dataset.category.toLowerCase().includes(q);
        card.style.display = okCat && okText ? '' : 'none';
      });
    };
    search?.addEventListener('input', filter);
    tabs?.querySelectorAll('[data-category]').forEach((btn)=>btn.addEventListener('click',()=>{ active = btn.dataset.category; tabs.querySelectorAll('.pl-tab').forEach(b=>b.classList.toggle('active', b===btn)); filter(); }));
    document.getElementById('btnExportModuleManifest')?.addEventListener('click',()=>{
      const blob = new Blob([JSON.stringify(STITCH_VIEWS, null, 2)], { type:'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'contagest-stitch-manifest.json'; a.click(); URL.revokeObjectURL(a.href);
      Toast.show('Manifest de vistas exportado.', 'success');
    });
    document.getElementById('btnSecurityChecklist')?.addEventListener('click',()=>Toast.show('Checklist: JWT + RLS + RBAC + auditoría + rate limit + CORS cerrado.', 'info'));
  }
};
