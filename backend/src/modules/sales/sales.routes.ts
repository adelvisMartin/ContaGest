import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, ok } from '../../shared/http.js';
import { requireTenant } from '../../shared/middleware/context.js';
import { validateBody } from '../../shared/middleware/validate.js';
import { createLedgerEntry, salesInvoiceLinesForLedger } from '../accounting/accounting.service.js';
import { writeAudit } from '../../shared/services/audit.service.js';

const router = Router();
router.use(requireTenant);

const lineSchema = z.object({ productId: z.string().optional(), description: z.string().min(2), quantity: z.coerce.number().positive(), unitPrice: z.coerce.number().nonnegative(), taxRate: z.coerce.number().default(16) });
const saleSchema = z.object({ clientId: z.string().optional(), number: z.string().min(1), controlNo: z.string().optional(), issueDate: z.coerce.date().optional(), fiscalPeriod: z.string().min(6), currency: z.string().default('VES'), exchangeRate: z.coerce.number().default(1), status: z.enum(['draft','issued','paid','cancelled','overdue']).default('issued'), notes: z.string().optional(), lines: z.array(lineSchema).min(1) });

router.get('/', asyncHandler(async (req, res) => {
  const tenantId = (req as any).context.tenantId;
  const data = await prisma.salesInvoice.findMany({ where: { tenantId }, include: { client: true, lines: true }, orderBy: { issueDate: 'desc' }, take: 100 });
  ok(res, data);
}));

router.post('/', validateBody(saleSchema), asyncHandler(async (req, res) => {
  const ctx = (req as any).context;
  const lines = req.body.lines.map((l: any) => ({ ...l, total: Number(l.quantity) * Number(l.unitPrice) }));
  const subtotal = lines.reduce((s: number, l: any) => s + l.total, 0);
  const iva = lines.reduce((s: number, l: any) => s + (l.total * Number(l.taxRate || 0) / 100), 0);
  const total = subtotal + iva;
  const sale = await prisma.salesInvoice.create({ data: { tenantId: ctx.tenantId, clientId: req.body.clientId, number: req.body.number, controlNo: req.body.controlNo, issueDate: req.body.issueDate, fiscalPeriod: req.body.fiscalPeriod, currency: req.body.currency, exchangeRate: req.body.exchangeRate, subtotal, iva, total, status: req.body.status, notes: req.body.notes, lines: { create: lines } }, include: { lines: true } });
  if (sale.status !== 'draft') await createLedgerEntry({ tenantId: ctx.tenantId, fiscalPeriod: sale.fiscalPeriod, description: `Venta ${sale.number}`, source: 'sales', sourceId: sale.id, lines: salesInvoiceLinesForLedger(sale) });
  await writeAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'create', entity: 'salesInvoice', entityId: sale.id, after: sale, ipAddress: ctx.ip, userAgent: ctx.userAgent });
  ok(res, sale);
}));

export default router;
