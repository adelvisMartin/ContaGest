import crypto from 'node:crypto';
import type { ConversationDecision } from './hipico-conversation-engine.js';

export const RESPONSE_POLICY_VERSION = 'hipico-response-v1';
export const MAX_CLARIFICATIONS = 2;

export type SafeResponseIntent =
  | 'ACK_RECEIVED'
  | 'NEEDS_CLARIFICATION'
  | 'CONFIRMED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'ESCALATED'
  | 'SYSTEM_DEGRADED'
  | 'NONE';

export type PersistenceEvidence = {
  receiptId?: string | null;
  transactionId?: string | null;
  stateId?: string | null;
  persisted?: boolean;
};

export type HandoffState = {
  conversationKey: string;
  participantId: string;
  raceId: string | null;
  ownership: 'bot' | 'human';
  clarificationCount: number;
  reason: string | null;
  humanOwnerId: string | null;
  expiresAt: string | null;
  updatedAt: string;
};

export type SafeResponsePlan = {
  intent: SafeResponseIntent;
  text: string | null;
  canSend: boolean;
  confirmationVerified: boolean;
  responseIdempotencyKey: string;
  decisionVersion: string;
  correlationId: string;
  sourceMessageId: string;
  evidence: PersistenceEvidence | null;
  handoffRequired: boolean;
  reason: string;
};

export type OperatorCommand = 'pause' | 'resume' | 'escalate' | 'resolve' | 'reject';

function iso(value: Date | string | number = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Timestamp inválido.');
  return date.toISOString();
}

export function conversationKey(participantId: string, raceId?: string | null) {
  const raw = `${String(participantId || '').trim().toLowerCase()}|${String(raceId || 'global').trim().toLowerCase()}`;
  if (!raw.split('|')[0]) throw new Error('participantId obligatorio para handoff.');
  return `hconv_${crypto.createHash('sha256').update(raw).digest('hex').slice(0, 24)}`;
}

export function responseIdempotencyKey(decision: Pick<ConversationDecision, 'sourceMessageId' | 'policyVersion'>) {
  return `resp_${crypto.createHash('sha256').update(`${decision.sourceMessageId}|${decision.policyVersion}|${RESPONSE_POLICY_VERSION}`).digest('hex').slice(0, 32)}`;
}

export function initialHandoffState(participantId: string, raceId: string | null = null, at: Date | string | number = new Date()): HandoffState {
  return {
    conversationKey: conversationKey(participantId, raceId),
    participantId,
    raceId,
    ownership: 'bot',
    clarificationCount: 0,
    reason: null,
    humanOwnerId: null,
    expiresAt: null,
    updatedAt: iso(at)
  };
}

function activeHuman(state: HandoffState, at: Date | string | number) {
  if (state.ownership !== 'human') return false;
  if (!state.expiresAt) return true;
  return Date.parse(state.expiresAt) > new Date(at).getTime();
}

export function applyOperatorCommand(
  state: HandoffState,
  command: OperatorCommand,
  options: { authenticatedOperator: boolean; operatorId?: string | null; reason?: string; ttlMs?: number; at?: Date | string | number } = { authenticatedOperator: false }
): HandoffState {
  if (!options.authenticatedOperator || !String(options.operatorId || '').trim()) {
    throw Object.assign(new Error('Comando de operador no autenticado.'), { code: 'HIPICO_OPERATOR_AUTH_REQUIRED' });
  }
  const at = options.at ?? new Date();
  const operatorId = String(options.operatorId).trim();
  if (command === 'pause' || command === 'escalate') {
    const ttl = Math.max(0, Number(options.ttlMs ?? 30 * 60 * 1000));
    return {
      ...state,
      ownership: 'human',
      humanOwnerId: operatorId,
      reason: options.reason || command,
      expiresAt: ttl > 0 ? new Date(new Date(at).getTime() + ttl).toISOString() : null,
      updatedAt: iso(at)
    };
  }
  if (command === 'resume' || command === 'resolve') {
    return {
      ...state,
      ownership: 'bot',
      humanOwnerId: null,
      reason: options.reason || command,
      expiresAt: null,
      clarificationCount: command === 'resolve' ? 0 : state.clarificationCount,
      updatedAt: iso(at)
    };
  }
  return {
    ...state,
    ownership: 'human',
    humanOwnerId: operatorId,
    reason: options.reason || 'rejected-by-operator',
    expiresAt: null,
    updatedAt: iso(at)
  };
}

export function recoverExpiredHandoff(state: HandoffState, at: Date | string | number = new Date()) {
  if (state.ownership !== 'human' || !state.expiresAt || Date.parse(state.expiresAt) > new Date(at).getTime()) return state;
  return {
    ...state,
    ownership: 'bot' as const,
    humanOwnerId: null,
    reason: 'handoff-timeout-released-non-monetary-only',
    expiresAt: null,
    updatedAt: iso(at)
  };
}

export function updateHandoffAfterDecision(state: HandoffState, decision: ConversationDecision, at: Date | string | number = new Date()) {
  const recovered = recoverExpiredHandoff(state, at);
  if (decision.decision !== 'NEEDS_CLARIFICATION') return recovered;
  const count = recovered.clarificationCount + 1;
  if (count < MAX_CLARIFICATIONS) return { ...recovered, clarificationCount: count, updatedAt: iso(at) };
  return {
    ...recovered,
    clarificationCount: count,
    ownership: 'human' as const,
    humanOwnerId: null,
    reason: 'max-clarifications-reached',
    expiresAt: null,
    updatedAt: iso(at)
  };
}

function verifiedEvidence(evidence?: PersistenceEvidence | null) {
  if (!evidence?.persisted) return false;
  return Boolean(String(evidence.receiptId || evidence.transactionId || evidence.stateId || '').trim());
}

export function planSafeResponse(
  decision: ConversationDecision,
  options: {
    handoffState?: HandoffState | null;
    evidence?: PersistenceEvidence | null;
    systemHealthy?: boolean;
    at?: Date | string | number;
  } = {}
): SafeResponsePlan {
  const state = options.handoffState ? recoverExpiredHandoff(options.handoffState, options.at ?? new Date()) : null;
  const key = responseIdempotencyKey(decision);
  const base = {
    responseIdempotencyKey: key,
    decisionVersion: `${decision.policyVersion}+${RESPONSE_POLICY_VERSION}`,
    correlationId: decision.correlationId,
    sourceMessageId: decision.sourceMessageId
  };

  if (state && activeHuman(state, options.at ?? new Date())) {
    return { ...base, intent: 'NONE', text: null, canSend: false, confirmationVerified: false, evidence: null, handoffRequired: true, reason: 'HUMAN_OWNS_CONVERSATION' };
  }

  if (options.systemHealthy === false) {
    return { ...base, intent: 'SYSTEM_DEGRADED', text: 'El sistema no puede verificar la operación en este momento. Queda pendiente de revisión; no se confirmó ningún registro.', canSend: true, confirmationVerified: false, evidence: null, handoffRequired: true, reason: 'SYSTEM_NOT_AUTHORITATIVE' };
  }

  if (decision.responseIntent === 'NONE') {
    return { ...base, intent: 'NONE', text: null, canSend: false, confirmationVerified: false, evidence: null, handoffRequired: decision.audit.humanOwned, reason: decision.decisionReason };
  }

  if (decision.decision === 'NEEDS_CLARIFICATION') {
    const reachedLimit = Boolean(state && state.clarificationCount + 1 >= MAX_CLARIFICATIONS);
    return {
      ...base,
      intent: reachedLimit ? 'ESCALATED' : 'NEEDS_CLARIFICATION',
      text: reachedLimit ? 'Necesito que un operador revise esta conversación antes de continuar. No se registró ninguna operación.' : decision.responseText,
      canSend: true,
      confirmationVerified: false,
      evidence: null,
      handoffRequired: reachedLimit,
      reason: reachedLimit ? 'MAX_CLARIFICATIONS_REACHED' : decision.decisionReason
    };
  }

  if (decision.decision === 'REJECTED') {
    return { ...base, intent: 'REJECTED', text: decision.responseText || 'La operación fue rechazada y no se registró.', canSend: true, confirmationVerified: false, evidence: null, handoffRequired: false, reason: decision.decisionReason };
  }

  const evidence = options.evidence || null;
  if (verifiedEvidence(evidence)) {
    const evidenceId = evidence?.receiptId || evidence?.transactionId || evidence?.stateId;
    return { ...base, intent: 'CONFIRMED', text: `Operación confirmada. Referencia: ${String(evidenceId).slice(0, 120)}.`, canSend: true, confirmationVerified: true, evidence, handoffRequired: false, reason: 'PERSISTED_EVIDENCE_VERIFIED' };
  }

  return {
    ...base,
    intent: decision.decision === 'ESCALATED' ? 'ESCALATED' : 'ACK_RECEIVED',
    text: decision.responseText || 'Mensaje recibido para revisión. No se ha confirmado ninguna operación.',
    canSend: decision.decision !== 'NO_RESPONSE',
    confirmationVerified: false,
    evidence: null,
    handoffRequired: decision.decision === 'ESCALATED',
    reason: decision.decisionReason
  };
}
