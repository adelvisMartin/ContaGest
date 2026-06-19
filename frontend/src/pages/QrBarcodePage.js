import { productQrPayload, renderQrCanvas, downloadQrPng } from '../services/qrBarcodeService.js';
import { ExportService } from '../services/exportService.js';
import { PageHeader, Button, Select, Section, Table } from '../components/ui/index.js';

export const QrBarcodePage = {
  render(state) {
    const products = state.inventory || [];
    const selected = products[0] || {};
    const rows = products.map((p) => `<tr><td><strong>${p.sku}</strong></td><td>${p.name}</td><td><code>${p.barcode || p.sku}</code></td><td>${p.stock}</td><td>${Button({ label:'QR', iconName:'fa-qrcode', variant:'secondary', attrs:`type="button" data-id="${p.id}"`, className:'btnQrProduct' })}</td></tr>`);
    return `<section class="cgx-page qr-page">
      ${PageHeader({ eyebrow:'QR y códigos de barras', title:'Enlace inteligente de productos, documentos e inventario', description:'Genera QR para productos, facturas, enlaces internos y etiquetas; usa códigos de barra para inventario físico y ventas rápidas.', actions:`${Button({ label:'Abrir escáner', iconName:'fa-barcode', variant:'primary', route:'inventario-scan' })}${Button({ id:'btnExportLabels', label:'Exportar etiquetas', iconName:'fa-tags', variant:'secondary' })}`, meta:['Etiquetas inventario', 'QR verificable', 'Barcode operativo'] })}
      <section class="cgx-dashboard-grid-secondary">
        ${Section({ title:'Generador QR', subtitle:'Selecciona el tipo y producto; luego genera el código verificable.', children:`<div class="cg-record-fields">${Select({ labelKey:'Tipo', name:'qrType', value:'product', attrs:'id="qrType"', options:[{value:'product',label:'Producto'}, {value:'invoice',label:'Factura'}, {value:'url',label:'URL interna'}, {value:'custom',label:'Texto libre'}] })}${Select({ labelKey:'Producto', name:'qrProduct', attrs:'id="qrProduct"', options:products.map((p) => ({ value:p.id, label:`${p.sku} · ${p.name}` })) })}</div><label class="cgx-field mt-4"><span class="label cgx-label">Contenido / payload</span><textarea id="qrPayload" class="textarea cgx-field-normalized" style="min-height:118px">${productQrPayload(selected)}</textarea></label><div class="cgx-section-actions mt-4">${Button({ id:'btnGenerateQr', label:'Generar', iconName:'fa-wand-magic-sparkles', variant:'primary' })}${Button({ id:'btnDownloadQr', label:'Descargar PNG', iconName:'fa-download', variant:'secondary' })}</div>` })}
        ${Section({ title:'Vista previa', subtitle:'Corrección de error media para balancear peso y lectura.', children:`<div class="qr-canvas-box"><canvas id="qrCanvas" width="260" height="260"></canvas></div><p class="mt-4 font-bold text-slate-600 dark:text-slate-300">Para documentos fiscales, el QR debe apuntar a un endpoint verificable con hash.</p>` })}
      </section>
      ${Section({ title:'Productos enlazables', subtitle:'Catálogo listo para etiquetas QR y barcode.', children:Table({ headers:[{label:'SKU'}, {label:'Producto'}, {label:'Código de barras'}, {label:'Stock'}, {label:'Acción'}], rows }) })}
    </section>`;
  },
  mount(state, { Toast }) {
    const products = state.inventory || [];
    const canvas = document.getElementById('qrCanvas');
    const payload = document.getElementById('qrPayload');
    const productSelect = document.getElementById('qrProduct');
    const type = document.getElementById('qrType');
    const updatePayload = () => {
      const product = products.find((p) => p.id === productSelect?.value) || products[0] || {};
      if (type?.value === 'product') payload.value = productQrPayload(product);
      else if (type?.value === 'invoice') payload.value = JSON.stringify({ app:'ContaGest-VE', type:'fiscal-document', number:'FAC-2026-001', hash:'server-side-hash-pendiente', verifyUrl:`${location.origin}/verify/FAC-2026-001` });
      else if (type?.value === 'url') payload.value = `${location.origin}/#/${product.sku || 'dashboard'}`;
    };
    const generate = async () => { await renderQrCanvas(canvas, payload.value); Toast.show('QR generado.', 'success'); };
    productSelect?.addEventListener('change', () => { updatePayload(); generate(); });
    type?.addEventListener('change', () => { updatePayload(); generate(); });
    document.getElementById('btnGenerateQr')?.addEventListener('click', generate);
    document.getElementById('btnDownloadQr')?.addEventListener('click', async () => { await downloadQrPng('contagest-qr.png', payload.value); Toast.show('QR descargado.', 'success'); });
    document.getElementById('btnExportLabels')?.addEventListener('click', () => ExportService.downloadTxt('etiquetas-inventario.txt', products.map((p) => ({ sku:p.sku, producto:p.name, barcode:p.barcode || p.sku, qr: productQrPayload(p) })), 'Etiquetas QR / Barcode ContaGest-VE'));
    document.querySelectorAll('.btnQrProduct').forEach((btn) => btn.addEventListener('click', () => { productSelect.value = btn.dataset.id; type.value = 'product'; updatePayload(); generate(); }));
    updatePayload(); generate();
  }
};
