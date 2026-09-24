import { Router } from 'express';
import { requirePermission, requireTenant } from '../../shared/middleware/context.js';
import patientCrudRoutes from './veterinary-crud-patients.routes.js';
import appointmentCrudRoutes from './veterinary-crud-appointments.routes.js';

const router = Router();

router.use(requireTenant, requirePermission('health.manage'));
router.use(patientCrudRoutes);
router.use(appointmentCrudRoutes);

export default router;
