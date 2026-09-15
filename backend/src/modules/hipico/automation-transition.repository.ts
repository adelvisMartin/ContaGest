import type { AutomationMetrics, AutomationState, PromotionDecision } from './agent-policy.js';
import type { AutomationDbClient, AutomationScope } from './automation-scope.js';

export type TransitionDisposition = 'applied' | 'rejected' | 'noop';

export type TransitionEventRow = {
  id: string;
  inputSignature: string;
  fromMode: AutomationState;
  toMode: AutomationState;
  disposition: TransitionDisposition;
  reason: string;
  metrics: AutomationMetrics;
  decision: PromotionDecision;
  createdAt: Date | string;
};

export async function readTransitionByIdempotency(
  db: AutomationDbClient,
  input: AutomationScope,
  idempotencyKey: string
): Promise<TransitionEventRow | null> {
  const rows = await db.$queryRaw<TransitionEventRow[]>`
    SELECT id::text AS id, input_signature AS "inputSignature", from_mode AS "fromMode", to_mode AS "toMode",
      disposition, reason, metrics, decision, created_at AS "createdAt"
    FROM public.hipico_automation_transition_events
    WHERE owner_id = ${input.ownerId}::uuid AND group_key = ${input.groupKey} AND group_id = ${input.groupId}
      AND idempotency_key = ${idempotencyKey}
    LIMIT 1`;
  return rows[0] || null;
}

export async function readCurrentAutomationModeForUpdate(
  db: AutomationDbClient,
  input: AutomationScope
): Promise<AutomationState | null> {
  const rows = await db.$queryRaw<Array<{ mode: AutomationState }>>`
    SELECT mode
    FROM public.hipico_group_automation
    WHERE owner_id = ${input.ownerId}::uuid AND group_key = ${input.groupKey} AND group_id = ${input.groupId}
    LIMIT 1 FOR UPDATE`;
  return rows[0]?.mode || null;
}

export async function updateAutomationMode(
  db: AutomationDbClient,
  input: AutomationScope & { target: AutomationState; actorRef: string }
) {
  await db.$executeRaw`
    UPDATE public.hipico_group_automation
    SET mode = ${input.target}, updated_by = ${input.actorRef}, updated_at = now()
    WHERE owner_id = ${input.ownerId}::uuid AND group_key = ${input.groupKey} AND group_id = ${input.groupId}`;
}

export async function insertAutomationTransition(
  db: AutomationDbClient,
  input: AutomationScope & {
    eventId: string;
    idempotencyKey: string;
    inputSignature: string;
    current: AutomationState;
    target: AutomationState;
    disposition: TransitionDisposition;
    decision: PromotionDecision;
    metrics: AutomationMetrics;
    actorRef: string;
    ownerApproved: boolean;
  }
) {
  const rows = await db.$queryRaw<Array<{ createdAt: Date | string }>>`
    INSERT INTO public.hipico_automation_transition_events(
      id, owner_id, group_key, group_id, idempotency_key, input_signature,
      from_mode, to_mode, disposition, reason, actor_ref, owner_approved, metrics, decision
    ) VALUES(
      ${input.eventId}::uuid, ${input.ownerId}::uuid, ${input.groupKey}, ${input.groupId}, ${input.idempotencyKey}, ${input.inputSignature},
      ${input.current}, ${input.target}, ${input.disposition}, ${input.decision.reason}, ${input.actorRef}, ${Boolean(input.ownerApproved)},
      ${JSON.stringify(input.metrics)}::jsonb, ${JSON.stringify(input.decision)}::jsonb
    ) RETURNING created_at AS "createdAt"`;
  return { createdAt: rows[0]?.createdAt || null };
}

export async function listAutomationTransitions(
  db: AutomationDbClient,
  input: AutomationScope,
  boundedLimit: number
) {
  return db.$queryRaw<any[]>`
    SELECT id, idempotency_key AS "idempotencyKey", from_mode AS "fromMode", to_mode AS "toMode",
      disposition, reason, actor_ref AS "actorRef", owner_approved AS "ownerApproved",
      metrics, decision, created_at AS "createdAt"
    FROM public.hipico_automation_transition_events
    WHERE owner_id = ${input.ownerId}::uuid AND group_key = ${input.groupKey} AND group_id = ${input.groupId}
    ORDER BY created_at DESC, id DESC
    LIMIT ${boundedLimit}`;
}
