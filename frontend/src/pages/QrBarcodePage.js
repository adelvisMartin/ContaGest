import { productQrPayload, renderQrCanvas, downloadQrPng } from '../services/qrBarcodeService.js';
import { ExportService } from '../services/exportService.js';
import { PageHeader, Button, Select, Section, Table, Textarea, EmptyState, Badge } from '../components/ui/index.js';
import { escapeHtml } from '../utils/dom.js';

const safe=(value)=>escapeHtml(String(value??''));
const verifiedFiscalDocument=(state)=>{
  const candidates=[...(state.fiscalDocuments||[]),...(state.sales||[])];
  return candidates.find((item)=>item?.number&&(item.hash||item.fiscalHash||item.verificationHash))||null;
};

export const QrBarcodePage = {
  render(state) {
    const products=state.inventory||[];
    const selected=products[0]||{};
    const fiscal=verifiedFiscalDocument(state);
    const rows=products.map((product)=>`<tr><td><strong>${safe(product.sku)}</strong></td><td>${safe(product.name)}</td><td><code class="cg-ui-code">${safe(product.barcode||product.sku)}</code></td><td class="cgx-num">${safe(product.stock)}</td><td>${Button({label:'Generar QR',iconName:'fa-qrcode',variant:'secondary',attrs:`type="button" data-id="${safe(product.id)}"`,className:'btnQrProduct'})}</td></tr>`);
    const typeOptions=[{value:'product',label:'Producto'},{value:'url',label:'URL interna'},{value:'custom',label:'Texto libre'},...(fiscal?[{value:'invoice',label:`Documento fiscal ${fiscal.number}`}]:[])];
    return `<section class="cg-page-stack qr-page">
      ${PageHeader({eyebrow:'Inventario · Identificación',title:'QR y códigos de barras',description:'Genera etiquetas para productos y enlaces internos. Los documentos fiscales sólo se habilitan cuando existe un número y hash verificable reales.',actions:`${Button({label:'Abrir escáner',iconName:'fa-barcode',variant:'primary',route:'inventario-scan'})}${Button({id:'btnExportLabels',label:'Exportar etiquetas',iconName:'fa-tags',variant:'secondary'})}`})}
      <div class="cg-ui-grid cg-ui-grid-two">
        ${Section({title:'Generador QR',subtitle:'Selecciona el tipo y revisa el payload antes de generar.',children:`<div class="cg-record-fields">${Select({labelKey:'Tipo',name:'qrType',value:'product',attrs:'id="qrType"',options:typeOptions})}${Select({labelKey:'Producto',name:'qrProduct',attrs:'id="qrProduct"',options:products.map((product)=>({value:product.id,label:`${product.sku} · ${product.name}`}))})}</div>${Textarea({labelKey:'Contenido / payload',name:'qrPayload',value:products.length?productQrPayload(selected):'',attrs:'id="qrPayload" rows="7"'})}<div class="cg-record-actions">${Button({id:'btnGenerateQr',label:'Generar',iconName:'fa-wand-magic-sparkles',variant:'primary'})}${Button({id:'btnDownloadQr',label:'Descargar PNG',iconName:'fa-download',variant:'secondary'})}</div>${!fiscal?`<div class="cg-ui-row-wrap">${Badge('Fiscal deshabilitado','warning')}<span class="cg-ui-muted">No hay un documento real con hash verificable cargado en esta sesión.</span></div>`:''}`})}
        ${Section({title:'Vista previa',subtitle:'El QR se genera sólo con el contenido visible en el campo.',children:`<div class="qr-canvas-box"><canvas id="qrCanvas" width="260" height="260" aria-label="Vista previa del código QR"></canvas></div><p class="cg-ui-muted">Para documentos fiscales, el QR debe incluir una referencia verificable generada por el backend; ContaGest ya no fabrica números ni hashes de ejemplo.</p>`})}
      </div>
      ${products.length?Section({title:'Productos enlazables',subtitle:'Catálogo disponible para etiquetas QR y barcode.',children:Table({headers:[{label:'SKU'},{label:'Producto'},{label:'Código de barras'},{label:'Stock'},{label:'Acción'}],rows})}):EmptyState({title:'Sin productos',description:'Registra inventario antes de generar etiquetas de producto.',iconName:'fa-boxes-stacked'})}
    </section>`;
  },
  mount(state,{Toast}) {
    const products=state.inventory||[];
    const fiscal=verifiedFiscalDocument(state);
    const canvas=document.getElementById('qrCanvas');
    const payload=document.getElementById('qrPayload');
    const productSelect=document.getElementById('qrProduct');
    const type=document.getElementById('qrType');
    const updatePayload=()=>{
      if(!payload)return false;
      const product=products.find((item)=>item.id===productSelect?.value)||products[0]||{};
      if(type?.value==='product')payload.value=product.id||product.sku?productQrPayload(product):'';
      else if(type?.value==='invoice'){
        if(!fiscal){payload.value='';Toast.show('No existe un documento fiscal verificable disponible.','warning');return false;}
        const hash=fiscal.hash||fiscal.fiscalHash||fiscal.verificationHash;
        payload.value=JSON.stringify({app:'ContaGest-VE',type:'fiscal-document',number:fiscal.number,hash,verifyUrl:`${location.origin}/verify/${encodeURIComponent(fiscal.number)}`});
      } else if(type?.value==='url')payload.value=`${location.origin}/?module=${encodeURIComponent(product.sku?'inventario':'dashboard')}${product.id?`&product=${encodeURIComponent(product.id)}`:''}`;
      return Boolean(payload.value.trim());
    };
    const generate=async()=>{if(!payload?.value?.trim())return Toast.show('No hay contenido válido para generar el QR.','warning');await renderQrCanvas(canvas,payload.value);Toast.show('QR generado.','success');};
    productSelect?.addEventListener('change',()=>{if(type?.value!=='custom')updatePayload();generate();});
    type?.addEventListener('change',()=>{if(type.value!=='custom')updatePayload();if(payload?.value?.trim())generate();});
    document.getElementById('btnGenerateQr')?.addEventListener('click',generate);
    document.getElementById('btnDownloadQr')?.addEventListener('click',async()=>{if(!payload?.value?.trim())return Toast.show('Genera un QR válido antes de descargar.','warning');await downloadQrPng('contagest-qr.png',payload.value);Toast.show('QR descargado.','success');});
    document.getElementById('btnExportLabels')?.addEventListener('click',()=>{if(!products.length)return Toast.show('No hay productos para exportar.','warning');ExportService.downloadTxt('etiquetas-inventario.txt',products.map((product)=>({sku:product.sku,producto:product.name,barcode:product.barcode||product.sku,qr:productQrPayload(product)})),'Etiquetas QR / Barcode ContaGest-VE');});
    document.querySelectorAll('.btnQrProduct').forEach((button)=>button.addEventListener('click',()=>{if(productSelect)productSelect.value=button.dataset.id;if(type)type.value='product';updatePayload();generate();}));
    updatePayload();
    if(payload?.value?.trim())generate();
  }
};
