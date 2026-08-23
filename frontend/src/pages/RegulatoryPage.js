import { PageHeader, Field, Button, Badge, ErpDataTable, ErpGrid, ErpSection } from '../components/ui/index.js';
import { RegulatoryService } from '../services/regulatoryService.js';
import { escapeHtml, mountSubmit } from '../utils/dom.js';

const safe=(value)=>escapeHtml(String(value??''));

export const RegulatoryPage = {
  render(state) {
    const sources = state.regulatory?.sources || [];
    const updates = state.regulatory?.updates || [];
    const sourceTable=ErpDataTable({
      caption:'Fuentes normativas consultadas',
      columns:[
        {key:'name',label:'Fuente',render:(source)=>`<strong>${safe(source.name)}</strong>`},
        {key:'kind',label:'Tipo',render:(source)=>safe(source.kind)},
        {key:'status',label:'Estado',render:(source)=>Badge(source.status||'Referencial',String(source.status||'').includes('manual')?'warning':'brand')},
        {key:'url',label:'Acción',render:(source)=>source.url?`<a class="cg-ui-button cg-ui-button-secondary" href="${safe(source.url)}" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i><span>Abrir fuente</span></a>`:'—'}
      ],
      rows:sources
    });
    const updatesTable=ErpDataTable({
      caption:'Actualizaciones regulatorias referenciales',
      columns:[
        {key:'date',label:'Fecha',render:(item)=>safe(item.date||'—')},
        {key:'source',label:'Fuente',render:(item)=>safe(item.source||'—')},
        {key:'title',label:'Resumen',render:(item)=>`<strong>${safe(item.title)}</strong>${item.summary?`<br><small>${safe(item.summary)}</small>`:''}`}
      ],
      rows:updates
    });
    const searchForm=`<form id="regulatoryForm" class="cg-ui-row-wrap">${Field({labelKey:'Buscar tema normativo',name:'query',value:state.regulatory?.query||'iva',required:true,className:'cg-u-flex-1'})}${Button({text:'Buscar',icon:'fa-magnifying-glass',type:'submit'})}</form>`;

    return `<section class="cg-page-stack">
      ${PageHeader({eyebrowKey:'regulatoryEyebrow',titleKey:'regulatoryTitle',descKey:'regulatoryDesc',actions:Button({id:'btnLoadRegulatory',text:'Consultar backend',icon:'fa-rotate',variant:'secondary',attrs:'type="button"'})})}
      ${ErpSection({title:'Alcance de esta vista',description:'La información es referencial y no sustituye la validación de Gaceta Oficial, providencias, instructivos ni comprobantes oficiales antes de declarar o cambiar reglas fiscales.',actions:Badge('VALIDACIÓN OFICIAL OBLIGATORIA','warning'),content:searchForm})}
      ${ErpGrid(
        ErpSection({title:'Fuentes oficiales',description:`${sources.length} fuente(s) disponibles para contraste.`,content:sourceTable})+
        ErpSection({title:'Monitor tributario',description:`${updates.length} actualización(es) para el criterio consultado.`,content:updatesTable}),
        {columns:'two'}
      )}
    </section>`;
  },
  mount(_state, { Store, Toast, Loading }) {
    let loading=false;
    const load = async (query = Store.get().regulatory?.query || 'iva') => {
      if(loading)return;
      loading=true;
      try {
        Loading?.mount?.('Consultando normativa referencial…');
        const [sources, updates] = await Promise.all([
          RegulatoryService.sources(Store.get().settings.backendUrl),
          RegulatoryService.updates(Store.get().settings.backendUrl, query)
        ]);
        Store.update((draft) => {
          draft.regulatory=draft.regulatory||{};
          draft.regulatory.sources = sources.sources || sources || [];
          draft.regulatory.updates = updates.updates || updates || [];
          draft.regulatory.query = query;
        });
        Toast.show('Fuentes referenciales actualizadas. Valida la fuente oficial antes de aplicar cambios.', 'success');
      } catch (error) { Toast.show(error.message, 'error'); }
      finally { loading=false; Loading?.unmount?.(); }
    };
    document.getElementById('btnLoadRegulatory')?.addEventListener('click', () => load());
    mountSubmit('#regulatoryForm', (data) => load(data.query));
  }
};
