import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, ok } from '../../shared/http.js';
import { requireTenant } from '../../shared/middleware/context.js';
import { validateBody } from '../../shared/middleware/validate.js';
import { createLedgerEntry, purchaseInvoiceLinesForLedger } from '../accounting/accounting.service.js';

const router = Router();
router.use(requireTenant);
const lineSchema = z.object({ productId: z.string().optional(), description: z.string().min(2), quantity: z.coerce.number().positive(), unitCost: z.coerce.number().nonnegative(), taxRate: z.coerce.number().default(16) });
const purchaseSchema = z.object({ supplierId: z.string().optional(), number: z.string().min(1), controlNo: z.string().optional(), fiscalPeriod: z.string().min(6), status: z.enum(['draft','issued','paid','cancelled','overdue']).default('issued'), ocrStatus: z.string().optional(), lines: z.array(lineSchema).min(1) });

router.get('/', asyncHandler(async (req, res) => {
  const tenantId = (req as any).context.tenantId;
  ok(res, await prisma.purchaseInvoice.findMany({ where: { tenantId }, include: { supplier: true, lines: true }, orderBy: { issueDate: 'desc' }, take: 100 }));
}));

router.post('/', validateBody(purchaseSchema), asyncHandler(async (req, res) => {
  const tenantId = (req as any).context.tenantId;
  const lines = req.body.lines.map((l: any) => ({ ...l, total: Number(l.quantity) * Number(l.unitCost) }));
  const subtotal = lines.reduce((s: number, l: any) => s + l.total, 0);
  const iva = lines.reduce((s: number, l: any) => s + (l.total * Number(l.taxRate || 0) / 100), 0);
  const total = subtotal + iva;
  const purchase = await prisma.purchaseInvoice.create({ data: { tenantId, supplierId: req.body.supplierId, number: req.body.number, controlNo: req.body.controlNo, fiscalPeriod: req.body.fiscalPeriod, subtotal, iva, total, status: req.body.status, ocrStatus: req.body.ocrStatus, lines: { create: lines } }, include: { lines: true } });
  if (purchase.status !== 'draft') await createLedgerEntry({ tenantId, fiscalPeriod: purchase.fiscalPeriod, description: `Compra ${purchase.number}`, source: 'purchase', sourceId: purchase.id, lines: purchaseInvoiceLinesForLedger(purchase) });
  ok(res, purchase);
}));

export default router;
