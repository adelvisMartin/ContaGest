import { PageHeader, Field, Select, Textarea, Button, DataTable, Badge, MetricGrid, Section, EmptyState } from '../components/ui/index.js';
import { bs, usd, percent } from '../core/formatters.js';
import { escapeHtml, mountSubmit, qs, qsa, uid } from '../utils/dom.js';
import { PdfService } from '../services/pdf.js';
import { SeniatService } from '../services/seniatService.js';

const safe=(value)=>escapeHtml(String(value??''));
const taxTotal=(calculation)=>Number(calculation.iva||0)+Number(calculation.igtf||0)+Number(calculation.islr||0)+Number(calculation.custom||0);
const retentionTotal=(calculation)=>Number(calculation.retIva||0)+Number(calculation.retIslr||0);

export const QuotePage = {
  render(state) {
    const q=state.quote;
    const c=state.calculation;
    const clientOptions=[{value:'',label:'Seleccione cliente'},...state.clients.map((client)=>({value:client.id,label:`${client.name} · ${client.rif}`}))];
    const itemRows=(q.items||[]).map((item)=>({
      ...item,
      qtyCell:safe(item.qty),
      priceCell:safe(usd(item.priceUsd)),
      subtotalCell:safe(usd(Number(item.qty||0)*Number(item.priceUsd||0))),
      action:Button({text:'Quitar ítem',icon:'fa-trash',variant:'danger',className:'cgx-btn-icon',attrs:`type="button" data-remove-item="${safe(item.id)}" aria-label="Quitar ${safe(item.name)}"`})
    }));
    const productButtons=state.inventory.slice(0,8).map((item)=>`<button type="button" class="cg-ui-button cg-ui-button-secondary cg-quote-product" data-add-product="${safe(item.id)}"><span><strong>${safe(item.name)}</strong><small>${safe(item.sku)} · ${safe(usd(item.priceUsd))}</small></span><i class="fa-solid fa-plus" aria-hidden="true"></i></button>`).join('');
    const taxCards=[
      ['iva','IVA',q.taxes.iva,c.iva],['igtf','IGTF',q.taxes.igtf,c.igtf],['islr','ISLR',q.taxes.islr,c.islr],
      ['retIva','Retención IVA',q.taxes.retIva,-Number(c.retIva||0)],['retIslr','Retención ISLR',q.taxes.retIslr,-Number(c.retIslr||0)],['custom',q.taxes.custom.label||'Otro tributo',q.taxes.custom,c.custom]
    ].map(([key,label,config,amount])=>taxSwitch(key,label,config,amount)).join('');

    return `<section class="cg-page-stack cg-quote-page">
      ${PageHeader({eyebrow:'Ventas · Cotizador',title:'Cotización y cálculo tributario',description:'Prepara una propuesta con cliente, productos y tributos. Los importes se recalculan al editar y se mantienen compactos y legibles en VES/USD.',actions:`${Button({id:'btnPdf',text:'Generar PDF',icon:'fa-file-pdf',variant:'primary'})}${Button({id:'btnSaveHistory',text:'Guardar en histórico',icon:'fa-floppy-disk',variant:'secondary'})}`})}
      ${MetricGrid([
        {label:'Base imponible',value:bs(c.baseImponible),hint:usd(c.baseUsd),iconName:'fa-calculator',tone:'neutral'},
        {label:'Tributos',value:bs(taxTotal(c)),hint:'Cargos activos',iconName:'fa-landmark',tone:'brand'},
        {label:'Retenciones',value:bs(retentionTotal(c)),hint:'Descuentos fiscales',iconName:'fa-percent',tone:retentionTotal(c)?'warning':'neutral'},
        {label:'Total neto',value:bs(c.total),hint:usd(c.totalUsdEquivalent),iconName:'fa-file-invoice-dollar',tone:'success'}
      ])}
      <div class="cg-ui-grid cg-ui-grid-two cg-quote-layout">
        ${Section({title:'Datos de la cotización',subtitle:'Identificación, cliente, moneda y monto base.',children:`<form id="quoteForm" class="cg-record-form"><div class="cg-record-fields">${Field({labelKey:'Fecha',name:'date',type:'date',value:q.date})}${Field({labelKey:'N° factura / referencia',name:'numeroFactura',value:q.numeroFactura})}${Field({labelKey:'N° orden',name:'orden',value:q.orden})}${Select({labelKey:'Cliente',name:'clientId',value:q.clientId,options:clientOptions})}${Select({labelKey:'Moneda',name:'currency',value:q.currency,options:[{value:'USD',label:'USD'},{value:'VES',label:'Bolívares'}]})}${Field({labelKey:'Monto manual',name:'manualAmount',type:'number',value:q.manualAmount,attrs:'step="0.01" min="0"'})}${Textarea({labelKey:'Observación',name:'observation',value:q.observation,className:'cg-field-wide'})}</div><div class="cg-record-actions">${Button({text:'Guardar cambios',icon:'fa-check',type:'submit'})}${Button({id:'btnSeniat',text:'Consultar SENIAT',icon:'fa-landmark',variant:'secondary',attrs:'type="button"'})}${Button({id:'btnClearQuote',text:'Limpiar borrador',icon:'fa-eraser',variant:'secondary',attrs:'type="button"'})}</div><div class="cg-quote-tax-grid">${taxCards}</div></form>`})}
        <div class="cg-ui-stack cg-ui-gap-md">
          ${Section({title:'Desglose',subtitle:'Tasas aplicadas y efecto sobre el neto.',children:`<dl class="cg-quote-breakdown">${line('Base imponible',bs(c.baseImponible),usd(c.baseUsd))}${line('IVA',bs(c.iva),percent(q.taxes.iva.rate))}${line('IGTF',bs(c.igtf),percent(q.taxes.igtf.rate))}${line('ISLR',bs(c.islr),percent(q.taxes.islr.rate))}${line('Otro tributo',bs(c.custom),percent(q.taxes.custom.rate))}${line('Retención IVA',`-${bs(c.retIva)}`,percent(q.taxes.retIva.rate))}${line('Retención ISLR',`-${bs(c.retIslr)}`,percent(q.taxes.retIslr.rate))}</dl><div class="cg-quote-net"><span>Total neto</span><strong>${safe(bs(c.total))}</strong><small>${safe(usd(c.totalUsdEquivalent))}</small></div>`})}
          ${Section({title:'Productos rápidos',subtitle:'Agrega artículos del inventario sin abandonar el cotizador.',children:productButtons?`<div class="cg-quote-product-grid">${productButtons}</div>`:EmptyState({title:'Sin productos disponibles',description:'Registra inventario para habilitar accesos rápidos.',iconName:'fa-boxes-stacked'})})}
        </div>
      </div>
      ${Section({title:'Ítems del presupuesto',subtitle:q.items?.length?'El subtotal de ítems sustituye al monto manual para el cálculo.':'Sin ítems: el cálculo utiliza el monto manual.',actions:Badge(`${q.items?.length||0} ítems`,q.items?.length?'brand':'neutral'),children:itemRows.length?DataTable({columns:[{key:'name',label:'Producto',render:(row)=>safe(row.name)},{key:'qtyCell',label:'Cantidad',align:'right',render:(row)=>row.qtyCell},{key:'priceCell',label:'Precio USD',align:'right',render:(row)=>row.priceCell},{key:'subtotalCell',label:'Subtotal USD',align:'right',render:(row)=>row.subtotalCell},{key:'action',label:'Acción',render:(row)=>row.action}],rows:itemRows}):EmptyState({title:'Cotización sin ítems',description:'Usa Productos rápidos o introduce un monto manual.',iconName:'fa-file-invoice'})})}
    </section>`;
  },
  mount(state,{Store,Toast,Modal}) {
    const applyQuoteForm=(form,{notify=false}={})=>{
      const data=Object.fromEntries(new FormData(form).entries());
      Store.update((draft)=>{
        draft.quote={...draft.quote,...data,manualAmount:Number(data.manualAmount||0)};
        ['iva','igtf','islr','retIva','retIslr','custom'].forEach((key)=>{draft.quote.taxes[key].active=Boolean(data[`tax_${key}_active`]);draft.quote.taxes[key].rate=Number(data[`tax_${key}_rate`]||0);});
      });
      if(notify)Toast.show('Cotización actualizada.','success');
    };
    mountSubmit('#quoteForm',(_data,form)=>applyQuoteForm(form,{notify:true}));
    qsa('#quoteForm [data-tax-control], #quoteForm input[name="manualAmount"], #quoteForm select, #quoteForm textarea').forEach((control)=>{
      control.addEventListener('change',()=>{const form=qs('#quoteForm');if(form)applyQuoteForm(form);});
      if(control.matches('input[type="number"]'))control.addEventListener('input',()=>{const form=qs('#quoteForm');if(form)applyQuoteForm(form);});
    });
    qs('#btnPdf')?.addEventListener('click',()=>PdfService.generateQuote(Store.get()));
    qs('#btnSaveHistory')?.addEventListener('click',()=>{Store.update((draft)=>{draft.history.unshift({id:uid('doc'),quote:JSON.parse(JSON.stringify(draft.quote)),calculation:JSON.parse(JSON.stringify(draft.calculation)),createdAt:new Date().toISOString(),clientName:draft.clients.find((client)=>client.id===draft.quote.clientId)?.name||'Sin cliente'});draft.auditLog.unshift({id:uid('log'),module:'cotizacion',action:'save-history',at:new Date().toISOString()});});Toast.show('Documento guardado en histórico.','success');});
    qs('#btnClearQuote')?.addEventListener('click',()=>Modal.confirm({title:'Limpiar cotización',body:'Se borrarán el monto manual, observación e ítems del borrador actual.',confirmText:'Limpiar borrador',onConfirm:()=>Store.update((draft)=>{draft.quote.manualAmount=0;draft.quote.items=[];draft.quote.observation='';})}));
    qs('#btnSeniat')?.addEventListener('click',async()=>{const selected=Store.get().clients.find((client)=>client.id===Store.get().quote.clientId);if(!selected?.rif)return Toast.show('Selecciona un cliente con RIF.','warning');try{const result=await SeniatService.lookup(selected.rif,Store.get().settings.backendUrl);Store.update((draft)=>{if(result.retentionRate){draft.quote.taxes.retIva.active=true;draft.quote.taxes.retIva.rate=Number(result.retentionRate);}});Toast.show(result.manual_required?'SENIAT requiere validación manual/captcha.':'Retención sugerida actualizada.',result.manual_required?'warning':'success');}catch(error){Toast.show(error.message,'error');}});
    qsa('[data-add-product]').forEach((button)=>button.addEventListener('click',()=>{Store.update((draft)=>{const product=draft.inventory.find((item)=>item.id===button.dataset.addProduct);if(!product)return;const existing=draft.quote.items.find((item)=>item.productId===product.id);if(existing)existing.qty+=1;else draft.quote.items.push({id:uid('item'),productId:product.id,name:product.name,qty:1,priceUsd:product.priceUsd});});Toast.show('Producto agregado al presupuesto.','success');}));
    qsa('[data-remove-item]').forEach((button)=>button.addEventListener('click',()=>Store.update((draft)=>{draft.quote.items=draft.quote.items.filter((item)=>item.id!==button.dataset.removeItem);}))); 
  }
};

function taxSwitch(key,label,config,amount){
  const checked=config.active?'checked':'';
  return `<article class="cg-ui-card cg-ui-card-body cg-quote-tax ${config.active?'is-active':''}"><div class="cg-ui-row"><label class="cg-check-row"><input data-tax-control type="checkbox" name="tax_${safe(key)}_active" ${checked}><span><strong>${safe(label)}</strong><small>${config.active?'Activo':'Inactivo'}</small></span></label><strong class="cgx-num">${safe(bs(amount||0))}</strong></div><label class="cg-ui-stack cg-ui-gap-xs"><span class="cgx-label">Porcentaje</span><input data-tax-control class="input" type="number" step="0.01" min="0" name="tax_${safe(key)}_rate" value="${safe(config.rate||0)}"></label></article>`;
}
function line(label,value,hint){return `<div class="cg-quote-summary-line"><dt><span>${safe(label)}</span><small>${safe(hint||'')}</small></dt><dd class="cgx-num">${safe(value)}</dd></div>`;}
