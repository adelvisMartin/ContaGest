import { PageHeader, Button } from '../components/ui/index.js';
import { qs } from '../utils/dom.js';

export const TaxesPage = {
  render(state) {
    const taxes = state.quote.taxes;
    const cards = Object.entries(taxes).map(([key, item]) => `<article class="panel-soft rounded-[1.5rem] p-4"><div class="flex items-center justify-between gap-3"><h3 class="text-xl font-black text-[#1e3a8a] dark:text-white">${taxLabel(key, item)}</h3><input class="switch" data-tax-active="${key}" type="checkbox" ${item.active ? 'checked' : ''}/></div><label class="label mt-4">Alícuota %</label><input class="input" data-tax-rate="${key}" type="number" step="0.01" value="${item.rate || 0}" /></article>`).join('');
    return `<section class="surface rounded-[1.75rem] p-5 sm:p-7">${PageHeader({ eyebrowKey:'taxesEyebrow', titleKey:'taxesTitle', descKey:'taxesDesc', actions:Button({id:'btnApplyTaxes', text:'Guardar', i18n:'save', icon:'fa-check'}) })}<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">${cards}</div></section>`;
  },
  mount(state, { Store, Toast }) {
    qs('#btnApplyTaxes')?.addEventListener('click', () => { Store.update((draft) => { document.querySelectorAll('[data-tax-active]').forEach((node) => { draft.quote.taxes[node.dataset.taxActive].active = node.checked; }); document.querySelectorAll('[data-tax-rate]').forEach((node) => { draft.quote.taxes[node.dataset.taxRate].rate = Number(node.value || 0); }); }); Toast.show('Tributos actualizados.', 'success'); });
  }
};
function taxLabel(key, item) { return ({ iva:'IVA', igtf:'IGTF', islr:'ISLR', retIva:'Retención IVA', retIslr:'Retención ISLR', custom:item.label || 'Otro tributo' }[key] || key); }
