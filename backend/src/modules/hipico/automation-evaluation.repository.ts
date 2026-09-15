import type { AgentCandidate } from './agent-policy.js';
import type { AutomationDbClient, AutomationScope } from './automation-scope.js';
import { SHADOW_METRIC_SCHEMA_VERSION } from './shadow-metrics.js';
import type { RiskPolicyDecision } from './risk-policy.js';

export async function insertAgentEvaluation(
  db: AutomationDbClient,
  input: AutomationScope & {
    id: string;
    messageHash: string;
    expectedIntent?: string | null;
    candidate: AgentCandidate;
    canAct: boolean;
    riskPolicy: RiskPolicyDecision;
    evidence: Record<string, unknown>;
    abstained: boolean;
  }
) {
  await db.$executeRaw`
    INSERT INTO public.hipico_agent_evaluations(
      id, owner_id, group_key, group_id, message_hash, expected_intent, predicted_intent,
      confidence, risk, tool, can_act, model_version, evidence,
      policy_disposition, policy_reason, policy_version, policy_evidence_state,
      abstained, metric_schema_version
    ) VALUES(
      ${input.id}::uuid, ${input.ownerId}::uuid, ${input.groupKey}, ${input.groupId}, ${input.messageHash},
      ${input.expectedIntent || null}, ${input.candidate.intent}, ${input.candidate.confidence}, ${input.candidate.risk},
      ${input.candidate.tool || null}, ${input.canAct}, ${input.candidate.modelVersion || input.candidate.source},
      ${JSON.stringify(input.evidence)}::jsonb, ${input.riskPolicy.disposition}, ${input.riskPolicy.reason},
      ${input.riskPolicy.version}, ${input.riskPolicy.evidenceState},
      ${input.abstained}, ${SHADOW_METRIC_SCHEMA_VERSION}
    )`;
}

export async function readEvaluationForReview(
  db: AutomationDbClient,
  input: AutomationScope & { id: string }
) {
  const rows = await db.$queryRaw<Array<{ predictedIntent: string; actualIntent: string | null }>>`
    SELECT predicted_intent AS "predictedIntent", actual_intent AS "actualIntent"
    FROM public.hipico_agent_evaluations
    WHERE id = ${input.id}::uuid AND owner_id = ${input.ownerId}::uuid
      AND group_key = ${input.groupKey} AND group_id = ${input.groupId}
    LIMIT 1 FOR UPDATE`;
  return rows[0] || null;
}

export async function updateEvaluationReview(
  db: AutomationDbClient,
  input: AutomationScope & {
    id: string;
    actualIntent: string;
    matched: boolean;
    actorRef: string;
    highRiskFalsePositive?: boolean;
    unauthorizedAction?: boolean;
    conflict?: boolean;
    raceContextError?: boolean;
  }
) {
  await db.$executeRaw`
    UPDATE public.hipico_agent_evaluations
    SET actual_intent = ${input.actualIntent}, matched = ${input.matched},
      high_risk_false_positive = ${Boolean(input.highRiskFalsePositive)},
      unauthorized_action = ${Boolean(input.unauthorizedAction)},
      conflict = ${Boolean(input.conflict)},
      race_context_error = ${Boolean(input.raceContextError)},
      reviewed_by = ${input.actorRef}, reviewed_at = now()
    WHERE id = ${input.id}::uuid AND owner_id = ${input.ownerId}::uuid
      AND group_key = ${input.groupKey} AND group_id = ${input.groupId}`;
}

export async function listAgentEvaluations(
  db: AutomationDbClient,
  input: AutomationScope,
  boundedLimit: number
) {
  return db.$queryRaw<any[]>`
    SELECT id, message_hash AS "messageHash", expected_intent AS "expectedIntent",
      predicted_intent AS "predictedIntent", actual_intent AS "actualIntent", confidence, risk, tool,
      can_act AS "canAct", model_version AS "modelVersion", matched,
      policy_disposition AS "policyDisposition", policy_reason AS "policyReason",
      policy_version AS "policyVersion", policy_evidence_state AS "policyEvidenceState",
      high_risk_false_positive AS "highRiskFalsePositive", unauthorized_action AS "unauthorizedAction",
      conflict, abstained, race_context_error AS "raceContextError", metric_schema_version AS "metricSchemaVersion",
      evidence, created_at AS "createdAt", reviewed_at AS "reviewedAt", reviewed_by AS "reviewedBy"
    FROM public.hipico_agent_evaluations
    WHERE owner_id = ${input.ownerId}::uuid AND group_key = ${input.groupKey} AND group_id = ${input.groupId}
    ORDER BY created_at DESC
    LIMIT ${boundedLimit}`;
}
