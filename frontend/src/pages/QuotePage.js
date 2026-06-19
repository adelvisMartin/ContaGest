import { PageHeader, Field, Select, Textarea, Button, Table, Badge } from '../components/ui/index.js';
import { bs, usd, percent } from '../core/formatters.js';
import { escapeHtml, mountSubmit, qs, qsa, uid } from '../utils/dom.js';
import { PdfService } from '../services/pdf.js';
import { SeniatService } from '../services/seniatService.js';

export const QuotePage = {
  render(state) {
    const q = state.quote;
    const c = state.calculation;
    const clientOptions = [{ value:'', label:'Seleccione cliente' }, ...state.clients.map((client) => ({ value: client.id, label: `${client.name} · ${client.rif}` }))];
    const itemRows = (q.items || []).map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${item.qty}</td><td>${usd(item.priceUsd)}</td><td>${usd(Number(item.qty || 0) * Number(item.priceUsd || 0))}</td><td><button class="btn btn-danger !p-2" data-remove-item="${item.id}"><i class="fa-solid fa-trash"></i></button></td></tr>`);
    const productButtons = state.inventory.slice(0, 6).map((item) => `<button type="button" class="quote-product-quick" data-add-product="${item.id}"><span>${escapeHtml(item.name)}</span><small>${escapeHtml(item.sku)} · ${usd(item.priceUsd)}</small></button>`).join('');
    return `
      <section class="surface rounded-[1.75rem] p-5 sm:p-7">
        ${PageHeader({ eyebrowKey:'quoteEyebrow', titleKey:'quoteTitle', descKey:'quoteDesc', actions: Button({ id:'btnPdf', text:'Generar PDF', i18n:'generatePdf', icon:'fa-file-pdf', variant:'accent' }) + Button({ id:'btnSaveHistory', text:'Guardar', i18n:'saveHistory', icon:'fa-floppy-disk' }) })}
        <div class="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
          <form id="quoteForm" class="panel-soft quote-enterprise-form rounded-[1.25rem] p-4">
            ${Field({ labelKey:'date', name:'date', type:'date', value:q.date })}
            ${Field({ labelKey:'invoice', name:'numeroFactura', value:q.numeroFactura })}
            <div>
              <label class="label">N° Orden</label>
              <input name="orden" class="input badge-orden" value="${escapeHtml(q.orden)}" />
            </div>
            ${Select({ labelKey:'client', name:'clientId', value:q.clientId, options:clientOptions })}
            ${Select({ labelKey:'currency', name:'currency', value:q.currency, options:[{value:'USD',label:'USD'}, {value:'VES',label:'Bolívares'}] })}
            ${Field({ labelKey:'amount', name:'manualAmount', type:'number', value:q.manualAmount, attrs:'step="0.01" min="0"' })}
            ${Textarea({ labelKey:'observation', name:'observation', value:q.observation, className:'sm:col-span-2' })}
            <div class="quote-tax-grid">
              ${taxSwitch('iva', 'IVA', q.taxes.iva)}
              ${taxSwitch('igtf', 'IGTF', q.taxes.igtf)}
              ${taxSwitch('islr', 'ISLR', q.taxes.islr)}
              ${taxSwitch('retIva', 'Ret. IVA', q.taxes.retIva)}
              ${taxSwitch('retIslr', 'Ret. ISLR', q.taxes.retIslr)}
              ${taxSwitch('custom', q.taxes.custom.label || 'Otro tributo', q.taxes.custom)}
            </div>
            <div class="quote-action-row">
              ${Button({ text:'Guardar cambios', i18n:'save', icon:'fa-check' })}
              ${Button({ id:'btnSeniat', text:'Consultar SENIAT', icon:'fa-landmark', variant:'secondary', attrs:'type="button"' })}
              ${Button({ id:'btnClearQuote', text:'Limpiar', i18n:'clear', icon:'fa-eraser', variant:'secondary', attrs:'type="button"' })}
            </div>
          </form>
          <div class="grid gap-4">
            <div class="panel-soft quote-summary-card rounded-[1.25rem] p-4">
              <h3 class="text-xl font-black text-[#1e3a8a] dark:text-white">Desglose tributario</h3>
              <dl class="mt-4 grid gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
                ${line('Base imponible', bs(c.baseImponible), usd(c.baseUsd))}
                ${line('IVA', bs(c.iva), percent(q.taxes.iva.rate))}
                ${line('IGTF', bs(c.igtf), percent(q.taxes.igtf.rate))}
                ${line('ISLR', bs(c.islr), percent(q.taxes.islr.rate))}
                ${line('Otro tributo', bs(c.custom), percent(q.taxes.custom.rate))}
                ${line('Retención IVA', `-${bs(c.retIva)}`, percent(q.taxes.retIva.rate))}
                ${line('Retención ISLR', `-${bs(c.retIslr)}`, percent(q.taxes.retIslr.rate))}
              </dl>
              <div class="quote-total-card">
                <p class="text-xs font-black uppercase tracking-widest">Total neto</p>
                <p class="mt-1 text-3xl font-black">${bs(c.total)}</p>
                <p class="text-sm font-bold text-slate-200">${usd(c.totalUsdEquivalent)}</p>
              </div>
            </div>
            <div class="panel-soft quote-products-card rounded-[1.25rem] p-4">
              <h3 class="mb-3 text-xl font-black text-[#1e3a8a] dark:text-white">Productos rápidos</h3>
              <div class="quote-product-grid">${productButtons || '<p class="font-bold">Sin productos.</p>'}</div>
            </div>
          </div>
        </div>
        <div class="mt-5 panel-soft quote-items-card rounded-[1.25rem] p-4">
          <h3 class="mb-3 text-xl font-black text-[#1e3a8a] dark:text-white">Ítems del presupuesto</h3>
          ${Table({ headers:[{key:'product'}, {key:'qty'}, {key:'price'}, {label:'Subtotal'}, {key:'actions'}], rows:itemRows })}
          <p class="mt-3 text-xs font-bold text-slate-600 dark:text-slate-300">Si agregas ítems, el cálculo usa el subtotal de productos. Si no hay ítems, usa el monto manual.</p>
        </div>
      </section>`;
  },
  mount(state, { Store, Toast, Modal }) {
    const applyQuoteForm = (form, { notify = false } = {}) => {
      const data = Object.fromEntries(new FormData(form).entries());
      Store.update((draft) => {
        draft.quote = { ...draft.quote, ...data, manualAmount: Number(data.manualAmount || 0) };
        ['iva','igtf','islr','retIva','retIslr','custom'].forEach((key) => {
          draft.quote.taxes[key].active = Boolean(data[`tax_${key}_active`]);
          draft.quote.taxes[key].rate = Number(data[`tax_${key}_rate`] || 0);
        });
      });
      if (notify) Toast.show('Cotización actualizada.', 'success');
    };

    mountSubmit('#quoteForm', (data, form) => applyQuoteForm(form, { notify: true }));

    qsa('#quoteForm [data-tax-control], #quoteForm input[name="manualAmount"], #quoteForm select, #quoteForm textarea').forEach((control) => {
      control.addEventListener('change', () => {
        const form = qs('#quoteForm');
        if (form) applyQuoteForm(form);
      });
      if (control.matches('input[type="number"]')) {
        control.addEventListener('input', () => {
          const form = qs('#quoteForm');
          if (form) applyQuoteForm(form);
        });
      }
    });
    qs('#btnPdf')?.addEventListener('click', () => PdfService.generateQuote(Store.get()));
    qs('#btnSaveHistory')?.addEventListener('click', () => {
      Store.update((draft) => {
        draft.history.unshift({ id: uid('doc'), quote: draft.quote, calculation: draft.calculation, createdAt: new Date().toISOString(), clientName: draft.clients.find((c) => c.id === draft.quote.clientId)?.name || 'Sin cliente' });
        draft.auditLog.unshift({ id: uid('log'), module:'cotizacion', action:'save-history', at:new Date().toISOString() });
      });
      Toast.show('Documento guardado en histórico.', 'success');
    });
    qs('#btnClearQuote')?.addEventListener('click', () => {
      Modal.confirm({ title:'Limpiar cotización', body:'Se borrarán monto, observación e ítems actuales.', confirmText:'Limpiar', onConfirm:() => Store.update((draft) => { draft.quote.manualAmount = 0; draft.quote.items = []; draft.quote.observation = ''; }) });
    });
    qs('#btnSeniat')?.addEventListener('click', async () => {
      const selected = Store.get().clients.find((client) => client.id === Store.get().quote.clientId);
      if (!selected?.rif) return Toast.show('Selecciona un cliente con RIF.', 'warning');
      try {
        const result = await SeniatService.lookup(selected.rif, Store.get().settings.backendUrl);
        Store.update((draft) => {
          if (result.retentionRate) {
            draft.quote.taxes.retIva.active = true;
            draft.quote.taxes.retIva.rate = Number(result.retentionRate);
          }
        });
        Toast.show(result.manual_required ? 'SENIAT requiere validación manual/captcha.' : 'Retención sugerida actualizada.', result.manual_required ? 'warning' : 'success');
      } catch (error) { Toast.show(error.message, 'error'); }
    });
    qsa('[data-add-product]').forEach((button) => button.addEventListener('click', () => {
      Store.update((draft) => {
        const product = draft.inventory.find((item) => item.id === button.dataset.addProduct);
        if (!product) return;
        const existing = draft.quote.items.find((item) => item.productId === product.id);
        if (existing) existing.qty += 1;
        else draft.quote.items.push({ id: uid('item'), productId: product.id, name: product.name, qty: 1, priceUsd: product.priceUsd });
      });
      Toast.show('Producto agregado al presupuesto.', 'success');
    }));
    qsa('[data-remove-item]').forEach((button) => button.addEventListener('click', () => Store.update((draft) => { draft.quote.items = draft.quote.items.filter((item) => item.id !== button.dataset.removeItem); })));
  }
};

function taxSwitch(key, label, config) {
  const checked = config.active ? 'checked' : '';
  const stateText = config.active ? 'Activo' : 'Inactivo';
  return `<section class="quote-tax-card ${config.active ? 'is-active' : 'is-off'}">
    <div class="quote-tax-head">
      <div>
        <strong>${escapeHtml(label)}</strong>
        <span>${stateText} para el cálculo</span>
      </div>
      <label class="quote-tax-toggle" aria-label="Activar ${escapeHtml(label)}">
        <input data-tax-control type="checkbox" name="tax_${key}_active" ${checked}/>
        <span></span>
      </label>
    </div>
    <label class="quote-tax-rate">
      <span>Porcentaje</span>
      <input data-tax-control class="input" type="number" step="0.01" min="0" name="tax_${key}_rate" value="${config.rate || 0}" />
    </label>
  </section>`;
}
function line(label, value, hint) { return `<div class="quote-summary-line"><dt>${escapeHtml(label)} <span>${escapeHtml(hint || '')}</span></dt><dd>${escapeHtml(value)}</dd></div>`; }
