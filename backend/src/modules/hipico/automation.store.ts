import crypto from 'node:crypto';
import { prisma } from '../../database/prisma.js';
import {
  AUTOMATION_STATES,
  canPromoteAutomation,
  type AgentCandidate,
  type AutomationMetrics,
  type AutomationState,
  type PromotionDecision
} from './agent-policy.js';
import {
  insertAgentEvaluation,
  listAgentEvaluations,
  readEvaluationForReview,
  updateEvaluationReview
} from './automation-evaluation.repository.js';
import { readAutomationMetricsSnapshot } from './automation-metrics.repository.js';
import {
  assertAutomationScope,
  defaultAutomationMode,
  lockAutomationScope,
  sourceMayTargetAutomation,
  type AutomationScope
} from './automation-scope.js';
import {
  insertAutomationTransition,
  listAutomationTransitions,
  readCurrentAutomationModeForUpdate,
  readTransitionByIdempotency,
  updateAutomationMode,
  type TransitionDisposition
} from './automation-transition.repository.js';
import type { RiskPolicyDecision } from './risk-policy.js';

const IDEMPOTENCY_RE = /^[A-Za-z0-9._:-]{8,120}$/;
const FORBIDDEN_EVIDENCE_KEY = /(?:token|secret|password|credential|authorization|cookie|api[_-]?key|prototype|constructor|__proto__)/i;
const MAX_EVIDENCE_BYTES = 16 * 1024;
const MAX_EVIDENCE_DEPTH = 16;

function assertEvidenceSafe(value: unknown, depth = 0): void {
  if (depth > MAX_EVIDENCE_DEPTH) throw new Error('HIPICO_AGENT_EVIDENCE_INVALID');
  if (Array.isArray(value)) {
    for (const item of value) assertEvidenceSafe(item, depth + 1);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_EVIDENCE_KEY.test(key)) throw new Error('HIPICO_AGENT_EVIDENCE_FORBIDDEN_KEY');
    assertEvidenceSafe(item, depth + 1);
  }
}

export function sanitizeAgentEvidence(value: unknown) {
  if (value == null) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('HIPICO_AGENT_EVIDENCE_INVALID');
  assertEvidenceSafe(value);
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new Error('HIPICO_AGENT_EVIDENCE_INVALID');
  }
  if (Buffer.byteLength(serialized, 'utf8') > MAX_EVIDENCE_BYTES) throw new Error('HIPICO_AGENT_EVIDENCE_TOO_LARGE');
  return JSON.parse(serialized) as Record<string, unknown>;
}

function transitionSignature(input: { target: AutomationState; ownerApproved: boolean; actorRef: string }) {
  return crypto.createHash('sha256').update(JSON.stringify({
    target: input.target,
    ownerApproved: Boolean(input.ownerApproved),
    actorRef: input.actorRef
  })).digest('hex');
}

function transitionDisposition(
  decision: PromotionDecision,
  current: AutomationState,
  target: AutomationState
): TransitionDisposition {
  if (!decision.allowed) return 'rejected';
  return target === current ? 'noop' : 'applied';
}

function boundedListLimit(limit: number) {
  return Math.min(500, Math.max(1, Math.trunc(limit) || 100));
}

export class AutomationStore {
  async metrics(ownerId: string, groupKey: string, groupId: string): Promise<AutomationMetrics> {
    assertAutomationScope(ownerId, groupKey, groupId);
    return prisma.$transaction(async (tx) => {
      await lockAutomationScope(tx, ownerId, groupKey, groupId);
      return readAutomationMetricsSnapshot(tx, ownerId, groupKey, groupId);
    });
  }

  async read(ownerId: string, groupKey: string, groupId: string) {
    assertAutomationScope(ownerId, groupKey, groupId);
    const rows = await prisma.$queryRaw<any[]>`
      SELECT mode, updated_at AS "updatedAt", updated_by AS "updatedBy"
      FROM public.hipico_group_automation
      WHERE owner_id = ${ownerId}::uuid AND group_key = ${groupKey} AND group_id = ${groupId}
      LIMIT 1`;
    if (rows[0]) return { ...rows[0], persisted: true };
    return { mode: defaultAutomationMode(groupId), updatedAt: null, updatedBy: null, persisted: false };
  }

  async get(ownerId: string, groupKey: string, groupId: string) {
    assertAutomationScope(ownerId, groupKey, groupId);
    const mode = defaultAutomationMode(groupId);
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
    assertAutomationScope(input.ownerId, input.groupKey, input.groupId);
    if (!(AUTOMATION_STATES as readonly string[]).includes(input.target)) throw new Error('HIPICO_AUTOMATION_STATE_INVALID');
    if (!String(input.actorRef || '').startsWith('operator-token:')) throw new Error('HIPICO_OPERATOR_ACTOR_NOT_CONFIGURED');
    if (!IDEMPOTENCY_RE.test(String(input.idempotencyKey || '').trim())) throw new Error('HIPICO_AUTOMATION_IDEMPOTENCY_KEY_INVALID');
    await this.get(input.ownerId, input.groupKey, input.groupId);
    const inputSignature = transitionSignature(input);
    const automationScope: AutomationScope = {
      ownerId: input.ownerId,
      groupKey: input.groupKey,
      groupId: input.groupId
    };

    return prisma.$transaction(async (tx) => {
      await lockAutomationScope(tx, input.ownerId, input.groupKey, input.groupId);
      const prior = await readTransitionByIdempotency(tx, automationScope, input.idempotencyKey);
      if (prior) {
        if (prior.inputSignature !== inputSignature) {
          throw Object.assign(new Error('HIPICO_AUTOMATION_IDEMPOTENCY_MISMATCH'), { code: 'HIPICO_AUTOMATION_IDEMPOTENCY_MISMATCH' });
        }
        return {
          duplicate: true,
          eventId: prior.id,
          previous: prior.fromMode,
          current: prior.disposition === 'applied' ? prior.toMode : prior.fromMode,
          target: prior.toMode,
          disposition: prior.disposition,
          decision: prior.decision,
          metrics: prior.metrics,
          createdAt: prior.createdAt
        };
      }

      const current = await readCurrentAutomationModeForUpdate(tx, automationScope)
        || defaultAutomationMode(input.groupId);
      const metrics = await readAutomationMetricsSnapshot(tx, input.ownerId, input.groupKey, input.groupId);
      const policyDecision = canPromoteAutomation(current, input.target, metrics, input.ownerApproved);
      const decision: PromotionDecision = sourceMayTargetAutomation(input.groupId, input.target)
        ? policyDecision
        : { ...policyDecision, allowed: false, reason: 'SOURCE_SHADOW_ONLY' };
      const disposition = transitionDisposition(decision, current, input.target);

      if (disposition === 'applied') {
        await updateAutomationMode(tx, {
          ...automationScope,
          target: input.target,
          actorRef: input.actorRef
        });
      }

      const eventId = crypto.randomUUID();
      const inserted = await insertAutomationTransition(tx, {
        ...automationScope,
        eventId,
        idempotencyKey: input.idempotencyKey,
        inputSignature,
        current,
        target: input.target,
        disposition,
        decision,
        metrics,
        actorRef: input.actorRef,
        ownerApproved: input.ownerApproved
      });

      return {
        duplicate: false,
        eventId,
        previous: current,
        current: disposition === 'applied' ? input.target : current,
        target: input.target,
        disposition,
        decision,
        metrics,
        createdAt: inserted.createdAt
      };
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
    riskPolicy: RiskPolicyDecision;
    evidence?: unknown;
  }) {
    assertAutomationScope(input.ownerId, input.groupKey, input.groupId);
    await this.get(input.ownerId, input.groupKey, input.groupId);
    const id = crypto.randomUUID();
    const messageHash = crypto.createHash('sha256').update(input.text).digest('hex');
    const evidence = sanitizeAgentEvidence(input.evidence);
    const abstained = input.candidate.intent === 'unknown';

    await prisma.$transaction(async (tx) => {
      await lockAutomationScope(tx, input.ownerId, input.groupKey, input.groupId);
      await insertAgentEvaluation(tx, {
        ownerId: input.ownerId,
        groupKey: input.groupKey,
        groupId: input.groupId,
        id,
        messageHash,
        expectedIntent: input.expectedIntent,
        candidate: input.candidate,
        canAct: input.canAct,
        riskPolicy: input.riskPolicy,
        evidence,
        abstained
      });
    });
    return { id, messageHash, riskPolicy: input.riskPolicy };
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
    raceContextError?: boolean;
  }) {
    assertAutomationScope(input.ownerId, input.groupKey, input.groupId);
    if (!String(input.actorRef || '').startsWith('operator-token:')) throw new Error('HIPICO_OPERATOR_ACTOR_NOT_CONFIGURED');
    const automationScope: AutomationScope = {
      ownerId: input.ownerId,
      groupKey: input.groupKey,
      groupId: input.groupId
    };

    return prisma.$transaction(async (tx) => {
      await lockAutomationScope(tx, input.ownerId, input.groupKey, input.groupId);
      const row = await readEvaluationForReview(tx, { ...automationScope, id: input.id });
      if (!row) throw Object.assign(new Error('HIPICO_AGENT_EVALUATION_NOT_FOUND'), { code: 'HIPICO_AGENT_EVALUATION_NOT_FOUND' });
      if (row.actualIntent !== null) {
        throw Object.assign(new Error('HIPICO_AGENT_EVALUATION_ALREADY_REVIEWED'), { code: 'HIPICO_AGENT_EVALUATION_ALREADY_REVIEWED' });
      }
      const matched = row.predictedIntent === input.actualIntent;
      await updateEvaluationReview(tx, {
        ...automationScope,
        id: input.id,
        actualIntent: input.actualIntent,
        matched,
        actorRef: input.actorRef,
        highRiskFalsePositive: input.highRiskFalsePositive,
        unauthorizedAction: input.unauthorizedAction,
        conflict: input.conflict,
        raceContextError: input.raceContextError
      });
      return { matched };
    });
  }

  async evaluations(ownerId: string, groupKey: string, groupId: string, limit = 100) {
    assertAutomationScope(ownerId, groupKey, groupId);
    return listAgentEvaluations(
      prisma,
      { ownerId, groupKey, groupId },
      boundedListLimit(limit)
    );
  }

  async transitionEvents(ownerId: string, groupKey: string, groupId: string, limit = 100) {
    assertAutomationScope(ownerId, groupKey, groupId);
    return listAutomationTransitions(
      prisma,
      { ownerId, groupKey, groupId },
      boundedListLimit(limit)
    );
  }
}

const readMetricsSnapshot = readAutomationMetricsSnapshot;
export const __test__ = { readMetricsSnapshot, transitionDisposition };
