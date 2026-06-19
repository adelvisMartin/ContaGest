import { startNativeBarcodeScan, startHtml5QrScanner } from '../services/qrBarcodeService.js';
import { ExportService } from '../services/exportService.js';
import { PageHeader, Button, Field, Select, Section, Table, Badge } from '../components/ui/index.js';

let stopScanner = null;

function findProduct(products, code) {
  const normalized = String(code || '').trim().toLowerCase();
  return products.find((p) => [p.id, p.sku, p.barcode, p.qrCode].filter(Boolean).some((v) => String(v).trim().toLowerCase() === normalized || String(v).toLowerCase().includes(normalized)));
}

export const InventoryScannerPage = {
  render(state) {
    const scans = state.inventoryScans || [];
    const rows = scans.slice(0,25).map((scan) => `<tr><td>${scan.createdAt?.slice(0,19).replace('T',' ')}</td><td><code>${scan.code}</code></td><td>${scan.productName || 'No identificado'}</td><td>${scan.quantity}</td><td>${Badge(scan.action, 'brand')}</td></tr>`);
    return `<section class="cgx-page scanner-page">
      ${PageHeader({ eyebrow:'Inventario con barcode', title:'Escaneo QR / código de barras', description:'Inventaría productos con cámara, QR, barcode o entrada manual. Cada lectura queda registrada para auditoría y conciliación física.', actions:`${Button({ id:'btnExportScans', label:'Exportar lecturas', iconName:'fa-file-export', variant:'secondary' })}${Button({ label:'Generar etiquetas', iconName:'fa-qrcode', variant:'secondary', route:'qr' })}`, meta:['Cámara móvil', 'Bitácora física', 'Auditoría de stock'] })}
      <section class="cgx-dashboard-grid-secondary">
        ${Section({ title:'Lector', subtitle:'Escaneo nativo o HTML5 QR según soporte del dispositivo.', children:`<div id="scannerRegion" class="scanner-region"><video id="barcodeVideo" playsinline muted></video><div id="html5QrRegion"></div><p id="scannerStatus">Selecciona un modo para iniciar.</p></div><div class="cgx-section-actions mt-4">${Button({ id:'btnNativeScan', label:'Cámara nativa', iconName:'fa-camera', variant:'primary' })}${Button({ id:'btnHtml5Scan', label:'HTML5 QR', iconName:'fa-qrcode', variant:'secondary' })}${Button({ id:'btnStopScan', label:'Detener', iconName:'fa-stop', variant:'danger' })}</div>` })}
        ${Section({ title:'Entrada rápida', subtitle:'Registra una lectura manual cuando la cámara no esté disponible.', children:`<div class="cg-record-fields">${Field({ labelKey:'Código escaneado/manual', name:'manualCode', id:'manualCode', placeholder:'SKU, EAN, Code128 o QR payload' })}${Field({ labelKey:'Cantidad', name:'scanQty', id:'scanQty', type:'number', value:'1', attrs:'min="0.001" step="0.001"' })}${Select({ labelKey:'Acción', name:'scanAction', value:'conteo', attrs:'id="scanAction"', options:[{value:'conteo',label:'Conteo físico'}, {value:'entrada',label:'Entrada'}, {value:'salida',label:'Salida'}, {value:'ajuste',label:'Ajuste'}] })}</div>${Button({ id:'btnRegisterScan', label:'Registrar lectura', iconName:'fa-check', variant:'primary', className:'w-full mt-4' })}<div id="scanResult" class="scan-result mt-4"></div>` })}
      </section>
      ${Section({ title:'Bitácora de escaneos', subtitle:'Lecturas recientes listas para conciliar inventario físico contra sistema.', children:Table({ headers:[{label:'Fecha'}, {label:'Código'}, {label:'Producto'}, {label:'Cantidad'}, {label:'Acción'}], rows, emptyKey:'Sin lecturas todavía.' }) })}
    </section>`;
  },
  mount(state, { Store, Toast }) {
    const status = document.getElementById('scannerStatus');
    const manual = document.getElementById('manualCode');
    const result = document.getElementById('scanResult');
    const stop = () => { stopScanner?.(); stopScanner = null; if (status) status.textContent = 'Escáner detenido.'; };
    const resolve = (code) => {
      if (manual) manual.value = code;
      const product = findProduct(Store.get().inventory || [], code);
      if (result) result.innerHTML = product ? `<div class="pl-chip pl-chip-success"><i class="fa-solid fa-box"></i> ${product.sku} · ${product.name}</div>` : `<div class="pl-chip pl-chip-warning"><i class="fa-solid fa-triangle-exclamation"></i> Código no identificado</div>`;
      if (product) Toast.show(`Producto detectado: ${product.name}`, 'success');
    };
    document.getElementById('btnNativeScan')?.addEventListener('click', async () => {
      try { stop(); if (status) status.textContent = 'Solicitando cámara...'; stopScanner = await startNativeBarcodeScan(document.getElementById('barcodeVideo'), resolve); if (status) status.textContent = 'Escaneando con BarcodeDetector nativo...'; }
      catch (error) { Toast.show(error.message, 'warning'); if (status) status.textContent = error.message; }
    });
    document.getElementById('btnHtml5Scan')?.addEventListener('click', async () => {
      try { stop(); if (status) status.textContent = 'Iniciando html5-qrcode...'; stopScanner = await startHtml5QrScanner('html5QrRegion', resolve); if (status) status.textContent = 'Escaneando QR HTML5...'; }
      catch (error) { Toast.show(error.message, 'warning'); if (status) status.textContent = error.message; }
    });
    document.getElementById('btnStopScan')?.addEventListener('click', stop);
    document.getElementById('btnRegisterScan')?.addEventListener('click', () => {
      const code = manual?.value?.trim();
      if (!code) return Toast.show('Coloca o escanea un código.', 'warning');
      const product = findProduct(Store.get().inventory || [], code);
      const quantity = Number(document.getElementById('scanQty')?.value || 1);
      const action = document.getElementById('scanAction')?.value || 'conteo';
      Store.update((draft) => {
        draft.inventoryScans = [{ id:`scan-${Date.now()}`, createdAt:new Date().toISOString(), code, productId:product?.id || null, productName:product?.name || '', quantity, action }, ...(draft.inventoryScans || [])];
      });
      Toast.show('Lectura registrada.', 'success');
    });
    document.getElementById('btnExportScans')?.addEventListener('click', () => ExportService.downloadTxt('lecturas-inventario.txt', state.inventoryScans || [], 'Lecturas inventario'));
  }
};
