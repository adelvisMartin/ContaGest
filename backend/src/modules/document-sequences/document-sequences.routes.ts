import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ok, HttpError } from '../../shared/http.js';
import { requirePermission, requireTenant } from '../../shared/middleware/context.js';
import { validateBody } from '../../shared/middleware/validate.js';
import { writeAudit } from '../../shared/services/audit.service.js';
import {
  configureDocumentSequence,
  listDocumentSequences,
  normalizeDocumentSequenceKey,
  normalizeDocumentSequencePeriodKey
} from '../../shared/services/document-sequence.service.js';

const router = Router();
const configSchema = z.object({
  periodKey: z.string().max(40).optional().nullable(),
  prefix: z.string().max(64).optional(),
  suffix: z.string().max(64).optional(),
  padding: z.number().int().min(1).max(18).optional(),
  currentValue: z.string().regex(/^\d+$/).optional()
});

const context = (req: any) => req.context as { tenantId: string; userId?: string; ip?: string; userAgent?: string };

router.use(requireTenant, requirePermission('admin.manage'));

router.get('/', asyncHandler(async (req, res) => {
  const ctx = context(req);
  const rawKey = typeof req.query.key === 'string' ? req.query.key : undefined;
  if (req.query.key !== undefined && rawKey === undefined) {
    throw new HttpError(400, 'El filtro key debe ser texto.', { code: 'DOCUMENT_SEQUENCE_QUERY_INVALID' });
  }
  const key = rawKey ? normalizeDocumentSequenceKey(rawKey) : undefined;
  ok(res, await listDocumentSequences({ tenantId: ctx.tenantId, key }));
}));

router.put('/:key', validateBody(configSchema), asyncHandler(async (req, res) => {
  const ctx = context(req);
  const key = normalizeDocumentSequenceKey(req.params.key);
  const periodKey = normalizeDocumentSequencePeriodKey(req.body.periodKey);
  const before = (await listDocumentSequences({ tenantId: ctx.tenantId, key }))
    .find((item) => item.periodKey === periodKey) || null;

  const sequence = await configureDocumentSequence({
    tenantId: ctx.tenantId,
    key,
    periodKey,
    prefix: req.body.prefix,
    suffix: req.body.suffix,
    padding: req.body.padding,
    currentValue: req.body.currentValue
  });

  await writeAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: 'document-sequence.configured',
    entity: 'DocumentSequence',
    entityId: `${key}:${periodKey}`,
    before,
    after: sequence,
    ipAddress: ctx.ip,
    userAgent: ctx.userAgent
  });
  ok(res, sequence);
}));

export default router;
