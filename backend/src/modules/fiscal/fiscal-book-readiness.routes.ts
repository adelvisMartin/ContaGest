import { Router } from 'express';
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
  const tenantId = (req as any).context.tenantId as string;
  const where = { tenantId, fiscalPeriod: params.period };
  // All evidence reads are tenant-constrained. No tax amounts are inferred.
  const rows = params.book === 'sales'
    ? await prisma.salesInvoice.findMany({
      where, select: { id: true, tenantId: true, number: true, controlNo: true, clientId: true,
        currency: true, subtotal: true, iva: true, igtf: true, islrRetention: true, total: true,
        status: true, issueDate: true },
      orderBy: { id: 'asc' }, take: 501,
    })
    : await prisma.purchaseInvoice.findMany({
      where, select: { id: true, tenantId: true, number: true, controlNo: true, supplierId: true,
        currency: true, subtotal: true, iva: true, igtf: true, retiva: true, total: true,
        status: true, issueDate: true },
      orderBy: { id: 'asc' }, take: 501,
    });
  if (rows.length > 500) throw new HttpError(413,
    'El período supera 500 documentos; no se certifica una vista parcial.',
    { code: 'FISCAL_BOOK_COVERAGE_LIMIT' });
  const report = buildFiscalBookReadiness({
    tenantId, fiscalPeriod: params.period, book: params.book,
    rows: rows.map(row => ({
      tenantId: row.tenantId, id: row.id, number: row.number,
      status: row.status, issueDate: row.issueDate.toISOString(),
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
