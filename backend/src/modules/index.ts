import { Router } from 'express';
import { prisma } from '../database/prisma.js';
import { requireTenant } from '../shared/middleware/context.js';
import { enforceCommercialSubscription } from '../shared/commercial/subscriptionMiddleware.js';
import { requireCurrentLegalAcceptance } from '../shared/legal/legalAcceptanceMiddleware.js';
import { writeAudit } from '../shared/services/audit.service.js';
import legalRoutes from './legal/legal.routes.js';
import { approvalExecutionGate } from './approvals/approval-execution-gate.js';
import { mountModuleRouteManifest } from './route-manifest.js';

const router = Router();

router.use('/legal', legalRoutes);
router.use(requireCurrentLegalAcceptance);
router.use(enforceCommercialSubscription);
router.use(approvalExecutionGate);

router.use((req, res, next) => {
  const clinicalMedia = req.path.startsWith('/media/dental-attachments');
  const signedMedia = req.path === '/media/sign';
  if (!clinicalMedia && !signedMedia) return next();

  res.once('finish', () => {
    if (res.statusCode >= 400) return;
    const context = (req as any).context as { tenantId?: string; userId?: string; ip?: string; userAgent?: string } | undefined;
    if (!context?.tenantId || !context.userId) return;
    const action = signedMedia
      ? 'clinical.media.signed_url'
      : req.method === 'GET'
        ? 'clinical.media.access'
        : 'clinical.media.write';
    void writeAudit({
      tenantId: context.tenantId,
      userId: context.userId,
      action,
      entity: 'ClinicalMedia',
      after: { route: req.path, method: req.method, status: res.statusCode },
      ipAddress: context.ip,
      userAgent: context.userAgent,
    }).catch(() => undefined);
  });
  next();
});

mountModuleRouteManifest(router);

router.get('/health/db', requireTenant, async (_req, res, next) => {
  try {
    const result = await prisma.$queryRaw<Array<{ ready: number }>>`select 1 as ready`;
    res.json({
      ok: true,
      data: {
        database: {
          ready: result[0]?.ready === 1,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
