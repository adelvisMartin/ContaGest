import { Router } from 'express';
import { requireTenant } from '../../shared/middleware/context.js';
import healthExtendedRoutes from './health-extended.routes.js';
import gymExtendedRoutes from './gym-extended.routes.js';

const router = Router();
router.use(requireTenant);
router.use(healthExtendedRoutes);
router.use(gymExtendedRoutes);

export default router;
