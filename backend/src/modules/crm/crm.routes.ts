import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requirePermission, requireTenant } from '../../shared/middleware/context.js';
import { expensiveOperationRateLimit } from '../../shared/middleware/security.js';
import { canonicalClientPreflight } from './client-match-preflight.mjs';

const router = Router();
router.use(requireTenant, requirePermission('clients.manage'));

const preflightSchema = z.object({
  rif: z.string().trim().min(1).max(40).optional(),
  email: z.string().trim().email().max(254).optional()
}).strict().refine(input => !!input.rif || !!input.email);

router.post('/preflight', expensiveOperationRateLimit, asyncHandler(async (req, res) => {
  // Even review-only preflight reveals Client identifiers: never cache responses.
  res.setHeader('Cache-Control', 'private, no-store');
  const parsed = preflightSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, 'Identidad CRM inválida.');
  const tenantId = (req as any).context.tenantId as string;
  let result;
  try {
    result = await canonicalClientPreflight({ tenantId, lead:parsed.data, clientReader:prisma.client });
  } catch (error) {
    if (error instanceof TypeError && /^(INVALID_LEAD_IDENTITY|LEAD_REQUIRED)$/.test(error.message)) {
      throw new HttpError(400, 'Identidad CRM inválida.');
    }
    throw error;
  }
  ok(res, result);
}));

export default router;
