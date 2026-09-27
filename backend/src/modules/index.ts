import { Router } from 'express';
import { prisma } from '../database/prisma.js';
import { requireTenant } from '../shared/middleware/context.js';
import { enforceCommercialSubscription } from '../shared/commercial/subscriptionMiddleware.js';
import { requireCurrentLegalAcceptance } from '../shared/legal/legalAcceptanceMiddleware.js';
import legalRoutes from './legal/legal.routes.js';
import { approvalExecutionGate } from './approvals/approval-execution-gate.js';
import { mountModuleRouteManifest } from './route-manifest.js';

const router = Router();

router.use('/legal', legalRoutes);
router.use(requireCurrentLegalAcceptance);
router.use(enforceCommercialSubscription);
router.use(approvalExecutionGate);

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
