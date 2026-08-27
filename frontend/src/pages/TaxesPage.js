import { PageHeader, Button, Badge, Section, Select, Field, DataTable, EmptyState } from '../components/ui/index.js';
import { qs, mountSubmit } from '../utils/dom.js';
import { escapeHtml } from '../utils/dom.js';
import { FiscalService, FISCAL_MODULES, FISCAL_DOCUMENT_KINDS } from '../services/fiscalService.js';

const safe=(value)=>escapeHtml(String(value??''));
const currentPeriod=()=>new Date().toISOString().slice(0,7);

function taxCard(key,item){
  const label=taxLabel(key,item);
  return `<article class="cgx-section cg-tax-card">
    <header class="cgx-section-head">
      <div><h2>${safe(label)}</h2><p>Alícuota aplicada en operaciones compatibles.</p></div>
      <label class="cg-ui-row cg-tax-toggle"><span class="cg-ui-muted">${item.active?Badge('Activo','success'):Badge('Inactivo','neutral')}</span><input class="switch" data-tax-active="${safe(key)}" type="checkbox" ${item.active?'checked':''} aria-label="Activar ${safe(label)}"></label>
    </header>
    <div class="cgx-section-body">
      <div class="cgx-field"><label class="label cgx-label" for="tax-rate-${safe(key)}">Alícuota %</label><input id="tax-rate-${safe(key)}" class="input cgx-field-normalized" data-tax-rate="${safe(key)}" type="number" inputmode="decimal" step="0.01" min="0" value="${safe(item.rate||0)}"></div>
    </div>
  </article>`;
}

export const TaxesPage = {
  render(state) {
    const taxes=state.quote?.taxes||{};
    const cards=Object.entries(taxes).map(([key,item])=>taxCard(key,item)).join('');
    const governance=state.fiscalGovernance||{capabilities:{}};
    const documents=state.fiscalDocuments||[];
    const documentRows=documents.map((doc)=>({
      ...doc,
      createdAt:doc.createdAt?new Date(doc.createdAt).toLocaleString('es-VE'):'—',
      hashShort:String(doc.hash||'').slice(0,12),
      statusCell:Badge(String(doc.status||'issued').toUpperCase(),'success')
    }));
    const documentForm=governance.capabilities?.manageDocuments?`<form id="fiscalDocumentForm" class="cg-record-form"><div class="cg-record-fields cg-fields-compact">${Select({labelKey:'Tipo documento',name:'kind',options:FISCAL_DOCUMENT_KINDS})}${Field({labelKey:'Número',name:'number',required:true})}${Field({labelKey:'Período',name:'period',required:true,value:currentPeriod(),attrs:'pattern="\\d{4}-\\d{2}"'})}${Select({labelKey:'Módulo fiscal',name:'module',options:FISCAL_MODULES})}${Field({labelKey:'Payload JSON opcional',name:'payloadJson',value:'{}',className:'cg-field-wide'})}</div><div class="cg-record-actions">${Button({text:'Registrar documento fiscal',icon:'fa-file-circle-plus',type:'submit'})}</div></form>`:`<div class="cg-ui-row-wrap">${Badge(governance.denied?'PERMISSION DENIED':'SOLO LECTURA',governance.denied?'danger':'neutral')}<span class="cg-ui-muted">El servidor no habilitó fiscal.manage_documents para esta sesión.</span></div>`;
    return `<section class="cgx-page cg-page-stack">${PageHeader({
      eyebrowKey:'taxesEyebrow',titleKey:'taxesTitle',descKey:'taxesDesc',
      actions:Button({id:'btnApplyTaxes',text:'Guardar',i18n:'save',icon:'fa-check'})
    })}<div class="cg-ui-grid cg-ui-grid-three">${cards}</div>
      ${Section({title:'Documentos fiscales',subtitle:'Registro tenant-scoped con hash, RBAC y bloqueo por período fiscal cerrado. Esta ingeniería no constituye certificación regulatoria SENIAT.',children:documentForm})}
      ${documents.length?DataTable({columns:[{key:'createdAt',label:'Fecha'},{key:'kind',label:'Tipo'},{key:'number',label:'Número'},{key:'period',label:'Período'},{key:'module',label:'Módulo'},{key:'statusCell',label:'Estado',render:(r)=>r.statusCell},{key:'hashShort',label:'Hash'}],rows:documentRows}):EmptyState({title:'Sin documentos fiscales',description:'No hay documentos registrados para el tenant activo.',iconName:'fa-file-invoice'})}
    </section>`;
  },
  mount(state,{Store,Toast,Loading}) {
    qs('#btnApplyTaxes')?.addEventListener('click',()=>{
      Store.update((draft)=>{
        document.querySelectorAll('[data-tax-active]').forEach((node)=>{draft.quote.taxes[node.dataset.taxActive].active=node.checked;});
        document.querySelectorAll('[data-tax-rate]').forEach((node)=>{draft.quote.taxes[node.dataset.taxRate].rate=Number(node.value||0);});
      });
      Toast.show('Tributos actualizados.','success');
    });
    const loadFiscal=async({silent=true}={})=>{try{if(!silent)Loading?.mount?.('Cargando documentos fiscales…');const status=await FiscalService.periods();const documents=await FiscalService.documents();Store.set({fiscalGovernance:{...status,denied:false,loaded:true},fiscalDocuments:documents||[]});}catch(error){if(error.status===403){Store.set({fiscalGovernance:{periods:[],capabilities:{},denied:true,loaded:true},fiscalDocuments:[]});return;}Toast.show(`No se cargaron documentos fiscales: ${error.message}`,'error');}finally{if(!silent)Loading?.unmount?.();}};
    if(!state.fiscalGovernance?.loaded||state.fiscalDocuments===undefined)void loadFiscal();
    mountSubmit('#fiscalDocumentForm',async(data,form)=>{try{let payload={};if(String(data.payloadJson||'').trim())payload=JSON.parse(data.payloadJson);if(!payload||Array.isArray(payload)||typeof payload!=='object')throw new Error('El payload debe ser un objeto JSON.');await FiscalService.createDocument({kind:data.kind,number:data.number,period:data.period,module:data.module,payload});Toast.show('Documento fiscal registrado y auditado.','success');form.reset();if(form.elements.period)form.elements.period.value=currentPeriod();if(form.elements.payloadJson)form.elements.payloadJson.value='{}';await loadFiscal();}catch(error){Toast.show(`No se registró el documento: ${error.message}`,'error');}});
  }
};

function taxLabel(key,item){return({iva:'IVA',igtf:'IGTF',islr:'ISLR',retIva:'Retención IVA',retIslr:'Retención ISLR',custom:item.label||'Otro tributo'}[key]||key);}
