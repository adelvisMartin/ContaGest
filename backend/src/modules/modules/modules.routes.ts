import { Router } from 'express';
import registryData from './module-registry.json' with { type: 'json' };
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requirePermission, requireTenant } from '../../shared/middleware/context.js';
import { validateBody } from '../../shared/middleware/validate.js';
import { moduleRecordSchema } from '../schemas.js';
import { writeAudit } from '../../shared/services/audit.service.js';

type ModuleView = { slug: string; route: string; title: string; category: string; endpoint: string };
const registry = registryData as ModuleView[];
const allowed = new Set(registry.map((view) => view.slug));
const router = Router();

router.get('/', (_req, res) => ok(res, registry));

router.use('/:slug/records', requireTenant, requirePermission('modules.manage'));

router.get('/:slug/records', asyncHandler(async (req, res) => {
  if (!allowed.has(req.params.slug)) throw new HttpError(404, 'Módulo no registrado en el manifest Stitch.');
  const ctx = (req as any).context;
  const data = await prisma.moduleRecord.findMany({ where: { tenantId: ctx.tenantId, moduleSlug: req.params.slug }, orderBy: { createdAt: 'desc' }, take: Number(req.query.take || 100) });
  ok(res, data);
}));

router.post('/:slug/records', validateBody(moduleRecordSchema), asyncHandler(async (req, res) => {
  if (!allowed.has(req.params.slug)) throw new HttpError(404, 'Módulo no registrado en el manifest Stitch.');
  const ctx = (req as any).context;
  const data = await prisma.moduleRecord.create({ data: { tenantId: ctx.tenantId, moduleSlug: req.params.slug, title: req.body.title, status: req.body.status || 'draft', payload: req.body.payload || {} } });
  await writeAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'create', entity: `module:${req.params.slug}`, entityId: data.id, after: data, ipAddress: ctx.ip, userAgent: ctx.userAgent });
  ok(res, data);
}));

router.put('/:slug/records/:id', validateBody(moduleRecordSchema.partial()), asyncHandler(async (req, res) => {
  if (!allowed.has(req.params.slug)) throw new HttpError(404, 'Módulo no registrado en el manifest Stitch.');
  const ctx = (req as any).context;
  const before = await prisma.moduleRecord.findFirst({ where: { id: req.params.id, tenantId: ctx.tenantId, moduleSlug: req.params.slug } });
  if (!before) throw new HttpError(404, 'Registro no encontrado.');
  const data = await prisma.moduleRecord.update({ where: { id: req.params.id }, data: req.body });
  await writeAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'update', entity: `module:${req.params.slug}`, entityId: data.id, before, after: data, ipAddress: ctx.ip, userAgent: ctx.userAgent });
  ok(res, data);
}));

router.delete('/:slug/records/:id', asyncHandler(async (req, res) => {
  if (!allowed.has(req.params.slug)) throw new HttpError(404, 'Módulo no registrado en el manifest Stitch.');
  const ctx = (req as any).context;
  const before = await prisma.moduleRecord.findFirst({ where: { id: req.params.id, tenantId: ctx.tenantId, moduleSlug: req.params.slug } });
  if (!before) throw new HttpError(404, 'Registro no encontrado.');
  await prisma.moduleRecord.delete({ where: { id: req.params.id } });
  await writeAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'delete', entity: `module:${req.params.slug}`, entityId: req.params.id, before, ipAddress: ctx.ip, userAgent: ctx.userAgent });
  ok(res, { id: req.params.id });
}));

export default router;
