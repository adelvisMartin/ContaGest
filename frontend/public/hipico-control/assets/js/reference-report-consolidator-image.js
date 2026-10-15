import { consolidatedVisibleMatrix } from './reference-report-consolidator-ui.js';

/**
 * PNG is rendered from the exact filtered, paginated, ordered visible matrix.
 * No html2canvas/network/fonts/CDN; draws escaped text via Canvas API only.
 */
export async function consolidatedPngBlob(model) {
  if (typeof document === 'undefined') throw new Error('Solo puede exportarse PNG desde la aplicación.');
  const matrix = consolidatedVisibleMatrix(model);
  const width = 1720, cellWidth = width / model.options.columnOrder.length;
  const rowHeight = 34, top = 125, height = top + matrix.length * rowHeight + 58;
  if (height > 3200) throw new Error('Demasiadas filas para exportar una imagen.');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('El dispositivo no puede preparar la imagen.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#173157';
  ctx.font = 'bold 24px sans-serif';
  ctx.fillText('Control Hípico · Consolidador de saldos', 20, 38);
  ctx.font = '16px sans-serif';
  ctx.fillText(model.groupName+' · '+model.date+' · Página '+model.page+'/'+model.pages, 20, 67);
  ctx.fillText('Vista filtrada: '+model.matchingCount+' cuentas · '+model.pageRows.length+' filas exportadas', 20, 92);
  ctx.textBaseline = 'middle';
  for (let r = 0; r < matrix.length; r++) {
    const y = top + r * rowHeight;
    ctx.fillStyle = r === 0 ? '#dce7f5' : r % 2 === 0 ? '#f1f4f8' : '#ffffff';
    ctx.fillRect(0, y, width, rowHeight);
    for (let c = 0; c < matrix[r].length; c++) {
      const x = c * cellWidth + 8;
      ctx.fillStyle = '#142a48';
      ctx.font = r === 0 ? 'bold 12px sans-serif' : '12px sans-serif';
      const raw = String(matrix[r][c] || '');
      let text = raw;
      while (text.length > 2 && ctx.measureText(text).width > cellWidth - 15) text = text.slice(0, -2) + '…';
      ctx.fillText(text, x, y + rowHeight / 2, cellWidth - 15);
    }
  }
  ctx.fillStyle = '#344b65';
  ctx.font = '14px sans-serif';
  ctx.fillText('Fuente: workspace local del grupo · no incluye datos de la web de referencia',20,height-22);
  const blob = await new Promise((resolve,reject) => canvas.toBlob(
    value=>value?resolve(value):reject(new Error('No se generó la imagen PNG.')), 'image/png'));
  return blob;
}
