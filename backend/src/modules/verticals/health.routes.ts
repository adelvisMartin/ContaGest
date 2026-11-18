import { Router } from 'express';
import coreRoutes from './health-core.routes.js';
import encounterRoutes from './health-encounters.routes.js';
import dentalChartHistoryRoutes from './health-dental-chart-history.routes.js';
import dentalFinancialRoutes from './health-dental-financial.routes.js';
import measurementRoutes from './health-measurements.routes.js';
import healthLongitudinalRoutes from './health-longitudinal.routes.js';

const router = Router();

// Preserve the original registration order and endpoint-level authorization.
// Child routers own cohesive Health/Dentistry bounded contexts only.
router.use(coreRoutes);
router.use(encounterRoutes);
router.use(dentalChartHistoryRoutes);
router.use(dentalFinancialRoutes);
router.use(measurementRoutes);
router.use(healthLongitudinalRoutes);

export default router;
