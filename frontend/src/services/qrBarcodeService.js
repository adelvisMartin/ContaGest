import { BackendApi } from './backendApi.js';

export const SUPPORTED_BARCODE_FORMATS = ['qr_code','code_128','ean_13','ean_8','upc_a','upc_e','code_39','itf'];

export function productQrPayload(product, baseUrl = location.origin) {
  return JSON.stringify({
    app: 'ContaGest-VE',
    type: 'inventory-product',
    sku: product?.sku || '',
    barcode: product?.barcode || product?.sku || '',
    id: product?.id || '',
    name: product?.name || '',
    url: `${baseUrl}/#producto/${encodeURIComponent(product?.sku || product?.id || '')}`,
    issuedAt: new Date().toISOString()
  });
}

function drawEmergencyQrLike(canvas, payload, options = {}) {
  const size = options.width || 220;
  const ctx = canvas.getContext('2d');
  canvas.width = size;
  canvas.height = size;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, size, size);
  const cells = 29;
  const margin = 12;
  const cell = Math.floor((size - margin * 2) / cells);
  const start = Math.floor((size - cell * cells) / 2);
  const hash = Array.from(String(payload)).reduce((acc, ch) => ((acc << 5) - acc + ch.charCodeAt(0)) >>> 0, 2166136261);
  const bit = (x, y) => ((hash + x * 73856093 + y * 19349663 + (x * y * 83492791)) >>> 0) % 5 < 2;
  const finder = (x, y) => {
    ctx.fillStyle = '#061126';
    ctx.fillRect(start + x * cell, start + y * cell, cell * 7, cell * 7);
    ctx.fillStyle = '#fff';
    ctx.fillRect(start + (x + 1) * cell, start + (y + 1) * cell, cell * 5, cell * 5);
    ctx.fillStyle = '#061126';
    ctx.fillRect(start + (x + 2) * cell, start + (y + 2) * cell, cell * 3, cell * 3);
  };
  finder(0, 0); finder(cells - 7, 0); finder(0, cells - 7);
  ctx.fillStyle = '#061126';
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      const inFinder = (x < 8 && y < 8) || (x >= cells - 8 && y < 8) || (x < 8 && y >= cells - 8);
      if (!inFinder && bit(x, y)) ctx.fillRect(start + x * cell, start + y * cell, cell, cell);
    }
  }
}

export async function renderQrCanvas(canvas, payload, options = {}) {
  if (!canvas) return false;
  try {
    const QRCode = await import('qrcode').then((mod) => mod.default || mod).catch(() => null);
    if (QRCode?.toCanvas) {
      await QRCode.toCanvas(canvas, payload, { width: options.width || 220, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#061126', light: '#ffffff' } });
      return true;
    }
    throw new Error('QR library unavailable');
  } catch (error) {
    try {
      if (window.QRCode?.toCanvas) {
        await window.QRCode.toCanvas(canvas, payload, { width: options.width || 220, margin: 2, errorCorrectionLevel: 'M' });
        return true;
      }
    } catch {}
    drawEmergencyQrLike(canvas, payload, options);
    return false;
  }
}

export async function downloadQrPng(filename, payload) {
  try {
    const response = await fetch(`${BackendApi.baseUrl}/qr/generate`, { method: 'POST', headers: { 'content-type':'application/json', ...(BackendApi.tenantId ? { 'x-tenant-id': BackendApi.tenantId } : {}) }, body: JSON.stringify({ payload, format: 'png' }) });
    if (!response.ok) throw new Error('QR backend unavailable');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename.endsWith('.png') ? filename : `${filename}.png`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 800);
    return true;
  } catch (error) {
    const canvas = document.createElement('canvas');
    await renderQrCanvas(canvas, payload, { width: 480 });
    const a = document.createElement('a'); a.href = canvas.toDataURL('image/png'); a.download = filename.endsWith('.png') ? filename : `${filename}.png`; a.click();
    return false;
  }
}

export async function startNativeBarcodeScan(video, onDetected) {
  if (!('BarcodeDetector' in window)) throw new Error('BarcodeDetector no está disponible en este navegador. Usa escaneo HTML5 o entrada manual.');
  const detector = new window.BarcodeDetector({ formats: SUPPORTED_BARCODE_FORMATS });
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
  video.srcObject = stream;
  await video.play();
  let active = true;
  const tick = async () => {
    if (!active) return;
    try {
      const codes = await detector.detect(video);
      if (codes?.length) onDetected(codes[0].rawValue || codes[0].rawData || '');
    } catch {}
    requestAnimationFrame(tick);
  };
  tick();
  return () => { active = false; stream.getTracks().forEach((track) => track.stop()); };
}

export async function startHtml5QrScanner(elementId, onDetected) {
  if (!window.Html5Qrcode) throw new Error('html5-qrcode no cargó. Usa entrada manual o revisa conexión/CDN.');
  const scanner = new window.Html5Qrcode(elementId);
  await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 250, height: 250 } }, (decodedText) => onDetected(decodedText));
  return () => scanner.stop().catch(() => null);
}
