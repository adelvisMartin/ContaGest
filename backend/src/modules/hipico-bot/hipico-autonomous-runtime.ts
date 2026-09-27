import { ensureSourceReplyOutbox } from './hipico-bridge-transport.store.js';
import {
  cancelAutonomousSourceReply,
  claimAutonomousSourceReply,
  deadLetterAutonomousSourceReply,
  getAutonomousSourceReply,
  holdAutonomousSourceReply,
  markAutonomousSourceReplyAmbiguous,
  markAutonomousSourceReplySent,
  type AutonomousSourceReplyRow
} from './hipico-autonomous-runtime.store.js';
import type { WhatsAppTransport } from './hipico-whatsapp-transport.js';

export type AutonomousPolicyDecision = 'AUTO' | 'SUGGEST' | 'HUMAN_REQUIRED' | 'DENY';
export type AutonomousGroupRole = 'LAB' | 'SOURCE' | 'ORPHAN';

export type AutonomousLabReplyInput = {
  eventId: string;
  sourceMessageId: string;
  groupId: string;
  groupRole: AutonomousGroupRole;
  text: string;
  intent: string;
  risk: string;
  financialAuthority: false;
  policy: () => AutonomousPolicyDecision | Promise<AutonomousPolicyDecision>;
  transport: WhatsAppTransport;
};

type SourceReplyCreateResult = {
  row: AutonomousSourceReplyRow;
  inserted: boolean;
};

type RuntimeDeps = {
  ensure: (input: { eventId: string; recipient: string; message: string; intent: string; risk: string }) => Promise<SourceReplyCreateResult>;
  claim: (id: string) => Promise<AutonomousSourceReplyRow | null>;
  get: (id: string) => Promise<AutonomousSourceReplyRow | null>;
  sent: (id: string, providerMessageId: string) => Promise<AutonomousSourceReplyRow | null>;
  ambiguous: (id: string, reason: unknown) => Promise<AutonomousSourceReplyRow | null>;
  hold: (id: string, reason: unknown) => Promise<AutonomousSourceReplyRow | null>;
  cancel: (id: string, reason: unknown) => Promise<AutonomousSourceReplyRow | null>;
  deadLetter: (id: string, reason: unknown) => Promise<AutonomousSourceReplyRow | null>;
};

const defaultDeps: RuntimeDeps = {
  ensure: ensureSourceReplyOutbox as RuntimeDeps['ensure'],
  claim: claimAutonomousSourceReply,
  get: getAutonomousSourceReply,
  sent: markAutonomousSourceReplySent,
  ambiguous: markAutonomousSourceReplyAmbiguous,
  hold: holdAutonomousSourceReply,
  cancel: cancelAutonomousSourceReply,
  deadLetter: deadLetterAutonomousSourceReply
};

function text(value: unknown, max: number) {
  return String(value ?? '').trim().slice(0, max);
}

function runtimeError(message: string, code: string) {
  return Object.assign(new Error(message), { code });
}

export function assertAutonomousLabEnvelope(input: AutonomousLabReplyInput) {
  if (!text(input.eventId, 180) || !text(input.sourceMessageId, 320)) {
    throw runtimeError('Stable event and source message identities are required.', 'HIPICO_AUTONOMOUS_IDENTITY_REQUIRED');
  }
  if (!text(input.groupId, 220)) {
    throw runtimeError('LAB group identity is required.', 'HIPICO_AUTONOMOUS_GROUP_REQUIRED');
  }
  if (input.groupRole !== 'LAB') {
    const code = input.groupRole === 'SOURCE'
      ? 'HIPICO_SOURCE_READ_ONLY'
      : 'HIPICO_AUTONOMOUS_GROUP_NOT_LAB';
    throw runtimeError('Autonomous QA side effects are restricted to the explicitly linked LAB group.', code);
  }
  if (input.financialAuthority !== false) {
    throw runtimeError('The autonomous agent cannot be a financial authority.', 'HIPICO_AUTONOMOUS_FINANCIAL_AUTHORITY_FORBIDDEN');
  }
  const body = text(input.text, 4001);
  if (!body || body.length > 4000) {
    throw runtimeError('Autonomous reply text is empty or too long.', 'HIPICO_AUTONOMOUS_REPLY_INVALID');
  }
  if (!text(input.intent, 120) || !text(input.risk, 80)) {
    throw runtimeError('Intent and risk evidence are required.', 'HIPICO_AUTONOMOUS_POLICY_EVIDENCE_REQUIRED');
  }
  return true;
}

function statusResult(row: AutonomousSourceReplyRow | null) {
  const status = String(row?.status || 'not_claimed');
  if (status === 'sent') return { status: 'duplicate' as const, row };
  if (status === 'ambiguous' || status === 'sending') return { status: 'reconciliation_required' as const, row };
  if (status === 'held') return { status: 'human_required' as const, row };
  if (status === 'cancelled') return { status: 'denied' as const, row };
  if (status === 'dead_letter') return { status: 'dead_letter' as const, row };
  return { status: 'not_claimed' as const, row };
}

async function persistPolicyStop(
  row: AutonomousSourceReplyRow,
  decision: AutonomousPolicyDecision,
  deps: RuntimeDeps
) {
  if (decision === 'DENY') {
    const denied = await deps.cancel(row.id, 'FINAL_POLICY_DENY');
    if (!denied) throw runtimeError('DENY policy state could not be persisted.', 'HIPICO_AUTONOMOUS_POLICY_STATE_PERSISTENCE_REQUIRED');
    return { status: 'denied' as const, row: denied };
  }
  const held = await deps.hold(row.id, `FINAL_POLICY_${decision}`);
  if (!held) throw runtimeError('Human/assisted policy hold could not be persisted.', 'HIPICO_AUTONOMOUS_POLICY_STATE_PERSISTENCE_REQUIRED');
  return { status: 'human_required' as const, row: held };
}

/**
 * Exactly-one logical LAB reply boundary.
 *
 * The immutable source event creates at most one source_reply row. A DB claim
 * serializes concurrent workers. Policy is evaluated again after the claim and
 * before transport I/O so a late DENY/HUMAN_REQUIRED cannot leak a response.
 * Any uncertain post-send failure becomes `ambiguous` and is never retried
 * automatically; reconciliation must decide whether a resend is safe.
 */
export async function executeAutonomousLabReply(
  input: AutonomousLabReplyInput,
  deps: RuntimeDeps = defaultDeps
) {
  assertAutonomousLabEnvelope(input);

  const created = await deps.ensure({
    eventId: text(input.eventId, 180),
    recipient: text(input.groupId, 220),
    message: String(input.text).trim(),
    intent: text(input.intent, 120),
    risk: text(input.risk, 80)
  });
  const existing = created.row;
  if (String(existing.status) !== 'planned') return statusResult(existing);

  const initialPolicy = await input.policy();
  if (initialPolicy !== 'AUTO') return persistPolicyStop(existing, initialPolicy, deps);

  const claimed = await deps.claim(existing.id);
  if (!claimed) return statusResult(await deps.get(existing.id));

  const finalPolicy = await input.policy();
  if (finalPolicy !== 'AUTO') return persistPolicyStop(claimed, finalPolicy, deps);

  try {
    const result = await input.transport.send({
      destinationKey: input.groupId,
      text: String(input.text).trim(),
      sourceMessageId: input.sourceMessageId,
      responseIdempotencyKey: `source-reply:${input.sourceMessageId}`,
      mode: 'lab'
    });

    if (!result.accepted) {
      const terminal = await deps.deadLetter(claimed.id, result.reason || 'TRANSPORT_REJECTED');
      if (!terminal) throw runtimeError('Rejected transport state could not be persisted.', 'HIPICO_AUTONOMOUS_OUTBOX_STATE_PERSISTENCE_REQUIRED');
      return { status: 'dead_letter' as const, row: terminal, transport: result.transport };
    }

    if (!String(result.providerMessageId || '').trim()) {
      throw runtimeError('Transport accepted the message without a provider id.', 'HIPICO_AUTONOMOUS_DELIVERY_AMBIGUOUS');
    }

    const sent = await deps.sent(claimed.id, String(result.providerMessageId));
    if (!sent) {
      throw runtimeError('Accepted delivery could not be persisted.', 'HIPICO_AUTONOMOUS_DELIVERY_AMBIGUOUS');
    }
    return {
      status: 'sent' as const,
      row: sent,
      providerMessageId: String(result.providerMessageId),
      transport: result.transport
    };
  } catch (error: any) {
    const ambiguous = await deps.ambiguous(claimed.id, error?.code || error?.message || 'AMBIGUOUS_DELIVERY');
    if (!ambiguous) {
      throw runtimeError('Ambiguous delivery state could not be persisted.', 'HIPICO_AUTONOMOUS_OUTBOX_STATE_PERSISTENCE_REQUIRED');
    }
    return { status: 'reconciliation_required' as const, row: ambiguous };
  }
}

export const __test__ = { statusResult, persistPolicyStop };
