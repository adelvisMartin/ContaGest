import { MODULE_AREAS, modulesForMode } from '../data/moduleCatalog.js';
import { PageHeader, Button, MetricGrid, Section, Badge, EmptyState, icon } from '../components/ui/index.js';
import { escapeHtml } from '../utils/dom.js';

const safe=(value)=>escapeHtml(String(value??''));
const areaIcon=(area)=>({
  Inicio:'fa-house',Ventas:'fa-receipt',Operaciones:'fa-gears',Inventario:'fa-boxes-stacked',Compras:'fa-cart-shopping',
  Contabilidad:'fa-building-columns',Fiscal:'fa-landmark',RRHH:'fa-users',Salud:'fa-heart-pulse',Fitness:'fa-dumbbell',
  Comunicación:'fa-comments',Analítica:'fa-chart-line',Administración:'fa-shield-halved',Soporte:'fa-life-ring'
}[area]||'fa-cube');
const tierTone=(tier)=>tier==='core'?'success':tier==='advanced'?'brand':'warning';
const tierLabel=(tier)=>tier==='core'?'Operativo':tier==='advanced'?'Especializado':'Opcional';

function moduleCard(module){
  return `<article class="cg-ui-card cg-ui-card-body cg-module-catalog-card" data-module-card data-title="${safe(`${module.name} ${module.route} ${module.area}`.toLowerCase())}" data-category="${safe(module.area)}">
    <div class="cg-ui-row cg-ui-row-start"><span class="cgx-metric-icon">${icon(areaIcon(module.area))}</span><div class="cg-ui-stack cg-ui-gap-xs"><strong>${safe(module.name)}</strong><small>${safe(module.area)} · /${safe(module.route)}</small></div>${Badge(tierLabel(module.tier),tierTone(module.tier))}</div>
    <p>${safe(module.tier==='core'?'Función principal disponible para la operación del área.':module.tier==='advanced'?'Herramienta especializada que amplía el flujo principal.':'Extensión opcional según plan y configuración.')}</p>
    <div class="cg-record-actions">${Button({text:'Abrir módulo',icon:'fa-arrow-up-right-from-square',variant:'secondary',route:module.route})}</div>
  </article>`;
}

export const ModuleCatalogPage = {
  render(state) {
    const mode=state.settings?.businessMode||'admin';
    const modules=modulesForMode(mode);
    const areas=MODULE_AREAS.filter((area)=>modules.some((module)=>module.area===area));
    const core=modules.filter((module)=>module.tier==='core').length;
    const specialized=modules.filter((module)=>module.tier==='advanced').length;
    const optional=modules.filter((module)=>module.tier==='demo').length;
    const tabs=`<div class="cg-module-catalog-tabs" id="moduleTabs" role="tablist" aria-label="Filtrar módulos por área"><button type="button" class="cgx-btn cgx-btn-secondary is-active" data-category="all" role="tab" aria-selected="true">Todas</button>${areas.map((area)=>`<button type="button" class="cgx-btn cgx-btn-secondary" data-category="${safe(area)}" role="tab" aria-selected="false">${safe(area)}</button>`).join('')}</div>`;
    const content=modules.length?`<div class="cg-ui-grid cg-ui-grid-three" id="moduleGrid">${modules.map(moduleCard).join('')}</div>`:EmptyState({title:'Sin módulos habilitados',description:'El modo, rol o licencia activo no habilita módulos adicionales.',iconName:'fa-cubes'});
    return `<section class="cg-page-stack cg-module-catalog-page">
      ${PageHeader({
        eyebrow:'Administración',
        title:'Galería de módulos',
        description:'Catálogo operativo real del modo activo. Cada tarjeta abre una ruta existente y sigue aplicando RBAC y licenciamiento al navegar.',
        actions:`${Button({id:'btnExportModuleManifest',text:'Exportar catálogo',icon:'fa-download',variant:'secondary'})}${Button({id:'btnSecurityChecklist',text:'Checklist seguridad',icon:'fa-shield-halved',variant:'secondary'})}`
      })}
      ${MetricGrid([
        {label:'Módulos habilitados',value:String(modules.length),hint:`Modo ${mode}`,iconName:'fa-cubes',tone:'brand'},
        {label:'Operativos',value:String(core),hint:'Flujos principales',iconName:'fa-circle-check',tone:'success'},
        {label:'Especializados',value:String(specialized),hint:'Herramientas avanzadas',iconName:'fa-layer-group',tone:'neutral'},
        {label:'Opcionales',value:String(optional),hint:'Según plan/configuración',iconName:'fa-puzzle-piece',tone:optional?'warning':'neutral'}
      ])}
      ${Section({title:'Explorar módulos',subtitle:'Busca por nombre, ruta o área. Los filtros sólo cambian la galería; la autorización real se valida al navegar.',actions:`<label class="cgx-toolbar-search"><span class="sr-only">Buscar módulos</span><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input id="moduleSearch" type="search" placeholder="Buscar módulo, ruta o área…" autocomplete="off"></label>`,children:`${tabs}${content}`})}
    </section>`;
  },

  mount(state,{Toast}) {
    const search=document.getElementById('moduleSearch');
    const tabs=document.getElementById('moduleTabs');
    const cards=[...document.querySelectorAll('[data-module-card]')];
    let active='all';
    const filter=()=>{
      const term=String(search?.value||'').toLowerCase().trim();
      let visible=0;
      cards.forEach((card)=>{
        const categoryMatch=active==='all'||card.dataset.category===active;
        const textMatch=!term||String(card.dataset.title||'').includes(term);
        const show=categoryMatch&&textMatch;
        card.hidden=!show;
        if(show)visible++;
      });
      document.getElementById('moduleGrid')?.setAttribute('data-visible-count',String(visible));
    };
    search?.addEventListener('input',filter);
    tabs?.querySelectorAll('[data-category]').forEach((button)=>button.addEventListener('click',()=>{
      active=button.dataset.category||'all';
      tabs.querySelectorAll('[data-category]').forEach((item)=>{
        const selected=item===button;
        item.classList.toggle('is-active',selected);
        item.setAttribute('aria-selected',String(selected));
      });
      filter();
    }));

    document.getElementById('btnExportModuleManifest')?.addEventListener('click',()=>{
      const modules=modulesForMode(state.settings?.businessMode||'admin');
      const blob=new Blob([JSON.stringify({generatedAt:new Date().toISOString(),businessMode:state.settings?.businessMode||'admin',modules},null,2)],{type:'application/json'});
      const url=URL.createObjectURL(blob);
      const link=document.createElement('a');
      link.href=url;
      link.download='contagest-module-catalog.json';
      link.click();
      setTimeout(()=>URL.revokeObjectURL(url),0);
      Toast.show('Catálogo operativo exportado.','success');
    });
    document.getElementById('btnSecurityChecklist')?.addEventListener('click',()=>Toast.show('Gate recomendado: sesión firmada + RBAC + licencia + tenant isolation + auditoría + rate limits.','info'));
  }
};
