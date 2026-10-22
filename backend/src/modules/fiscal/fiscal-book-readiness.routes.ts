import { Router, type Request } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requirePermission } from '../../shared/middleware/context.js';
import { buildFiscalBookReadiness } from './fiscal-book-readiness.js';

const router = Router();
// Parent fiscal router already invokes requireTenant; permission is checked here.
router.use(requirePermission('fiscal.read'));
const schema = z.object({
  book: z.enum(['sales', 'purchases']),
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
}).strict();

router.get('/readiness', asyncHandler(async (req, res) => {
  const params = schema.parse(req.query);
  const tenantId = (req as Request & { context?: { tenantId?: unknown } }).context?.tenantId;
  if (typeof tenantId !== 'string' || !tenantId.trim())
    throw new HttpError(401, 'Se requiere empresa autenticada para consultar el libro.', { code: 'FISCAL_TENANT_REQUIRED' });
  const where = { tenantId, fiscalPeriod: params.period };
  // Existing GL links only, never fabricate a posting. Bound nested reads prevent
  // silent truncation and runaway fan-out during a period evidence query.
  const glSelect = {
    where: { tenantId },
    select: {
      id: true, tenantId: true, fiscalPeriod: true, posted: true,
      reversalOfId: true, reversedBy: { select: { id: true } },
      lines: {
        select: { accountCode: true, currency: true, debit: true, credit: true },
        take: 41, orderBy: { id: 'asc' as const },
      },
    },
    take: 4, orderBy: { id: 'asc' as const },
  } as const;

  // All evidence reads are tenant-constrained. No tax amounts are inferred.
  const rows = params.book === 'sales'
    ? await prisma.salesInvoice.findMany({
      where, select: { id: true, tenantId: true, number: true, controlNo: true, clientId: true,
        currency: true, subtotal: true, iva: true, igtf: true, islrRetention: true, total: true,
        status: true, issueDate: true, ledgerEntries: glSelect },
      orderBy: { id: 'asc' }, take: 501,
    })
    : await prisma.purchaseInvoice.findMany({
      where, select: { id: true, tenantId: true, number: true, controlNo: true, supplierId: true,
        currency: true, subtotal: true, iva: true, igtf: true, retiva: true, total: true,
        status: true, issueDate: true, ledgerEntries: glSelect },
      orderBy: { id: 'asc' }, take: 501,
    });
  if (rows.length > 500) throw new HttpError(413,
    'El período supera 500 documentos; no se certifica una vista parcial.',
    { code: 'FISCAL_BOOK_COVERAGE_LIMIT' });
  if (rows.some(row => row.ledgerEntries.length > 3 ||
      row.ledgerEntries.some(entry => entry.lines.length > 40)))
    throw new HttpError(413, 'Demasiados asientos o líneas en el documento; no se certifica cobertura truncada.',
      { code: 'FISCAL_BOOK_GL_COVERAGE_LIMIT' });
  const report = buildFiscalBookReadiness({
    tenantId, fiscalPeriod: params.period, book: params.book,
    rows: rows.map(row => ({
      tenantId: row.tenantId, id: row.id, number: row.number,
      status: row.status, issueDate: row.issueDate.toISOString(),
      recordedLedger: row.ledgerEntries.map(entry => ({
        id: entry.id, tenantId: entry.tenantId, fiscalPeriod: entry.fiscalPeriod,
        posted: entry.posted, reversalOfId: entry.reversalOfId,
        reversedById: entry.reversedBy?.id ?? null,
        lines: entry.lines.map(line => ({
          accountCode: line.accountCode, currency: line.currency,
          debitExact: line.debit.toString(), creditExact: line.credit.toString(),
        })),
      })),
      recordedFacts: { currency: row.currency, controlNo: row.controlNo,
        counterpartyId: 'clientId' in row ? row.clientId : row.supplierId,
        subtotalExact: row.subtotal.toString(), ivaExact: row.iva.toString(),
        igtfExact: row.igtf.toString(), totalExact: row.total.toString(),
        retentionExact: ('islrRetention' in row ? row.islrRetention : row.retiva).toString(),
      },
    })),
  });
  ok(res, report);
}));

export default router;
