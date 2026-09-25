import { Router } from 'express';
import { requirePermission, requireTenant } from '../../shared/middleware/context.js';
import inventoryRoutes from './veterinary-inventory.routes.js';
import overviewRoutes from './veterinary-overview.routes.js';
import diagnosticsRoutes from './veterinary-diagnostics.routes.js';
import hospitalizationRoutes from './veterinary-hospitalization.routes.js';
import treatmentSheetRoutes from './veterinary-treatment-sheet.routes.js';
import patientRoutes from './veterinary-patients.routes.js';
import guardianRoutes from './veterinary-guardian.routes.js';
import communicationRoutes from './veterinary-communications.routes.js';
import appointmentRoutes from './veterinary-appointments.routes.js';
import boardingRoutes from './veterinary-boarding.routes.js';
import financialRoutes from './veterinary-financial.routes.js';

const router = Router();

router.use(requireTenant, requirePermission('health.manage'));

// Keep one authoritative security boundary and preserve the original route order.
// Child routers own cohesive veterinary bounded contexts only; they do not add
// alternate authentication, tenant, permission, persistence or response rules.
router.use(inventoryRoutes);
router.use(overviewRoutes);
router.use(diagnosticsRoutes);
router.use(hospitalizationRoutes);
router.use(treatmentSheetRoutes);
router.use(patientRoutes);
router.use(guardianRoutes);
router.use(communicationRoutes);
router.use(appointmentRoutes);
router.use(boardingRoutes);
router.use(financialRoutes);

export default router;
