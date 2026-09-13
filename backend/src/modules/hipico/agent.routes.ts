import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { AUTOMATION_STATES } from './agent-policy.js';
import { createDefaultHipicoAgentEngine } from './agent-engine.js';
import { AutomationStore } from './automation.store.js';
import { hipicoError } from './hipico-domain.js';
import {
  automationOwnerApprovalTokenConfigured,
  automationOwnerApprovalTokenValid,
  operatorActorRef,
  operatorTokenConfigured,
  operatorTokenValid
} from '../hipico-bot/hipico-operator-security.js';

const router = Router();
const store = new AutomationStore();
const engine = createDefaultHipicoAgentEngine();
const uuid = z.string().uuid();
const group = z.string().trim().min(3).max(120).regex(/^[A-Za-z0-9._:-]+$/);
const groupId = z.string().trim().min(3).max(220).regex(/^[A-Za-z0-9@._:-]+$/);
const modeSchema = z.object({
  target: z.enum(AUTOMATION_STATES)
}).strict();
const evaluateSchema = z.object({
  text: z.string().trim().min(1).max(4000),
  expectedIntent: z.string().trim().max(120).nullable().optional(),
  evidence: z.record(z.string(), z.unknown()).optional()
}).strict();
const reviewSchema = z.object({
  actualIntent: z.string().trim().min(1).max(120),
  highRiskFalsePositive: z.boolean().default(false),
  unauthorizedAction: z.boolean().default(false),
  conflict: z.boolean().default(false)
}).strict();

function requestId(req: Request) {
  return String((req as any).requestId || '').trim() || null;
}

function ownerId() {
  const value = String(process.env.HIPICO_OWNER_ID || '').trim();
  if (!uuid.safeParse(value).success) {
    throw Object.assign(new Error('HIPICO_OWNER_NOT_CONFIGURED'), { code: 'HIPICO_OWNER_NOT_CONFIGURED' });
  }
  return value;
}

function groupKey(req: Request) {
  const parsed = group.safeParse(req.header('x-hipico-group-key') || req.query.groupKey);
  if (!parsed.success) throw Object.assign(new Error('HIPICO_GROUP_INVALID'), { code: 'HIPICO_GROUP_INVALID' });
  return parsed.data;
}

function parsedGroupId(req: Request) {
  const parsed = groupId.safeParse(req.params.groupId);
  if (!parsed.success) throw Object.assign(new Error('HIPICO_AUTOMATION_GROUP_ID_INVALID'), { code: 'HIPICO_AUTOMATION_GROUP_ID_INVALID' });
  return parsed.data;
}

function actorRef() {
  const actor = operatorActorRef();
  if (!actor) throw Object.assign(new Error('HIPICO_OPERATOR_ACTOR_NOT_CONFIGURED'), { code: 'HIPICO_OPERATOR_ACTOR_NOT_CONFIGURED' });
  return actor;
}

function trustedOwnerApproval(req: Request, target: string) {
  if (target !== 'AUTOMATIC') return false;
  if (!automationOwnerApprovalTokenConfigured()) {
    throw Object.assign(new Error('HIPICO_AUTOMATION_OWNER_APPROVAL_NOT_CONFIGURED'), {
      code: 'HIPICO_AUTOMATION_OWNER_APPROVAL_NOT_CONFIGURED'
    });
  }
  if (!automationOwnerApprovalTokenValid(req.header('x-hipico-owner-approval-token') || undefined)) {
    throw Object.assign(new Error('HIPICO_AUTOMATION_OWNER_APPROVAL_UNAUTHORIZED'), {
      code: 'HIPICO_AUTOMATION_OWNER_APPROVAL_UNAUTHORIZED'
    });
  }
  return true;
}

function status(code: string) {
  if (code.includes('NOT_FOUND')) return 404;
  if (code === 'HIPICO_AUTOMATION_OWNER_APPROVAL_UNAUTHORIZED') return 403;
  if (code === 'HIPICO_AGENT_EVALUATION_ALREADY_REVIEWED') return 409;
  if (code.includes('METRICS_INSUFFICIENT') || code === 'OWNER_APPROVAL_REQUIRED' || code === 'INVALID_PROMOTION_PATH') return 409;
  if (
    code === 'HIPICO_OWNER_NOT_CONFIGURED'
    || code === 'HIPICO_OPERATOR_ACTOR_NOT_CONFIGURED'
    || code === 'HIPICO_AUTOMATION_OWNER_APPROVAL_NOT_CONFIGURED'
  ) return 503;
  return 400;
}

function sendError(req: Request, res: Response, error: any) {
  const code = String(error?.code || error?.message || 'HIPICO_AUTOMATION_ERROR').slice(0, 120);
  const retryable = code === 'HIPICO_OWNER_NOT_CONFIGURED'
    || code === 'HIPICO_OPERATOR_ACTOR_NOT_CONFIGURED'
    || code === 'HIPICO_AUTOMATION_OWNER_APPROVAL_NOT_CONFIGURED';
  return res.status(status(code)).json(hipicoError({
    code,
    message: 'No se pudo aplicar la política de automatización.',
    requestId: requestId(req),
    retryable
  }));
}

router.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (!operatorTokenConfigured()) {
    return res.status(503).json(hipicoError({
      code: 'HIPICO_OPERATOR_TOKEN_NOT_CONFIGURED',
      message: 'Control de operador no configurado.',
      requestId: requestId(req),
      retryable: true
    }));
  }
  if (!operatorTokenValid(req.header('x-hipico-operator-token') || undefined)) {
    return res.status(401).json(hipicoError({
      code: 'HIPICO_OPERATOR_UNAUTHORIZED',
      message: 'Operador no autenticado.',
      requestId: requestId(req)
    }));
  }
  return next();
});

router.get('/groups/:groupId/automation', async (req, res) => {
  try {
    const owner = ownerId();
    const g = groupKey(req);
    const gid = parsedGroupId(req);
    const config = await store.get(owner, g, gid);
    const metrics = await store.metrics(owner, g, gid);
    return res.json({
      ok: true,
      data: {
        ...config,
        metrics,
        agent: {
          generatorConfigured: false,
          deterministicFirst: true,
          financialAuthority: false,
          directEffectsAllowed: false
        }
      }
    });
  } catch (error) {
    return sendError(req, res, error);
  }
});

router.post('/groups/:groupId/automation', async (req, res) => {
  try {
    const body = modeSchema.parse(req.body);
    const data = await store.setMode({
      ownerId: ownerId(),
      groupKey: groupKey(req),
      groupId: parsedGroupId(req),
      target: body.target,
      actorRef: actorRef(),
      ownerApproved: trustedOwnerApproval(req, body.target)
    });
    return res.json({ ok: true, data });
  } catch (error) {
    return sendError(req, res, error);
  }
});

router.get('/groups/:groupId/automation/evaluations', async (req, res) => {
  try {
    const data = await store.evaluations(ownerId(), groupKey(req), parsedGroupId(req), Number(req.query.limit) || 100);
    return res.json({ ok: true, data });
  } catch (error) {
    return sendError(req, res, error);
  }
});

router.post('/groups/:groupId/automation/evaluate', async (req, res) => {
  try {
    const body = evaluateSchema.parse(req.body);
    const owner = ownerId();
    const g = groupKey(req);
    const gid = parsedGroupId(req);
    const config = await store.get(owner, g, gid);
    const evaluation = await engine.evaluate(body.text, config.mode);
    const receipt = await store.recordEvaluation({
      ownerId: owner,
      groupKey: g,
      groupId: gid,
      text: body.text,
      expectedIntent: body.expectedIntent,
      candidate: evaluation.candidate,
      canAct: evaluation.canAct,
      evidence: body.evidence
    });
    return res.status(202).json({
      ok: true,
      data: {
        ...evaluation,
        receipt,
        actions: [],
        financialAuthority: false,
        directEffectsApplied: false
      }
    });
  } catch (error) {
    return sendError(req, res, error);
  }
});

router.post('/groups/:groupId/automation/evaluations/:id/review', async (req, res) => {
  try {
    const body = reviewSchema.parse(req.body);
    const data = await store.review({
      ownerId: ownerId(),
      groupKey: groupKey(req),
      groupId: parsedGroupId(req),
      id: uuid.parse(req.params.id),
      actualIntent: body.actualIntent,
      actorRef: actorRef(),
      highRiskFalsePositive: body.highRiskFalsePositive,
      unauthorizedAction: body.unauthorizedAction,
      conflict: body.conflict
    });
    return res.json({ ok: true, data });
  } catch (error) {
    return sendError(req, res, error);
  }
});

export default router;
