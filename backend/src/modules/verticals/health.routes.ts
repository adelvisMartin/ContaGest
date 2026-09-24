import { Router } from 'express';
import coreRoutes from './health-core.routes.js';
import encounterRoutes from './health-encounters.routes.js';
import dentalFinancialRoutes from './health-dental-financial.routes.js';
import measurementRoutes from './health-measurements.routes.js';

const router = Router();

// Preserve the original registration order and endpoint-level authorization.
// Child routers own cohesive Health/Dentistry bounded contexts only.
router.use(coreRoutes);
router.use(encounterRoutes);
router.use(dentalFinancialRoutes);
router.use(measurementRoutes);

export default router;
