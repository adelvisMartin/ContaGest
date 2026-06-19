import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, ok } from '../../shared/http.js';
import { requireTenant, requirePermission } from '../../shared/middleware/context.js';

const router = Router();
router.use(requireTenant);

const itemSchema = z.object({
  sku: z.string().optional(),
  name: z.string().min(1),
  qty: z.coerce.number().positive(),
  price: z.coerce.number().nonnegative()
});

const orderSchema = z.object({
  id: z.string().optional(),
  number: z.string().optional(),
  source: z.string().default('counter'),
  serviceMode: z.enum(['dine_in','pickup','delivery']).default('dine_in'),
  table: z.string().optional(),
  customer: z.string().default('Cliente'),
  phone: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
  status: z.string().default('new'),
  items: z.array(itemSchema).min(1)
});

router.get('/orders', requirePermission('sales.view'), asyncHandler(async (req, res) => {
  const ctx = (req as any).context;
  const records = await prisma.moduleRecord.findMany({
    where: { tenantId: ctx.tenantId, moduleSlug: 'food-orders' },
    orderBy: { createdAt: 'desc' },
    take: 250
  });
  ok(res, records.map((r) => r.payload));
}));

router.post('/orders', requirePermission('sales.manage'), asyncHandler(async (req, res) => {
  const ctx = (req as any).context;
  const body = orderSchema.parse(req.body || {});
  const subtotal = body.items.reduce((sum, item) => sum + item.qty * item.price, 0);
  const order = {
    ...body,
    id: body.id || crypto.randomUUID(),
    number: body.number || `PED-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`,
    subtotal,
    iva: subtotal * 0.16,
    total: subtotal * 1.16,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    events: [{ at: new Date().toISOString(), type: 'created', message: 'Pedido creado desde API' }]
  };
  const saved = await prisma.moduleRecord.create({
    data: { tenantId: ctx.tenantId, moduleSlug: 'food-orders', title: order.number, status: order.status, payload: order }
  });
  ok(res, saved.payload, 201);
}));

router.post('/orders/:id/status', requirePermission('sales.manage'), asyncHandler(async (req, res) => {
  const ctx = (req as any).context;
  const body = z.object({ status: z.string().min(2), message: z.string().optional() }).parse(req.body || {});
  const record = await prisma.moduleRecord.findFirst({ where: { tenantId: ctx.tenantId, moduleSlug: 'food-orders', OR: [{ id: req.params.id }, { title: req.params.id }] } });
  if (!record) return ok(res, null);
  const payload = record.payload as any;
  payload.status = body.status;
  payload.updatedAt = new Date().toISOString();
  payload.events = [{ at: new Date().toISOString(), type: 'status', status: body.status, message: body.message || `Estado actualizado a ${body.status}` }, ...(payload.events || [])];
  const saved = await prisma.moduleRecord.update({ where: { id: record.id }, data: { status: body.status, payload } });
  ok(res, saved.payload);
}));

export default router;
