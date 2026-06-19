import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ok } from '../../shared/http.js';
import { requireTenant, requirePermission } from '../../shared/middleware/context.js';
const router = Router(); router.use(requireTenant);
const importSchema = z.object({ type: z.string(), rows: z.array(z.record(z.string(), z.unknown())).max(5000) });
router.post('/preview', requirePermission('admin.manage'), asyncHandler(async (req, res) => { const body = importSchema.parse(req.body || {}); const preview = body.rows.map((row, index) => ({ index: index + 1, ok: Object.keys(row).length > 0, row })); ok(res, { type: body.type, rows: preview, accepted: preview.filter((r) => r.ok).length, rejected: preview.filter((r) => !r.ok).length }); }));
export default router;
