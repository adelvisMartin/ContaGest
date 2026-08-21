import { PageHeader, Button, Badge } from '../components/ui/index.js';
import { qs } from '../utils/dom.js';
import { escapeHtml } from '../utils/dom.js';

const safe=(value)=>escapeHtml(String(value??''));

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
    return `<section class="cgx-page cg-page-stack">${PageHeader({
      eyebrowKey:'taxesEyebrow',titleKey:'taxesTitle',descKey:'taxesDesc',
      actions:Button({id:'btnApplyTaxes',text:'Guardar',i18n:'save',icon:'fa-check'})
    })}<div class="cg-ui-grid cg-ui-grid-three">${cards}</div></section>`;
  },
  mount(state,{Store,Toast}) {
    qs('#btnApplyTaxes')?.addEventListener('click',()=>{
      Store.update((draft)=>{
        document.querySelectorAll('[data-tax-active]').forEach((node)=>{draft.quote.taxes[node.dataset.taxActive].active=node.checked;});
        document.querySelectorAll('[data-tax-rate]').forEach((node)=>{draft.quote.taxes[node.dataset.taxRate].rate=Number(node.value||0);});
      });
      Toast.show('Tributos actualizados.','success');
    });
  }
};

function taxLabel(key,item){return({iva:'IVA',igtf:'IGTF',islr:'ISLR',retIva:'Retención IVA',retIslr:'Retención ISLR',custom:item.label||'Otro tributo'}[key]||key);}
