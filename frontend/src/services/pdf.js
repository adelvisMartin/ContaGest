import { bs, usd, shortDate, dateTime } from '../core/formatters.js';

const text = (doc, value, x, y, options = {}) => doc.text(String(value ?? ''), x, y, options);
const moneyBs = (value) => bs(Number(value) || 0);
const moneyUsd = (value) => usd(Number(value) || 0);
const clampText = (doc, value, width) => doc.splitTextToSize(String(value ?? ''), width);

const hexToRgb = (hex, fallback = [9, 36, 95]) => {
  const raw = String(hex || '').replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return fallback;
  return [parseInt(raw.slice(0, 2), 16), parseInt(raw.slice(2, 4), 16), parseInt(raw.slice(4, 6), 16)];
};

const drawLogo = (doc, settings, x, y, size, primary) => {
  if (settings.companyLogoDataUrl) {
    try {
      doc.addImage(settings.companyLogoDataUrl, 'PNG', x, y, size, size, undefined, 'FAST');
      return;
    } catch {
      try {
        doc.addImage(settings.companyLogoDataUrl, 'JPEG', x, y, size, size, undefined, 'FAST');
        return;
      } catch {
        // Fall back to initials below.
      }
    }
  }
  doc.setFillColor(...primary);
  doc.roundedRect(x, y, size, size, 8, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  const initials = String(settings.companyTradeName || settings.companyName || 'CG').split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'CG';
  text(doc, initials, x + size / 2, y + size / 2 + 6, { align: 'center' });
};

const drawFooter = (doc, settings, pageW, margin, page = 1) => {
  const muted = [86, 99, 117];
  const line = [214, 224, 234];
  doc.setDrawColor(...line);
  doc.line(margin, 734, pageW - margin, 734);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...muted);
  const footer = settings.documentFooter || 'Documento referencial sujeto a validación normativa, correlativo fiscal, revisión contable y auditoría interna.';
  text(doc, clampText(doc, footer, 360), margin, 748);
  text(doc, `Página ${page} · ${dateTime(new Date())}`, pageW - margin, 748, { align: 'right' });
};

const drawSectionTitle = (doc, title, x, y, primary) => {
  doc.setTextColor(...primary);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  text(doc, title.toUpperCase(), x, y);
};

const rowValue = (value) => String(value ?? '').trim() || '-';

export const PdfService = {
  generateQuote(state, record = null) {
    const source = record || { quote: state.quote, calculation: state.calculation, createdAt: new Date().toISOString() };
    const { quote = {}, calculation = {} } = source;
    const client = state.clients.find((item) => item.id === quote.clientId) || {};

    if (!window.jspdf?.jsPDF) {
      window.print();
      return;
    }

    const doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'letter' });
    const settings = state.settings || {};
    const pageW = 612;
    const pageH = 792;
    const margin = 40;
    const contentW = pageW - margin * 2;
    const primary = hexToRgb(settings.brandPrimary, [9, 36, 95]);
    const primarySoft = [232, 238, 248];
    const slate = [15, 23, 42];
    const muted = [86, 99, 117];
    const line = [214, 224, 234];
    const soft = [248, 250, 252];
    const success = [15, 118, 110];

    const company = settings.companyTradeName || settings.companyName || 'ContaGest-VE Enterprise';
    const legalName = settings.companyName || company;
    const rif = settings.companyRif || 'RIF no configurado';
    const invoice = quote.numeroFactura || 'Documento';
    const order = quote.orden || 'Orden interna';
    const issued = dateTime(source.createdAt || new Date());
    const documentDate = shortDate(quote.date || source.createdAt || new Date());

    const drawHeader = (page = 1) => {
      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, pageW, pageH, 'F');
      doc.setFillColor(...primary);
      doc.rect(0, 0, pageW, 10, 'F');

      drawLogo(doc, settings, margin, 28, 50, primary);

      doc.setTextColor(...slate);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(17);
      text(doc, clampText(doc, company, 255), margin + 62, 42);
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...muted);
      text(doc, `Razón social: ${legalName}`, margin + 62, 60, { maxWidth: 280 });
      text(doc, `RIF: ${rif}`, margin + 62, 74);
      text(doc, settings.companySlogan || 'Documento comercial tributario · Vista previa de gestión', margin + 62, 88, { maxWidth: 315 });

      doc.setDrawColor(...line);
      doc.setFillColor(...soft);
      doc.roundedRect(pageW - margin - 170, 28, 170, 70, 10, 10, 'FD');
      doc.setTextColor(...primary);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      text(doc, invoice, pageW - margin - 14, 52, { align: 'right' });
      doc.setTextColor(...muted);
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      text(doc, order, pageW - margin - 14, 68, { align: 'right' });
      text(doc, `Emitido: ${issued}`, pageW - margin - 14, 84, { align: 'right' });

      doc.setDrawColor(...line);
      doc.line(margin, 112, pageW - margin, 112);
      doc.setFontSize(7.6);
      doc.setTextColor(...muted);
      const contact = [settings.companyAddress, settings.companyPhone, settings.companyEmail, settings.companyWebsite].filter(Boolean).join('  ·  ');
      text(doc, clampText(doc, contact || 'Datos fiscales de empresa pendientes de configurar', contentW), margin, 126);

      if (page > 1) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(...primary);
        text(doc, `Continuación · ${invoice}`, pageW - margin, 126, { align: 'right' });
      }
    };

    drawHeader(1);

    let y = 160;
    const boxGap = 18;
    const leftW = 258;
    const rightW = contentW - leftW - boxGap;

    drawSectionTitle(doc, 'Cliente', margin, y, primary);
    drawSectionTitle(doc, 'Documento', margin + leftW + boxGap, y, primary);
    y += 10;

    doc.setDrawColor(...line);
    doc.setFillColor(...soft);
    doc.roundedRect(margin, y, leftW, 90, 10, 10, 'FD');
    doc.roundedRect(margin + leftW + boxGap, y, rightW, 90, 10, 10, 'FD');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.7);
    doc.setTextColor(...muted);
    const cX = margin + 14;
    text(doc, `Nombre: ${rowValue(client.name || quote.clientName)}`, cX, y + 22, { maxWidth: leftW - 28 });
    text(doc, `RIF/Cédula: ${rowValue(client.rif)}`, cX, y + 40, { maxWidth: leftW - 28 });
    text(doc, `Correo: ${rowValue(client.email)}`, cX, y + 58, { maxWidth: leftW - 28 });
    text(doc, `Dirección: ${rowValue(client.address)}`, cX, y + 76, { maxWidth: leftW - 28 });

    const dX = margin + leftW + boxGap + 14;
    text(doc, `Fecha del documento: ${documentDate}`, dX, y + 22);
    text(doc, `Fecha de emisión: ${issued}`, dX, y + 40);
    text(doc, `Moneda: ${quote.currency || 'VES'}`, dX, y + 58);
    text(doc, `Tasa BCV: ${state.bcv?.rate ? `${moneyBs(state.bcv.rate)} / USD` : 'Pendiente'}`, dX, y + 76);

    y += 124;
    drawSectionTitle(doc, 'Detalle de productos / servicios', margin, y, primary);
    y += 14;

    const table = {
      x: margin,
      y,
      w: contentW,
      cols: [286, 58, 92, 92],
      headers: ['Descripción', 'Cant.', 'Precio', 'Subtotal']
    };

    const drawTableHeader = () => {
      doc.setFillColor(...primary);
      doc.roundedRect(table.x, y, table.w, 24, 6, 6, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      let x = table.x + 12;
      table.headers.forEach((header, index) => {
        text(doc, header, x, y + 16, { align: index === 0 ? 'left' : 'right' });
        x += table.cols[index];
      });
      y += 28;
    };

    drawTableHeader();

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...slate);

    const items = Array.isArray(quote.items) ? quote.items : [];
    const normalizedItems = items.length ? items : [{ name: `Monto manual (${quote.currency || 'VES'})`, qty: 1, priceUsd: quote.manualAmount || 0 }];
    normalizedItems.forEach((item, index) => {
      if (y > 646) {
        drawFooter(doc, settings, pageW, margin, doc.internal.getNumberOfPages());
        doc.addPage();
        drawHeader(doc.internal.getNumberOfPages());
        y = 152;
        drawTableHeader();
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(...slate);
      }
      const subtotal = Number(item.qty || 0) * Number(item.priceUsd || item.price || 0);
      const descriptionLines = clampText(doc, item.name || item.description || 'Producto', 260);
      const rowH = Math.max(24, 14 + descriptionLines.length * 11);
      if (index % 2 === 0) {
        doc.setFillColor(252, 253, 255);
        doc.rect(table.x, y - 10, table.w, rowH, 'F');
      }
      doc.setTextColor(...slate);
      text(doc, descriptionLines, table.x + 12, y + 4);
      text(doc, String(item.qty || 0), table.x + table.cols[0] + table.cols[1] - 8, y + 4, { align: 'right' });
      text(doc, moneyUsd(item.priceUsd || item.price || 0), table.x + table.cols[0] + table.cols[1] + table.cols[2] - 8, y + 4, { align: 'right' });
      text(doc, moneyUsd(subtotal), table.x + table.w - 12, y + 4, { align: 'right' });
      doc.setDrawColor(...line);
      doc.line(table.x, y + rowH - 10, table.x + table.w, y + rowH - 10);
      y += rowH;
    });

    y += 20;
    if (y > 560) {
      drawFooter(doc, settings, pageW, margin, doc.internal.getNumberOfPages());
      doc.addPage();
      drawHeader(doc.internal.getNumberOfPages());
      y = 158;
    }

    const summaryX = pageW - margin - 236;
    const obsW = contentW - 256;
    drawSectionTitle(doc, 'Observación', margin, y, primary);
    drawSectionTitle(doc, 'Resumen tributario', summaryX, y, primary);
    y += 12;
    const summaryY = y;

    doc.setDrawColor(...line);
    doc.setFillColor(...soft);
    doc.roundedRect(margin, summaryY, obsW, 122, 10, 10, 'FD');
    doc.roundedRect(summaryX, summaryY, 236, 156, 10, 10, 'FD');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...muted);
    text(doc, clampText(doc, quote.observation || settings.documentLegalNote || 'Sin observaciones.', obsW - 26), margin + 13, summaryY + 20);

    const taxRows = [
      ['Base imponible', moneyBs(calculation.baseImponible)],
      ['IVA', moneyBs(calculation.iva)],
      ['IGTF', moneyBs(calculation.igtf)],
      ['ISLR', moneyBs(calculation.islr)],
      ['Otro tributo', moneyBs(calculation.custom)],
      ['Retención IVA', `-${moneyBs(calculation.retIva)}`],
      ['Retención ISLR', `-${moneyBs(calculation.retIslr)}`]
    ];

    let sy = summaryY + 20;
    taxRows.forEach(([label, value]) => {
      doc.setTextColor(...muted);
      doc.setFont('helvetica', 'normal');
      text(doc, label, summaryX + 14, sy);
      doc.setTextColor(...slate);
      doc.setFont('helvetica', 'bold');
      text(doc, value, summaryX + 222, sy, { align: 'right' });
      sy += 18;
    });

    const totalY = summaryY + 170;
    doc.setFillColor(...primary);
    doc.roundedRect(summaryX, totalY, 236, 62, 10, 10, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.7);
    text(doc, 'TOTAL NETO', summaryX + 14, totalY + 20);
    doc.setFontSize(18);
    text(doc, moneyBs(calculation.total), summaryX + 14, totalY + 44);
    doc.setFontSize(9);
    doc.setTextColor(214, 226, 255);
    text(doc, moneyUsd(calculation.totalUsdEquivalent), summaryX + 222, totalY + 44, { align: 'right' });

    doc.setDrawColor(...line);
    doc.setFillColor(...primarySoft);
    doc.roundedRect(margin, totalY, obsW, 62, 10, 10, 'FD');
    doc.setTextColor(...primary);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    text(doc, 'CONTROL DOCUMENTAL', margin + 14, totalY + 18);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...muted);
    doc.setFontSize(8);
    text(doc, clampText(doc, `Generado por ${company}. Fuente de tasa: ${state.bcv?.source || 'Pendiente'}. ${settings.documentLegalNote || ''}`, obsW - 28), margin + 14, totalY + 34);

    doc.setTextColor(...success);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    text(doc, 'Formato alineado: membrete, cliente, documento, detalle, tributos y total.', margin + 14, totalY + 55);

    drawFooter(doc, settings, pageW, margin, doc.internal.getNumberOfPages());
    doc.save(`${quote.numeroFactura || 'documento'}-${quote.orden || 'orden'}.pdf`);
  }
};
