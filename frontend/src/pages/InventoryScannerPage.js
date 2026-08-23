import { startNativeBarcodeScan, startHtml5QrScanner } from '../services/qrBarcodeService.js';
import { ExportService } from '../services/exportService.js';
import { PageHeader, Button, Field, Select, Section, Table, Badge, EmptyState } from '../components/ui/index.js';
import { escapeHtml } from '../utils/dom.js';

let stopScanner = null;
const safe=(value)=>escapeHtml(String(value??''));

function findProduct(products, code) {
  const normalized=String(code||'').trim().toLowerCase();
  if(!normalized)return null;
  return products.find((product)=>[product.id,product.sku,product.barcode,product.qrCode].filter(Boolean).some((value)=>String(value).trim().toLowerCase()===normalized));
}

function scanRows(scans=[]){
  return scans.slice(0,50).map((scan)=>`<tr><td>${safe(scan.createdAt?.slice(0,19).replace('T',' ')||'—')}</td><td><code class="cg-ui-code">${safe(scan.code)}</code></td><td>${safe(scan.productName||'No identificado')}</td><td class="cgx-num">${safe(scan.systemStock ?? '—')}</td><td class="cgx-num">${safe(scan.quantity)}</td><td class="cgx-num">${scan.difference===null||scan.difference===undefined?'—':safe(scan.difference)}</td><td>${Badge(scan.action==='conteo'?'Conteo físico':scan.action==='verificacion'?'Verificación':'Incidencia',scan.action==='incidencia'?'warning':'neutral')}</td></tr>`);
}

export const InventoryScannerPage = {
  render(state) {
    const scans=state.inventoryScans||[];
    const rows=scanRows(scans);
    return `<section class="cg-page-stack scanner-page">
      ${PageHeader({eyebrow:'Inventario · Conteo físico',title:'Escáner QR / código de barras',description:'Identifica productos y registra evidencia de conteo físico. Esta pantalla no modifica existencias directamente: entradas, salidas y ajustes deben pasar por el flujo transaccional de Inventario, Compras o Ventas.',actions:`${Button({id:'btnExportScans',label:'Exportar lecturas',iconName:'fa-file-export',variant:'secondary'})}${Button({label:'Generar etiquetas',iconName:'fa-qrcode',variant:'secondary',route:'qr'})}${Button({label:'Ir a inventario',iconName:'fa-boxes-stacked',variant:'primary',route:'inventario'})}`})}
      <div class="cg-ui-grid cg-ui-grid-two">
        ${Section({title:'Lector',subtitle:'Usa BarcodeDetector nativo cuando está disponible o HTML5 QR como alternativa.',children:`<div id="scannerRegion" class="scanner-region"><video id="barcodeVideo" playsinline muted></video><div id="html5QrRegion"></div><p id="scannerStatus" class="cg-ui-muted">Selecciona un modo para iniciar.</p></div><div class="cg-record-actions">${Button({id:'btnNativeScan',label:'Cámara nativa',iconName:'fa-camera',variant:'primary'})}${Button({id:'btnHtml5Scan',label:'HTML5 QR',iconName:'fa-qrcode',variant:'secondary'})}${Button({id:'btnStopScan',label:'Detener',iconName:'fa-stop',variant:'danger'})}</div>`})}
        ${Section({title:'Registrar evidencia',subtitle:'El conteo queda en la bitácora local de inspección; no altera stock ni crea un movimiento contable/inventario.',children:`<div class="cg-record-fields">${Field({labelKey:'Código escaneado/manual',name:'manualCode',id:'manualCode',placeholder:'SKU, EAN, barcode o QR'})}${Field({labelKey:'Cantidad contada',name:'scanQty',id:'scanQty',type:'number',value:'1',attrs:'min="0" step="0.001"'})}${Select({labelKey:'Tipo de evidencia',name:'scanAction',value:'conteo',attrs:'id="scanAction"',options:[{value:'conteo',label:'Conteo físico'},{value:'verificacion',label:'Verificación de etiqueta'},{value:'incidencia',label:'Incidencia / diferencia'}]})}</div>${Button({id:'btnRegisterScan',label:'Registrar evidencia',iconName:'fa-check',variant:'primary'})}<div id="scanResult" class="cg-ui-card cg-ui-card-body cg-scan-result" aria-live="polite"></div>`})}
      </div>
      ${Section({title:'Bitácora de conteo',subtitle:'Compara stock del sistema con cantidad física y usa Inventario para registrar el ajuste autorizado.',children:rows.length?Table({headers:[{label:'Fecha'},{label:'Código'},{label:'Producto'},{label:'Stock sistema'},{label:'Contado'},{label:'Diferencia'},{label:'Tipo'}],rows}):EmptyState({title:'Sin lecturas todavía',description:'Escanea o escribe un código para iniciar el conteo físico.',iconName:'fa-barcode'})})}
    </section>`;
  },
  mount(state,{Store,Toast}) {
    const status=document.getElementById('scannerStatus');
    const manual=document.getElementById('manualCode');
    const result=document.getElementById('scanResult');
    const stop=()=>{stopScanner?.();stopScanner=null;if(status)status.textContent='Escáner detenido.';};
    const resolve=(code)=>{
      if(manual)manual.value=code;
      const product=findProduct(Store.get().inventory||[],code);
      if(result)result.innerHTML=product?`<div class="cg-ui-row"><span class="cgx-metric-icon"><i class="fa-solid fa-box"></i></span><div><strong>${safe(product.sku)} · ${safe(product.name)}</strong><p class="cg-ui-muted">Stock sistema: ${safe(product.stock ?? 0)}</p></div></div>`:`<div class="cg-ui-row"><span class="cgx-metric-icon"><i class="fa-solid fa-triangle-exclamation"></i></span><div><strong>Código no identificado</strong><p class="cg-ui-muted">Verifica la etiqueta o registra el producto antes de conciliar.</p></div></div>`;
      if(product)Toast.show(`Producto detectado: ${product.name}`,'success');
    };
    document.getElementById('btnNativeScan')?.addEventListener('click',async()=>{try{stop();if(status)status.textContent='Solicitando cámara…';stopScanner=await startNativeBarcodeScan(document.getElementById('barcodeVideo'),resolve);if(status)status.textContent='Escaneando con BarcodeDetector nativo…';}catch(error){Toast.show(error.message,'warning');if(status)status.textContent=error.message;}});
    document.getElementById('btnHtml5Scan')?.addEventListener('click',async()=>{try{stop();if(status)status.textContent='Iniciando lector HTML5…';stopScanner=await startHtml5QrScanner('html5QrRegion',resolve);if(status)status.textContent='Escaneando QR / barcode…';}catch(error){Toast.show(error.message,'warning');if(status)status.textContent=error.message;}});
    document.getElementById('btnStopScan')?.addEventListener('click',stop);
    document.getElementById('btnRegisterScan')?.addEventListener('click',()=>{
      const code=manual?.value?.trim();
      if(!code)return Toast.show('Coloca o escanea un código.','warning');
      const quantity=Number(document.getElementById('scanQty')?.value ?? NaN);
      if(!Number.isFinite(quantity)||quantity<0)return Toast.show('La cantidad contada debe ser cero o mayor.','warning');
      const product=findProduct(Store.get().inventory||[],code);
      const systemStock=product?Number(product.stock||0):null;
      const action=document.getElementById('scanAction')?.value||'conteo';
      Store.update((draft)=>{draft.inventoryScans=[{id:`scan-${Date.now()}`,createdAt:new Date().toISOString(),code,productId:product?.id||null,productName:product?.name||'',quantity,systemStock,difference:product?Number((quantity-systemStock).toFixed(3)):null,action},...(draft.inventoryScans||[])];});
      Toast.show(product?`Conteo guardado. Diferencia: ${(quantity-systemStock).toLocaleString('es-VE')}.`:'Evidencia guardada para código no identificado.',product?'success':'warning');
    });
    document.getElementById('btnExportScans')?.addEventListener('click',()=>{const scans=Store.get().inventoryScans||[];if(!scans.length)return Toast.show('No hay lecturas para exportar.','warning');ExportService.downloadTxt('lecturas-inventario.txt',scans,'Evidencia de conteo físico');});
  }
};
