import { Router } from 'express';
import coreRoutes from './gym-core.routes.js';
import trainingRoutes from './gym-training.routes.js';
import nutritionRoutes from './gym-nutrition.routes.js';
import adherenceRoutes from './gym-adherence.routes.js';
import classRoutes from './gym-classes.routes.js';

const router = Router();

// Preserve the original registration order. Endpoint-level gym.manage guards
// remain inside each bounded context exactly where they were before extraction.
router.use(coreRoutes);
router.use(trainingRoutes);
router.use(nutritionRoutes);
router.use(adherenceRoutes);
router.use(classRoutes);

export default router;
