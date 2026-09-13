import crypto from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import {
  AUTOMATION_STATES,
  canPromoteAutomation,
  type AgentCandidate,
  type AutomationMetrics,
  type AutomationState,
  type PromotionDecision
} from './agent-policy.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GROUP_RE = /^[A-Za-z0-9._:-]{3,120}$/;
const GROUP_ID_RE = /^[A-Za-z0-9@._:-]{3,220}$/;
const IDEMPOTENCY_RE = /^[A-Za-z0-9._:-]{8,120}$/;
const FORBIDDEN_EVIDENCE_KEY = /(?:token|secret|password|credential|authorization|cookie|api[_-]?key)/i;
const MAX_EVIDENCE_BYTES = 16 * 1024;

type DbClient = typeof prisma | Prisma.TransactionClient;

type TransitionEvent = {
  previousMode: AutomationState;
  targetMode: AutomationState;
  ownerApproved: boolean;
  actorRef: string;
  decision: PromotionDecision;
  metrics: AutomationMetrics;
};

function assertScope(ownerId: string, groupKey: string, groupId: string) {
  if (!UUID_RE.test(ownerId)) throw new Error('HIPICO_OWNER_INVALID');
  if (!GROUP_RE.test(groupKey)) throw new Error('HIPICO_GROUP_INVALID');
  if (!GROUP_ID_RE.test(groupId)) throw new Error('HIPICO_AUTOMATION_GROUP_ID_INVALID');
}

function normalizeIdempotencyKey(value: string) {
  const key = String(value || '').trim();
  if (!IDEMPOTENCY_RE.test(key)) throw new Error('HIPICO_AUTOMATION_IDEMPOTENCY_KEY_INVALID');
  return key;
}

function defaultMode(groupId: string): AutomationState {
  return String(process.env.HIPICO_SOURCE_GROUP_ID || '').trim().toLowerCase() === groupId.toLowerCase()
    ? 'SHADOW'
    : 'DISABLED';
}

function scopeLockKey(ownerId: string, groupKey: string, groupId: string) {
  return `hipico-agent:${ownerId}:${groupKey}:${groupId}`;
}

async function lockScope(db: DbClient, ownerId: string, groupKey: string, groupId: string) {
  const key = scopeLockKey(ownerId, groupKey, groupId);
  await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

async function readMetrics(db: DbClient, ownerId: string, groupKey: string, groupId: string): Promise<AutomationMetrics> {
  const rows = await db.$queryRaw<Array<{
    reviewed: bigint | number;
    matched: bigint | number;
    highRiskFalsePositive: bigint | number;
    unauthorizedAction: bigint | number;
    conflicts: bigint | number;
  }>>`
    SELECT
      count(*) FILTER (WHERE actual_intent IS NOT NULL) AS reviewed,
      count(*) FILTER (WHERE actual_intent IS NOT NULL AND matched = true) AS matched,
      count(*) FILTER (WHERE actual_intent IS NOT NULL AND high_risk_false_positive = true) AS "highRiskFalsePositive",
      count(*) FILTER (WHERE actual_intent IS NOT NULL AND unauthorized_action = true) AS "unauthorizedAction",
      count(*) FILTER (WHERE actual_intent IS NOT NULL AND conflict = true) AS conflicts
    FROM public.hipico_agent_evaluations
    WHERE owner_id = ${ownerId}::uuid AND group_key = ${groupKey} AND group_id = ${groupId}`;
  const row = rows[0] || {} as any;
  return {
    reviewed: Number(row.reviewed || 0),
    matched: Number(row.matched || 0),
    highRiskFalsePositive: Number(row.highRiskFalsePositive || 0),
    unauthorizedAction: Number(row.unauthorizedAction || 0),
    conflicts: Number(row.conflicts || 0)
  };
}

function normalizeEvidence(value: unknown) {
  if (value == null) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('HIPICO_AGENT_EVIDENCE_INVALID');
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_EVIDENCE_BYTES) throw new Error('HIPICO_AGENT_EVIDENCE_TOO_LARGE');
  if (Object.keys(value as Record<string, unknown>).some((key) => FORBIDDEN_EVIDENCE_KEY.test(key))) {
    throw new Error('HIPICO_AGENT_EVIDENCE_FORBIDDEN_KEY');
  }
  return JSON.parse(serialized) as Record<string, unknown>;
}

export class AutomationStore {
  async metrics(ownerId: string, groupKey: string, groupId: string): Promise<AutomationMetrics> {
    assertScope(ownerId, groupKey, groupId);
    return readMetrics(prisma, ownerId, groupKey, groupId);
  }

  async get(ownerId: string, groupKey: string, groupId: string) {
    assertScope(ownerId, groupKey, groupId);
    const mode = defaultMode(groupId);
    await prisma.$executeRaw`
      INSERT INTO public.hipico_group_automation(id, owner_id, group_key, group_id, mode, updated_by)
      VALUES(${crypto.randomUUID()}::uuid, ${ownerId}::uuid, ${groupKey}, ${groupId}, ${mode}, 'system-default')
      ON CONFLICT(owner_id, group_key, group_id) DO NOTHING`;
    const rows = await prisma.$queryRaw<any[]>`
      SELECT mode, updated_at AS "updatedAt", updated_by AS "updatedBy"
      FROM public.hipico_group_automation
      WHERE owner_id = ${ownerId}::uuid AND group_key = ${groupKey} AND group_id = ${groupId}
      LIMIT 1`;
    return rows[0];
  }

  async setMode(input: {
    ownerId: string;
    groupKey: string;
    groupId: string;
    target: AutomationState;
    actorRef: string;
    ownerApproved: boolean;
    idempotencyKey: string;
  }) {
    assertScope(input.ownerId, input.groupKey, input.groupId);
    if (!(AUTOMATION_STATES as readonly string[]).includes(input.target)) throw new Error('HIPICO_AUTOMATION_STATE_INVALID');
    if (!String(input.actorRef || '').startsWith('operator-token:')) throw new Error('HIPICO_OPERATOR_ACTOR_NOT_CONFIGURED');
    const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
    await this.get(input.ownerId, input.groupKey, input.groupId);

    return prisma.$transaction(async (tx) => {
      await lockScope(tx, input.ownerId, input.groupKey, input.groupId);

      const priorRows = await tx.$queryRaw<TransitionEvent[]>`
        SELECT previous_mode AS "previousMode", target_mode AS "targetMode",
          owner_approved AS "ownerApproved", actor_ref AS "actorRef", decision, metrics
        FROM public.hipico_automation_transition_events
        WHERE owner_id = ${input.ownerId}::uuid AND group_key = ${input.groupKey}
          AND group_id = ${input.groupId} AND idempotency_key = ${idempotencyKey}
        LIMIT 1 FOR UPDATE`;
      const prior = priorRows[0];
      if (prior) {
        if (prior.targetMode !== input.target || prior.ownerApproved !== input.ownerApproved || prior.actorRef !== input.actorRef) {
          throw Object.assign(new Error('HIPICO_AUTOMATION_IDEMPOTENCY_MISMATCH'), { code: 'HIPICO_AUTOMATION_IDEMPOTENCY_MISMATCH' });
        }
        return {
          previous: prior.previousMode,
          current: prior.targetMode,
          decision: prior.decision,
          metrics: prior.metrics,
          idempotentReplay: true
        };
      }

      const rows = await tx.$queryRaw<Array<{ mode: AutomationState }>>`
        SELECT mode
        FROM public.hipico_group_automation
        WHERE owner_id = ${input.ownerId}::uuid AND group_key = ${input.groupKey} AND group_id = ${input.groupId}
        LIMIT 1 FOR UPDATE`;
      const current = rows[0]?.mode || defaultMode(input.groupId);
      const metrics = await readMetrics(tx, input.ownerId, input.groupKey, input.groupId);
      const decision = canPromoteAutomation(current, input.target, metrics, input.ownerApproved);
      if (!decision.allowed) throw Object.assign(new Error(decision.reason), { code: decision.reason, decision });

      await tx.$executeRaw`
        UPDATE public.hipico_group_automation
        SET mode = ${input.target}, updated_by = ${input.actorRef}, updated_at = now()
        WHERE owner_id = ${input.ownerId}::uuid AND group_key = ${input.groupKey} AND group_id = ${input.groupId}`;

      await tx.$executeRaw`
        INSERT INTO public.hipico_automation_transition_events(
          id, owner_id, group_key, group_id, idempotency_key, previous_mode, target_mode,
          owner_approved, actor_ref, decision, metrics
        ) VALUES(
          ${crypto.randomUUID()}::uuid, ${input.ownerId}::uuid, ${input.groupKey}, ${input.groupId}, ${idempotencyKey},
          ${current}, ${input.target}, ${input.ownerApproved}, ${input.actorRef},
          ${JSON.stringify(decision)}::jsonb, ${JSON.stringify(metrics)}::jsonb
        )`;

      return { previous: current, current: input.target, decision, metrics, idempotentReplay: false };
    });
  }

  async recordEvaluation(input: {
    ownerId: string;
    groupKey: string;
    groupId: string;
    text: string;
    expectedIntent?: string | null;
    candidate: AgentCandidate;
    canAct: boolean;
    evidence?: unknown;
  }) {
    assertScope(input.ownerId, input.groupKey, input.groupId);
    await this.get(input.ownerId, input.groupKey, input.groupId);
    const id = crypto.randomUUID();
    const messageHash = crypto.createHash('sha256').update(input.text).digest('hex');
    const evidence = normalizeEvidence(input.evidence);

    await prisma.$transaction(async (tx) => {
      await lockScope(tx, input.ownerId, input.groupKey, input.groupId);
      await tx.$executeRaw`
        INSERT INTO public.hipico_agent_evaluations(
          id, owner_id, group_key, group_id, message_hash, expected_intent, predicted_intent,
          confidence, risk, tool, can_act, model_version, evidence
        ) VALUES(
          ${id}::uuid, ${input.ownerId}::uuid, ${input.groupKey}, ${input.groupId}, ${messageHash},
          ${input.expectedIntent || null}, ${input.candidate.intent}, ${input.candidate.confidence}, ${input.candidate.risk},
          ${input.candidate.tool || null}, ${input.canAct}, ${input.candidate.modelVersion || input.candidate.source},
          ${JSON.stringify(evidence)}::jsonb
        )`;
    });
    return { id, messageHash };
  }

  async review(input: {
    ownerId: string;
    groupKey: string;
    groupId: string;
    id: string;
    actualIntent: string;
    actorRef: string;
    highRiskFalsePositive?: boolean;
    unauthorizedAction?: boolean;
    conflict?: boolean;
  }) {
    assertScope(input.ownerId, input.groupKey, input.groupId);
    if (!String(input.actorRef || '').startsWith('operator-token:')) throw new Error('HIPICO_OPERATOR_ACTOR_NOT_CONFIGURED');

    return prisma.$transaction(async (tx) => {
      await lockScope(tx, input.ownerId, input.groupKey, input.groupId);
      const rows = await tx.$queryRaw<Array<{ predictedIntent: string; actualIntent: string | null }>>`
        SELECT predicted_intent AS "predictedIntent", actual_intent AS "actualIntent"
        FROM public.hipico_agent_evaluations
        WHERE id = ${input.id}::uuid AND owner_id = ${input.ownerId}::uuid
          AND group_key = ${input.groupKey} AND group_id = ${input.groupId}
        LIMIT 1 FOR UPDATE`;
      const row = rows[0];
      if (!row) throw Object.assign(new Error('HIPICO_AGENT_EVALUATION_NOT_FOUND'), { code: 'HIPICO_AGENT_EVALUATION_NOT_FOUND' });
      if (row.actualIntent !== null) {
        throw Object.assign(new Error('HIPICO_AGENT_EVALUATION_ALREADY_REVIEWED'), { code: 'HIPICO_AGENT_EVALUATION_ALREADY_REVIEWED' });
      }
      const matched = row.predictedIntent === input.actualIntent;
      await tx.$executeRaw`
        UPDATE public.hipico_agent_evaluations
        SET actual_intent = ${input.actualIntent}, matched = ${matched},
          high_risk_false_positive = ${Boolean(input.highRiskFalsePositive)},
          unauthorized_action = ${Boolean(input.unauthorizedAction)},
          conflict = ${Boolean(input.conflict)}, reviewed_by = ${input.actorRef}, reviewed_at = now()
        WHERE id = ${input.id}::uuid AND owner_id = ${input.ownerId}::uuid
          AND group_key = ${input.groupKey} AND group_id = ${input.groupId}`;
      return { matched };
    });
  }

  async evaluations(ownerId: string, groupKey: string, groupId: string, limit = 100) {
    assertScope(ownerId, groupKey, groupId);
    const bounded = Math.min(500, Math.max(1, Math.trunc(limit) || 100));
    return prisma.$queryRaw<any[]>`
      SELECT id, message_hash AS "messageHash", expected_intent AS "expectedIntent",
        predicted_intent AS "predictedIntent", actual_intent AS "actualIntent", confidence, risk, tool,
        can_act AS "canAct", model_version AS "modelVersion", matched,
        high_risk_false_positive AS "highRiskFalsePositive", unauthorized_action AS "unauthorizedAction",
        conflict, evidence, created_at AS "createdAt", reviewed_at AS "reviewedAt", reviewed_by AS "reviewedBy"
      FROM public.hipico_agent_evaluations
      WHERE owner_id = ${ownerId}::uuid AND group_key = ${groupKey} AND group_id = ${groupId}
      ORDER BY created_at DESC
      LIMIT ${bounded}`;
  }
}
