import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, ok } from '../../shared/http.js';
import { requireTenant, requirePermission } from '../../shared/middleware/context.js';

const router = Router();
router.use(requireTenant);

const eventSchema = z.object({
  id: z.string().optional(),
  sessionId: z.string().min(3),
  type: z.string().min(2).max(80),
  route: z.string().optional(),
  user: z.string().optional(),
  userAgent: z.string().optional(),
  viewport: z.string().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.string().optional()
});
const bodySchema = z.object({ events: z.array(eventSchema).max(100) });

router.post('/events', asyncHandler(async (req, res) => {
  const ctx = (req as any).context;
  const body = bodySchema.parse(req.body || {});
  const data = body.events.map((event) => ({
    tenantId: ctx.tenantId,
    sessionId: event.sessionId,
    userId: ctx.userId || null,
    type: event.type,
    route: event.route || null,
    userAgent: event.userAgent || String(ctx.userAgent || ''),
    viewport: event.viewport || null,
    payload: event.payload || {},
    createdAt: event.createdAt ? new Date(event.createdAt) : new Date()
  }));
  await prisma.analyticsEvent.createMany({ data: data as any, skipDuplicates: true });
  ok(res, { inserted: data.length });
}));

router.get('/summary', requirePermission('reports.view'), asyncHandler(async (req, res) => {
  const ctx = (req as any).context;
  const since = req.query.since ? new Date(String(req.query.since)) : new Date(Date.now() - 1000 * 60 * 60 * 24 * 30);
  const [total, byType, byRoute, sessions] = await Promise.all([
    prisma.analyticsEvent.count({ where: { tenantId: ctx.tenantId, createdAt: { gte: since } } }),
    prisma.analyticsEvent.groupBy({ by: ['type'], where: { tenantId: ctx.tenantId, createdAt: { gte: since } }, _count: true, orderBy: { _count: { type: 'desc' } }, take: 20 }),
    prisma.analyticsEvent.groupBy({ by: ['route'], where: { tenantId: ctx.tenantId, createdAt: { gte: since } }, _count: true, orderBy: { _count: { route: 'desc' } }, take: 20 }),
    prisma.analyticsEvent.findMany({ where: { tenantId: ctx.tenantId, createdAt: { gte: since } }, distinct: ['sessionId'], select: { sessionId: true } })
  ]);
  ok(res, { total, sessions: sessions.length, byType, byRoute, since });
}));

export default router;
