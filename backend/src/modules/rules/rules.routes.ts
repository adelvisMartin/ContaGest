import { Router } from 'express';
import { asyncHandler, ok } from '../../shared/http.js';
import { requireTenant, requirePermission } from '../../shared/middleware/context.js';
const router = Router(); router.use(requireTenant);
router.get('/', requirePermission('reports.view'), asyncHandler(async (_req, res) => ok(res, { orders: { reserveOn: 'accepted', consumeOn: 'preparing', invoiceOn: 'paid_or_delivered', cancelAllowedUntil: 'ready' }, inventory: { costMethod: 'weighted_average', kardex: 'immutable', adjustments: 'authorized' }, accounting: { doubleEntry: true, reversalsOnly: true, blockClosedPeriods: true }, payroll: { parameterVersioning: true, receipts: true, incidences: true } })));
export default router;
