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
import {
  buildAutomationMetrics,
  normalizeMetricWindow,
  SHADOW_METRIC_SCHEMA_VERSION
} from './shadow-metrics.js';
import type { RiskPolicyDecision } from './risk-policy.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GROUP_RE = /^[A-Za-z0-9._:-]{3,120}$/;
const GROUP_ID_RE = /^[A-Za-z0-9@._:-]{3,220}$/;
const IDEMPOTENCY_RE = /^[A-Za-z0-9._:-]{8,120}$/;
const FORBIDDEN_EVIDENCE_KEY = /(?:token|secret|password|credential|authorization|cookie|api[_-]?key|prototype|constructor|__proto__)/i;
const MAX_EVIDENCE_BYTES = 16 * 1024;
const MAX_EVIDENCE_DEPTH = 16;
const SHADOW_INDEX = AUTOMATION_STATES.indexOf('SHADOW');

type DbClient = typeof prisma | Prisma.TransactionClient;
type MetricAggregateRow = {
  reviewed: bigint | number;
  matched: bigint | number;
  highRiskFalsePositive: bigint | number;
  unauthorizedAction: bigint | number;
  conflicts: bigint | number;
  abstentions: bigint | number;
  raceContextErrors: bigint | number;
};
type IntentMetricRow = MetricAggregateRow & { actualIntent: string };
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

type Scope = { ownerId: string; groupKey: string; groupId: string };

function assertScope(ownerId: string, groupKey: string, groupId: string) {
  if (!UUID_RE.test(ownerId)) throw new Error('HIPICO_OWNER_INVALID');
  if (!GROUP_RE.test(groupKey)) throw new Error('HIPICO_GROUP_INVALID');
  if (!GROUP_ID_RE.test(groupId)) throw new Error('HIPICO_AUTOMATION_GROUP_ID_INVALID');
}

function scope(input: Scope): Scope {
  assertScope(input.ownerId, input.groupKey, input.groupId);
  return input;
}

function isPinnedSourceGroup(groupId: string) {
  const configured = String(process.env.HIPICO_SOURCE_GROUP_ID || '').trim();
  return Boolean(configured) && configured.toLowerCase() === String(groupId || '').trim().toLowerCase();
}

function defaultMode(groupId: string): AutomationState {
  return isPinnedSourceGroup(groupId) ? 'SHADOW' : 'DISABLED';
}

function sourceMayTarget(groupId: string, target: AutomationState) {
  if (!isPinnedSourceGroup(groupId)) return true;
  return AUTOMATION_STATES.indexOf(target) <= SHADOW_INDEX;
}

function scopeLockKey(ownerId: string, groupKey: string, groupId: string) {
  return `hipico-agent:${ownerId}:${groupKey}:${groupId}`;
}

async function lockScope(db: DbClient, ownerId: string, groupKey: string, groupId: string) {
  const key = scopeLockKey(ownerId, groupKey, groupId);
  await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

async function readHistoricalMetricWindow(db: DbClient, input: Scope) {
  const rows = await db.$queryRaw<MetricAggregateRow[]>`
    SELECT
      count(*) FILTER (WHERE actual_intent IS NOT NULL) AS reviewed,
      count(*) FILTER (WHERE actual_intent IS NOT NULL AND matched = true) AS matched,
      count(*) FILTER (WHERE actual_intent IS NOT NULL AND high_risk_false_positive = true) AS "highRiskFalsePositive",
      count(*) FILTER (WHERE actual_intent IS NOT NULL AND unauthorized_action = true) AS "unauthorizedAction",
      count(*) FILTER (WHERE actual_intent IS NOT NULL AND conflict = true) AS conflicts,
      count(*) FILTER (WHERE actual_intent IS NOT NULL AND abstained = true) AS abstentions,
      count(*) FILTER (WHERE actual_intent IS NOT NULL AND race_context_error = true) AS "raceContextErrors"
    FROM public.hipico_agent_evaluations
    WHERE owner_id = ${input.ownerId}::uuid AND group_key = ${input.groupKey} AND group_id = ${input.groupId}`;
  return normalizeMetricWindow(rows[0] || {});
}

async function readRecentMetricWindow(db: DbClient, input: Scope) {
  const rows = await db.$queryRaw<MetricAggregateRow[]>`
    SELECT
      count(*) AS reviewed,
      count(*) FILTER (WHERE matched = true) AS matched,
      count(*) FILTER (WHERE high_risk_false_positive = true) AS "highRiskFalsePositive",
      count(*) FILTER (WHERE unauthorized_action = true) AS "unauthorizedAction",
      count(*) FILTER (WHERE conflict = true) AS conflicts,
      count(*) FILTER (WHERE abstained = true) AS abstentions,
      count(*) FILTER (WHERE race_context_error = true) AS "raceContextErrors"
    FROM public.hipico_agent_evaluations
    WHERE owner_id = ${input.ownerId}::uuid AND group_key = ${input.groupKey} AND group_id = ${input.groupId}
      AND actual_intent IS NOT NULL
      AND metric_schema_version = 'v7'
      AND reviewed_at >= now() - interval '30 days'`;
  return normalizeMetricWindow(rows[0] || {});
}

async function readIntentMetrics(db: DbClient, input: Scope) {
  const rows = await db.$queryRaw<IntentMetricRow[]>`
    SELECT
      actual_intent AS "actualIntent",
      count(*) AS reviewed,
      count(*) FILTER (WHERE matched = true) AS matched,
      count(*) FILTER (WHERE high_risk_false_positive = true) AS "highRiskFalsePositive",
      count(*) FILTER (WHERE unauthorized_action = true) AS "unauthorizedAction",
      count(*) FILTER (WHERE conflict = true) AS conflicts,
      count(*) FILTER (WHERE abstained = true) AS abstentions,
      count(*) FILTER (WHERE race_context_error = true) AS "raceContextErrors"
    FROM public.hipico_agent_evaluations
    WHERE owner_id = ${input.ownerId}::uuid AND group_key = ${input.groupKey} AND group_id = ${input.groupId}
      AND actual_intent IS NOT NULL
    GROUP BY actual_intent
    ORDER BY actual_intent ASC`;
  return Object.fromEntries(rows.map((row) => [row.actualIntent, normalizeMetricWindow(row)]));
}

async function readRecentSince(db: DbClient) {
  const rows = await db.$queryRaw<Array<{ recentSince: Date | string }>>`
    SELECT now() - interval '30 days' AS "recentSince"`;
  return new Date(rows[0]?.recentSince || Date.now()).toISOString();
}

async function readMetricsSnapshot(db: DbClient, ownerId: string, groupKey: string, groupId: string): Promise<AutomationMetrics> {
  const input = scope({ ownerId, groupKey, groupId });
  const [historical, recent, byIntent, recentSince] = await Promise.all([
    readHistoricalMetricWindow(db, input),
    readRecentMetricWindow(db, input),
    readIntentMetrics(db, input),
    readRecentSince(db)
  ]);
  return buildAutomationMetrics({ historical, recent, byIntent, recentSince });
}

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

function transitionDisposition(decision: PromotionDecision, current: AutomationState, target: AutomationState): TransitionEventRow['disposition'] {
  if (!decision.allowed) return 'rejected';
  return target === current ? 'noop' : 'applied';
}

export class AutomationStore {
  async metrics(ownerId: string, groupKey: string, groupId: string): Promise<AutomationMetrics> {
    assertScope(ownerId, groupKey, groupId);
    return prisma.$transaction(async (tx) => {
      await lockScope(tx, ownerId, groupKey, groupId);
      return readMetricsSnapshot(tx, ownerId, groupKey, groupId);
    });
  }

  async read(ownerId: string, groupKey: string, groupId: string) {
    assertScope(ownerId, groupKey, groupId);
    const rows = await prisma.$queryRaw<any[]>`
      SELECT mode, updated_at AS "updatedAt", updated_by AS "updatedBy"
      FROM public.hipico_group_automation
      WHERE owner_id = ${ownerId}::uuid AND group_key = ${groupKey} AND group_id = ${groupId}
      LIMIT 1`;
    if (rows[0]) return { ...rows[0], persisted: true };
    return { mode: defaultMode(groupId), updatedAt: null, updatedBy: null, persisted: false };
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
    if (!IDEMPOTENCY_RE.test(String(input.idempotencyKey || '').trim())) throw new Error('HIPICO_AUTOMATION_IDEMPOTENCY_KEY_INVALID');
    await this.get(input.ownerId, input.groupKey, input.groupId);
    const inputSignature = transitionSignature(input);

    return prisma.$transaction(async (tx) => {
      await lockScope(tx, input.ownerId, input.groupKey, input.groupId);
      const prior = await tx.$queryRaw<TransitionEventRow[]>`
        SELECT id::text AS id, input_signature AS "inputSignature", from_mode AS "fromMode", to_mode AS "toMode",
          disposition, reason, metrics, decision, created_at AS "createdAt"
        FROM public.hipico_automation_transition_events
        WHERE owner_id = ${input.ownerId}::uuid AND group_key = ${input.groupKey} AND group_id = ${input.groupId}
          AND idempotency_key = ${input.idempotencyKey}
        LIMIT 1`;
      if (prior[0]) {
        if (prior[0].inputSignature !== inputSignature) {
          throw Object.assign(new Error('HIPICO_AUTOMATION_IDEMPOTENCY_MISMATCH'), { code: 'HIPICO_AUTOMATION_IDEMPOTENCY_MISMATCH' });
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
      const current = rows[0]?.mode || defaultMode(input.groupId);
      const metrics = await readMetricsSnapshot(tx, input.ownerId, input.groupKey, input.groupId);
      const policyDecision = canPromoteAutomation(current, input.target, metrics, input.ownerApproved);
      const decision: PromotionDecision = sourceMayTarget(input.groupId, input.target)
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
    assertScope(input.ownerId, input.groupKey, input.groupId);
    await this.get(input.ownerId, input.groupKey, input.groupId);
    const id = crypto.randomUUID();
    const messageHash = crypto.createHash('sha256').update(input.text).digest('hex');
    const evidence = sanitizeAgentEvidence(input.evidence);
    const abstained = input.candidate.intent === 'unknown';

    await prisma.$transaction(async (tx) => {
      await lockScope(tx, input.ownerId, input.groupKey, input.groupId);
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
          conflict = ${Boolean(input.conflict)},
          race_context_error = ${Boolean(input.raceContextError)},
          reviewed_by = ${input.actorRef}, reviewed_at = now()
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
    assertScope(ownerId, groupKey, groupId);
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

export const __test__ = { readMetricsSnapshot, transitionDisposition };
