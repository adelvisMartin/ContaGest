import type { Request, Response } from 'express';
import { z } from 'zod';
import { operatorActorRef } from '../hipico-bot/hipico-operator-security.js';
import { AUTOMATION_STATES } from './agent-contracts.js';
import { hipicoError } from './hipico-domain.js';

export const uuidSchema = z.string().uuid();
export const groupSchema = z.string().trim().min(3).max(120).regex(/^[A-Za-z0-9._:-]+$/);
export const groupIdSchema = z.string().trim().min(3).max(220).regex(/^[A-Za-z0-9@._:-]+$/);
export const idempotencySchema = z.string().trim().min(8).max(120).regex(/^[A-Za-z0-9._:-]+$/);

export const modeSchema = z.object({ target: z.enum(AUTOMATION_STATES) }).strict();
export const evaluateSchema = z.object({
  text: z.string().trim().min(1).max(4000),
  expectedIntent: z.string().trim().max(120).nullable().optional(),
  evidence: z.record(z.string(), z.unknown()).optional()
}).strict();
export const reviewSchema = z.object({
  actualIntent: z.string().trim().min(1).max(120),
  highRiskFalsePositive: z.boolean().default(false),
  unauthorizedAction: z.boolean().default(false),
  conflict: z.boolean().default(false),
  raceContextError: z.boolean().default(false)
}).strict();

export function requestId(req: Request) {
  return String((req as any).requestId || '').trim() || null;
}

export function ownerId() {
  const value = String(process.env.HIPICO_OWNER_ID || '').trim();
  if (!uuidSchema.safeParse(value).success) {
    throw Object.assign(new Error('HIPICO_OWNER_NOT_CONFIGURED'), { code: 'HIPICO_OWNER_NOT_CONFIGURED' });
  }
  return value;
}

export function groupKey(req: Request) {
  const parsed = groupSchema.safeParse(req.header('x-hipico-group-key') || req.query.groupKey);
  if (!parsed.success) throw Object.assign(new Error('HIPICO_GROUP_INVALID'), { code: 'HIPICO_GROUP_INVALID' });
  return parsed.data;
}

export function parsedGroupId(req: Request) {
  const parsed = groupIdSchema.safeParse(req.params.groupId);
  if (!parsed.success) {
    throw Object.assign(new Error('HIPICO_AUTOMATION_GROUP_ID_INVALID'), { code: 'HIPICO_AUTOMATION_GROUP_ID_INVALID' });
  }
  return parsed.data;
}

export function idempotencyKey(req: Request) {
  const parsed = idempotencySchema.safeParse(req.header('idempotency-key'));
  if (!parsed.success) {
    throw Object.assign(new Error('HIPICO_AUTOMATION_IDEMPOTENCY_KEY_INVALID'), {
      code: 'HIPICO_AUTOMATION_IDEMPOTENCY_KEY_INVALID'
    });
  }
  return parsed.data;
}

export function actorRef() {
  const actor = operatorActorRef();
  if (!actor) {
    throw Object.assign(new Error('HIPICO_OPERATOR_ACTOR_NOT_CONFIGURED'), {
      code: 'HIPICO_OPERATOR_ACTOR_NOT_CONFIGURED'
    });
  }
  return actor;
}

export function automaticOwnerApprovalConfigured() {
  return String(process.env.HIPICO_AUTOMATIC_OWNER_APPROVED || '').trim().toLowerCase() === 'true';
}

export function sourceReadOnly(gid: string) {
  const configured = String(process.env.HIPICO_SOURCE_GROUP_ID || '').trim().toLowerCase();
  return Boolean(configured) && configured === String(gid || '').trim().toLowerCase();
}

export function serverRiskContext(gid: string) {
  return {
    sourceReadOnly: sourceReadOnly(gid),
    evidenceState: 'MISSING' as const,
    sourceAuthorized: false,
    systemHealthy: true,
    humanOwned: false,
    ambiguous: false
  };
}

export function automationHttpStatus(code: string) {
  if (code.includes('NOT_FOUND')) return 404;
  if (code === 'HIPICO_AGENT_EVALUATION_ALREADY_REVIEWED' || code === 'HIPICO_AUTOMATION_IDEMPOTENCY_MISMATCH') return 409;
  if (code.includes('METRICS_INSUFFICIENT') || code === 'OWNER_APPROVAL_REQUIRED' || code === 'INVALID_PROMOTION_PATH') return 409;
  if (code === 'HIPICO_OWNER_NOT_CONFIGURED' || code === 'HIPICO_OPERATOR_ACTOR_NOT_CONFIGURED') return 503;
  return 400;
}

export function sendAutomationError(req: Request, res: Response, error: any) {
  const code = String(error?.code || error?.message || 'HIPICO_AUTOMATION_ERROR').slice(0, 120);
  return res.status(automationHttpStatus(code)).json(hipicoError({
    code,
    message: 'No se pudo aplicar la política de automatización.',
    requestId: requestId(req),
    retryable: code === 'HIPICO_OWNER_NOT_CONFIGURED' || code === 'HIPICO_OPERATOR_ACTOR_NOT_CONFIGURED'
  }));
}
