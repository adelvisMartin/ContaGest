import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import PDFDocument from 'pdfkit';
import { asyncHandler, HttpError } from '../../shared/http.js';
import { validateBody } from '../../shared/middleware/validate.js';
import { requireTenant } from '../../shared/middleware/context.js';
import { buildXlsxWorkbook, XlsxLimitError } from './xlsx-writer.js';

const router = Router();
router.use(requireTenant);
const exportSchema = z.object({ filename: z.string().default('contagest-export'), rows: z.array(z.record(z.string(), z.unknown())).default([]), title: z.string().default('ContaGest-VE Export') });
const sheetSchema = z.object({ name: z.string().default('Datos'), rows: z.array(z.record(z.string(), z.unknown())).default([]) });
const xlsxSchema = z.object({ filename: z.string().default('contagest-export'), title: z.string().default('ContaGest-VE Export'), sheets: z.array(sheetSchema).default([]) });
const pdfSchema = z.object({ filename: z.string().default('documento-fiscal'), document: z.record(z.string(), z.unknown()).default({}) });

function safeDownloadBaseName(value: unknown, fallback: string) {
  const normalized = String(value ?? '')
    .replace(/[\u0000-\u001F\u007F"\\/]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 120);
  return normalized || fallback;
}

function spreadsheetSafeText(value: unknown) {
  if (typeof value !== 'string') return String(value ?? '');
  return /^[\s\u0000-\u001F]*[=+\-@]/.test(value) ? `'${value}` : value;
}

const escapeCsv = (value: unknown) => `"${spreadsheetSafeText(value).replaceAll('"', '""')}"`;
function headersFromRows(rows: Record<string, unknown>[]) { return Array.from(new Set(rows.flatMap((r) => Object.keys(r)))); }

router.post('/csv', validateBody(exportSchema), asyncHandler(async (req, res) => {
  const rows = req.body.rows as Record<string, unknown>[];
  const headers = headersFromRows(rows);
  const csv = [headers.map(escapeCsv).join(','), ...rows.map((r) => headers.map((h) => escapeCsv(r[h])).join(','))].join('\n');
  res.setHeader('content-type', 'text/csv; charset=utf-8');
  res.setHeader('content-disposition', `attachment; filename="${safeDownloadBaseName(req.body.filename, 'contagest-export')}.csv"`);
  res.send(csv);
}));

router.post('/txt', validateBody(exportSchema), asyncHandler(async (req, res) => {
  const rows = req.body.rows as Record<string, unknown>[];
  const txt = [req.body.title, '='.repeat(String(req.body.title).length), ...rows.map((r) => Object.entries(r).map(([k,v]) => `${k}: ${v ?? ''}`).join(' | '))].join('\n');
  res.setHeader('content-type', 'text/plain; charset=utf-8');
  res.setHeader('content-disposition', `attachment; filename="${safeDownloadBaseName(req.body.filename, 'contagest-export')}.txt"`);
  res.send(txt);
}));

router.post('/xlsx', validateBody(xlsxSchema), asyncHandler(async (req, res) => {
  try {
    const buffer = buildXlsxWorkbook({ title: req.body.title, sheets: req.body.sheets });
    res.setHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('content-disposition', `attachment; filename="${safeDownloadBaseName(req.body.filename, 'contagest-export')}.xlsx"`);
    res.send(Buffer.from(buffer));
  } catch (error) {
    if (error instanceof XlsxLimitError) {
      throw new HttpError(413, 'La exportación XLSX excede los límites seguros permitidos.', {
        code: error.code,
        detail: error.message
      });
    }
    throw error;
  }
}));

router.post('/fiscal-pdf', validateBody(pdfSchema), asyncHandler(async (req, res) => {
  const documentPayload = req.body.document || {};
  const immutableHash = crypto.createHash('sha256').update(JSON.stringify({ documentPayload, createdAt: new Date().toISOString() })).digest('hex');
  const title = String((documentPayload as any).title || 'Documento fiscal ContaGest-VE');
  const rows = Array.isArray((documentPayload as any).rows) ? (documentPayload as any).rows as Record<string, unknown>[] : [];
  const totals = ((documentPayload as any).totals || {}) as Record<string, unknown>;

  const doc = new PDFDocument({
    size: 'LETTER',
    margin: 42,
    info: { Title: title, Author: 'ContaGest-VE Enterprise', Subject: immutableHash }
  });

  res.setHeader('content-type', 'application/pdf');
  res.setHeader('content-disposition', `attachment; filename="${safeDownloadBaseName(req.body.filename, 'documento-fiscal')}.pdf"`);
  res.setHeader('x-contagest-document-hash', immutableHash);
  doc.pipe(res);

  const navy = '#09245f';
  const blue = '#174ea6';
  const slate = '#0f172a';
  const muted = '#64748b';
  const line = '#d7e0ea';
  const soft = '#f8fafc';
  const gold = '#c88719';

  doc.rect(0, 0, doc.page.width, 96).fill(navy);
  doc.rect(0, 88, doc.page.width, 8).fill(blue);
  doc.roundedRect(doc.page.width - 188, 26, 126, 42, 9).fill(gold);

  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(18).text('ContaGest-VE Enterprise', 42, 30);
  doc.font('Helvetica').fontSize(9).text('Reporte fiscal con hash de integridad y trazabilidad operativa', 42, 54);
  doc.text(`Emitido: ${new Date().toISOString()}`, 42, 70);

  doc.fillColor(navy).font('Helvetica-Bold').fontSize(9).text('HASH', doc.page.width - 176, 42);
  doc.font('Helvetica').fontSize(7).fillColor('#172554').text(immutableHash.slice(0, 18), doc.page.width - 176, 56);

  let y = 122;
  doc.fillColor(slate).font('Helvetica-Bold').fontSize(17).text(title, 42, y, { width: 528 });
  y += 34;

  doc.roundedRect(42, y, 528, 56, 10).fillAndStroke(soft, line);
  doc.fillColor(muted).font('Helvetica-Bold').fontSize(8).text('RESUMEN EJECUTIVO', 58, y + 14);
  doc.fillColor(slate).fontSize(13).text(`Registros: ${rows.length}`, 58, y + 32);
  doc.fillColor(slate).fontSize(13).text(`Total: ${String(totals.total ?? totals.monto ?? '-')}`, 230, y + 32);
  doc.fillColor(slate).fontSize(13).text(`IVA: ${String(totals.iva ?? '-')}`, 390, y + 32);
  y += 82;

  if (rows.length) {
    const headers = headersFromRows(rows).slice(0, 8);
    const tableX = 42;
    const tableW = 528;
    const colW = tableW / Math.max(headers.length, 1);

    doc.roundedRect(tableX, y, tableW, 24, 6).fill(navy);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7.4);
    headers.forEach((h, index) => {
      doc.text(String(h).slice(0, 18), tableX + index * colW + 6, y + 8, { width: colW - 8 });
    });
    y += 26;

    rows.slice(0, 28).forEach((row, rowIndex) => {
      if (y > 706) {
        doc.addPage();
        y = 54;
      }
      doc.rect(tableX, y - 2, tableW, 22).fill(rowIndex % 2 ? '#ffffff' : soft);
      doc.fillColor(slate).font('Helvetica').fontSize(7.2);
      headers.forEach((h, index) => {
        doc.text(String(row[h] ?? '').slice(0, 32), tableX + index * colW + 6, y + 5, { width: colW - 8, ellipsis: true });
      });
      y += 22;
    });
  } else {
    doc.roundedRect(42, y, 528, 190, 10).fillAndStroke(soft, line);
    doc.fillColor(slate).font('Helvetica').fontSize(9).text(JSON.stringify(documentPayload, null, 2), 58, y + 18, { width: 496 });
    y += 210;
  }

  const footerY = doc.page.height - 58;
  doc.strokeColor(line).moveTo(42, footerY - 10).lineTo(570, footerY - 10).stroke();
  doc.fillColor(muted).font('Helvetica').fontSize(8).text(
    'Documento generado server-side por ContaGest-VE Enterprise. Para validez legal completa se recomienda firma digital, almacenamiento inmutable y bitácora de auditoría.',
    42,
    footerY,
    { width: 380 }
  );
  doc.fillColor(muted).fontSize(7).text(`SHA-256: ${immutableHash.slice(0, 32)}...`, 404, footerY, { width: 166, align: 'right' });

  doc.end();
}));

export default router;
