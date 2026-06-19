import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, ok } from '../../shared/http.js';
import { requireTenant, requirePermission } from '../../shared/middleware/context.js';

const router = Router();
router.use(requireTenant);

const demoSchema = z.object({
  id: z.string().optional(),
  prospect: z.string().min(2),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  enabledModules: z.array(z.string()).default([]),
  expiresAt: z.string(),
  maxUsers: z.coerce.number().min(1).max(50).default(3),
  status: z.string().default('active'),
  notes: z.string().optional()
});

router.get('/access', requirePermission('admin.manage'), asyncHandler(async (req, res) => {
  const ctx = (req as any).context;
  const records = await prisma.moduleRecord.findMany({ where: { tenantId: ctx.tenantId, moduleSlug: 'demo-access' }, orderBy: { createdAt: 'desc' } });
  ok(res, records.map((r) => r.payload));
}));

router.post('/access', requirePermission('admin.manage'), asyncHandler(async (req, res) => {
  const ctx = (req as any).context;
  const body = demoSchema.parse(req.body || {});
  const saved = await prisma.moduleRecord.create({
    data: { tenantId: ctx.tenantId, moduleSlug: 'demo-access', title: body.prospect, status: body.status, payload: body }
  });
  ok(res, saved.payload, 201);
}));

export default router;
