import { Router } from 'express';
import { requireTenant } from '../../shared/middleware/context.js';
import healthRoutes from './health.routes.js';
import gymRoutes from './gym.routes.js';
import communicationRoutes from './communications.routes.js';

const router = Router();
router.use(requireTenant);
router.use(healthRoutes);
router.use(gymRoutes);
router.use(communicationRoutes);

export default router;
