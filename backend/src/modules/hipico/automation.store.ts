import crypto from 'node:crypto';
import { prisma } from '../../database/prisma.js';
import {
  AUTOMATION_STATES,
  type AgentCandidate,
  type AutomationMetrics,
  type AutomationState,
  type PromotionDecision
} from './agent-contracts.js';
import { sanitizeAgentEvidence, automationTransitionSignature } from './automation-evidence.js';
import { readMetricsSnapshot } from './automation-metrics.store.js';
import { readDecisionProviderMetricsSnapshot } from './decision-provider-metrics.store.js';
import {
  assertAutomationScope,
  defaultAutomationMode,
  isValidAutomationIdempotencyKey,
  lockAutomationScope,
  sourceMayTargetAutomation
} from './automation-scope.js';
import { canPromoteAutomation } from './promotion-policy.js';
import { SHADOW_METRIC_SCHEMA_VERSION } from './shadow-metrics.js';
import type { RiskPolicyDecision } from './risk-policy.js';

type TransitionEventRow = {
  id: string;
  inputSignature: string;
  fromMode: AutomationState;
  toMode: AutomationState;
  disposition: 'applied' | 'rejected' | 'noop';
  reason: string;
  metrics: AutomationMetrics;
  decision: PromotionDecision;
  createdAt: Date | string;
};

function transitionDisposition(
  decision: PromotionDecision,
  current: AutomationState,
  target: AutomationState
): TransitionEventRow['disposition'] {
  if (!decision.allowed) return 'rejected';
  return target === current ? 'noop' : 'applied';
}

export class AutomationStore {
  async decisionProviderMetrics(ownerId: string, groupKey: string, groupId: string) {
    assertAutomationScope(ownerId, groupKey, groupId);
    return readDecisionProviderMetricsSnapshot(prisma, ownerId, groupKey, groupId);
  }

  async metrics(ownerId: string, groupKey: string, groupId: string): Promise<AutomationMetrics> {
    assertAutomationScope(ownerId, groupKey, groupId);
    return prisma.$transaction(async (tx) => {
      await lockAutomationScope(tx, ownerId, groupKey, groupId);
      return readMetricsSnapshot(tx, ownerId, groupKey, groupId);
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
    if (!(AUTOMATION_STATES as readonly string[]).includes(input.target)) {
      throw new Error('HIPICO_AUTOMATION_STATE_INVALID');
    }
    if (!String(input.actorRef || '').startsWith('operator-token:')) {
      throw new Error('HIPICO_OPERATOR_ACTOR_NOT_CONFIGURED');
    }
    if (!isValidAutomationIdempotencyKey(input.idempotencyKey)) {
      throw new Error('HIPICO_AUTOMATION_IDEMPOTENCY_KEY_INVALID');
    }

    await this.get(input.ownerId, input.groupKey, input.groupId);
    const inputSignature = automationTransitionSignature(input);

    return prisma.$transaction(async (tx) => {
      await lockAutomationScope(tx, input.ownerId, input.groupKey, input.groupId);
      const prior = await tx.$queryRaw<TransitionEventRow[]>`
        SELECT id::text AS id, input_signature AS "inputSignature", from_mode AS "fromMode", to_mode AS "toMode",
          disposition, reason, metrics, decision, created_at AS "createdAt"
        FROM public.hipico_automation_transition_events
        WHERE owner_id = ${input.ownerId}::uuid AND group_key = ${input.groupKey} AND group_id = ${input.groupId}
          AND idempotency_key = ${input.idempotencyKey}
        LIMIT 1`;

      if (prior[0]) {
        if (prior[0].inputSignature !== inputSignature) {
          throw Object.assign(new Error('HIPICO_AUTOMATION_IDEMPOTENCY_MISMATCH'), {
            code: 'HIPICO_AUTOMATION_IDEMPOTENCY_MISMATCH'
          });
        }
        const event = prior[0];
        return {
          duplicate: true,
          eventId: event.id,
          previous: event.fromMode,
          current: event.disposition === 'applied' ? event.toMode : event.fromMode,
          target: event.toMode,
          disposition: event.disposition,
          decision: event.decision,
          metrics: event.metrics,
          createdAt: event.createdAt
        };
      }

      const rows = await tx.$queryRaw<Array<{ mode: AutomationState }>>`
        SELECT mode
        FROM public.hipico_group_automation
        WHERE owner_id = ${input.ownerId}::uuid AND group_key = ${input.groupKey} AND group_id = ${input.groupId}
        LIMIT 1 FOR UPDATE`;
      const current = rows[0]?.mode || defaultAutomationMode(input.groupId);
      const metrics = await readMetricsSnapshot(tx, input.ownerId, input.groupKey, input.groupId);
      const policyDecision = canPromoteAutomation(current, input.target, metrics, input.ownerApproved);
      const decision: PromotionDecision = sourceMayTargetAutomation(input.groupId, input.target)
        ? policyDecision
        : { ...policyDecision, allowed: false, reason: 'SOURCE_SHADOW_ONLY' };
      const disposition = transitionDisposition(decision, current, input.target);

      if (disposition === 'applied') {
        await tx.$executeRaw`
          UPDATE public.hipico_group_automation
          SET mode = ${input.target}, updated_by = ${input.actorRef}, updated_at = now()
          WHERE owner_id = ${input.ownerId}::uuid AND group_key = ${input.groupKey} AND group_id = ${input.groupId}`;
      }

      const eventId = crypto.randomUUID();
      const inserted = await tx.$queryRaw<Array<{ createdAt: Date | string }>>`
        INSERT INTO public.hipico_automation_transition_events(
          id, owner_id, group_key, group_id, idempotency_key, input_signature,
          from_mode, to_mode, disposition, reason, actor_ref, owner_approved, metrics, decision
        ) VALUES(
          ${eventId}::uuid, ${input.ownerId}::uuid, ${input.groupKey}, ${input.groupId}, ${input.idempotencyKey}, ${inputSignature},
          ${current}, ${input.target}, ${disposition}, ${decision.reason}, ${input.actorRef}, ${Boolean(input.ownerApproved)},
          ${JSON.stringify(metrics)}::jsonb, ${JSON.stringify(decision)}::jsonb
        ) RETURNING created_at AS "createdAt"`;

      return {
        duplicate: false,
        eventId,
        previous: current,
        current: disposition === 'applied' ? input.target : current,
        target: input.target,
        disposition,
        decision,
        metrics,
        createdAt: inserted[0]?.createdAt || null
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
      await tx.$executeRaw`
        INSERT INTO public.hipico_agent_evaluations(
          id, owner_id, group_key, group_id, message_hash, expected_intent, predicted_intent,
          confidence, risk, tool, can_act, model_version, evidence,
          policy_disposition, policy_reason, policy_version, policy_evidence_state,
          abstained, metric_schema_version
        ) VALUES(
          ${id}::uuid, ${input.ownerId}::uuid, ${input.groupKey}, ${input.groupId}, ${messageHash},
          ${input.expectedIntent || null}, ${input.candidate.intent}, ${input.candidate.confidence}, ${input.candidate.risk},
          ${input.candidate.tool || null}, ${input.canAct}, ${input.candidate.modelVersion || input.candidate.source},
          ${JSON.stringify(evidence)}::jsonb, ${input.riskPolicy.disposition}, ${input.riskPolicy.reason},
          ${input.riskPolicy.version}, ${input.riskPolicy.evidenceState},
          ${abstained}, ${SHADOW_METRIC_SCHEMA_VERSION}
        )`;
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
    if (!String(input.actorRef || '').startsWith('operator-token:')) {
      throw new Error('HIPICO_OPERATOR_ACTOR_NOT_CONFIGURED');
    }

    return prisma.$transaction(async (tx) => {
      await lockAutomationScope(tx, input.ownerId, input.groupKey, input.groupId);
      const rows = await tx.$queryRaw<Array<{ predictedIntent: string; actualIntent: string | null }>>`
        SELECT predicted_intent AS "predictedIntent", actual_intent AS "actualIntent"
        FROM public.hipico_agent_evaluations
        WHERE id = ${input.id}::uuid AND owner_id = ${input.ownerId}::uuid
          AND group_key = ${input.groupKey} AND group_id = ${input.groupId}
        LIMIT 1 FOR UPDATE`;
      const row = rows[0];
      if (!row) {
        throw Object.assign(new Error('HIPICO_AGENT_EVALUATION_NOT_FOUND'), {
          code: 'HIPICO_AGENT_EVALUATION_NOT_FOUND'
        });
      }
      if (row.actualIntent !== null) {
        throw Object.assign(new Error('HIPICO_AGENT_EVALUATION_ALREADY_REVIEWED'), {
          code: 'HIPICO_AGENT_EVALUATION_ALREADY_REVIEWED'
        });
      }

      const matched = row.predictedIntent === input.actualIntent;
      await tx.$executeRaw`
        UPDATE public.hipico_agent_evaluations
        SET actual_intent = ${input.actualIntent}, matched = ${matched},
          high_risk_false_positive = ${Boolean(input.highRiskFalsePositive)},
          unauthorized_action = ${Boolean(input.unauthorizedAction)},
          conflict = ${Boolean(input.conflict)},
          race_context_error = ${Boolean(input.raceContextError)},
          reviewed_by = ${input.actorRef}, reviewed_at = now()
        WHERE id = ${input.id}::uuid AND owner_id = ${input.ownerId}::uuid
          AND group_key = ${input.groupKey} AND group_id = ${input.groupId}`;
      return { matched };
    });
  }

  async evaluations(ownerId: string, groupKey: string, groupId: string, limit = 100) {
    assertAutomationScope(ownerId, groupKey, groupId);
    const bounded = Math.min(500, Math.max(1, Math.trunc(limit) || 100));
    return prisma.$queryRaw<any[]>`
      SELECT id, message_hash AS "messageHash", expected_intent AS "expectedIntent",
        predicted_intent AS "predictedIntent", actual_intent AS "actualIntent", confidence, risk, tool,
        can_act AS "canAct", model_version AS "modelVersion", matched,
        policy_disposition AS "policyDisposition", policy_reason AS "policyReason",
        policy_version AS "policyVersion", policy_evidence_state AS "policyEvidenceState",
        high_risk_false_positive AS "highRiskFalsePositive", unauthorized_action AS "unauthorizedAction",
        conflict, abstained, race_context_error AS "raceContextError", metric_schema_version AS "metricSchemaVersion",
        evidence, created_at AS "createdAt", reviewed_at AS "reviewedAt", reviewed_by AS "reviewedBy"
      FROM public.hipico_agent_evaluations
      WHERE owner_id = ${ownerId}::uuid AND group_key = ${groupKey} AND group_id = ${groupId}
      ORDER BY created_at DESC
      LIMIT ${bounded}`;
  }

  async transitionEvents(ownerId: string, groupKey: string, groupId: string, limit = 100) {
    assertAutomationScope(ownerId, groupKey, groupId);
    const bounded = Math.min(500, Math.max(1, Math.trunc(limit) || 100));
    return prisma.$queryRaw<any[]>`
      SELECT id, idempotency_key AS "idempotencyKey", from_mode AS "fromMode", to_mode AS "toMode",
        disposition, reason, actor_ref AS "actorRef", owner_approved AS "ownerApproved",
        metrics, decision, created_at AS "createdAt"
      FROM public.hipico_automation_transition_events
      WHERE owner_id = ${ownerId}::uuid AND group_key = ${groupKey} AND group_id = ${groupId}
      ORDER BY created_at DESC, id DESC
      LIMIT ${bounded}`;
  }
}

export { sanitizeAgentEvidence };
export const __test__ = { readMetricsSnapshot, transitionDisposition };
