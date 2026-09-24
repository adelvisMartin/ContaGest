import crypto from 'node:crypto';
import type { ConversationDecision } from './hipico-conversation-engine.js';

export const RESPONSE_POLICY_VERSION = 'hipico-response-v3';
export const MAX_CLARIFICATIONS = 3;
export const AUTOMATIC_HANDOFF_TTL_MS = 15 * 60 * 1000;

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
  sourceMessageId?: string | null;
  correlationId?: string | null;
};

export type HandoffState = {
  conversationKey: string;
  groupKey: string;
  participantId: string;
  raceId: string | null;
  ownership: 'bot' | 'human';
  clarificationCount: number;
  reason: string | null;
  humanOwnerId: string | null;
  expiresAt: string | null;
  updatedAt: string;
  /** Optimistic-concurrency token loaded from persistence. Zero means not persisted yet. */
  version?: number;
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

function parsedExpiry(value: string | null) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function conversationKey(groupKey: string, participantId: string, raceId?: string | null) {
  const group = String(groupKey || '').trim().toLowerCase();
  const participant = String(participantId || '').trim().toLowerCase();
  if (!group || !participant) throw new Error('groupKey y participantId son obligatorios para handoff.');
  const raw = `${group}|${participant}|${String(raceId || 'global').trim().toLowerCase()}`;
  return `hconv_${crypto.createHash('sha256').update(raw).digest('hex').slice(0, 24)}`;
}

export function responseIdempotencyKey(decision: Pick<ConversationDecision, 'sourceMessageId' | 'policyVersion'>) {
  return `resp_${crypto.createHash('sha256').update(`${decision.sourceMessageId}|${decision.policyVersion}|${RESPONSE_POLICY_VERSION}`).digest('hex').slice(0, 32)}`;
}

export function initialHandoffState(groupKey: string, participantId: string, raceId: string | null = null, at: Date | string | number = new Date()): HandoffState {
  return {
    conversationKey: conversationKey(groupKey, participantId, raceId),
    groupKey,
    participantId,
    raceId,
    ownership: 'bot',
    clarificationCount: 0,
    reason: null,
    humanOwnerId: null,
    expiresAt: null,
    updatedAt: iso(at),
    version: 0
  };
}

function activeHuman(state: HandoffState, at: Date | string | number) {
  if (state.ownership !== 'human') return false;
  if (!state.expiresAt) return true;
  const expiry = parsedExpiry(state.expiresAt);
  if (!Number.isFinite(expiry)) return true;
  const now = new Date(at).getTime();
  if (!Number.isFinite(now)) return true;
  return expiry > now;
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
    const rawTtl = Number(options.ttlMs ?? 30 * 60 * 1000);
    if (!Number.isFinite(rawTtl) || rawTtl < 0) {
      throw Object.assign(new Error('TTL de handoff inválido.'), { code: 'HIPICO_HANDOFF_TTL_INVALID' });
    }
    const ttl = rawTtl;
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
  if (state.ownership !== 'human' || !state.expiresAt) return state;
  const expiry = parsedExpiry(state.expiresAt);
  const now = new Date(at).getTime();
  if (!Number.isFinite(expiry) || !Number.isFinite(now) || expiry > now) return state;
  return {
    ...state,
    ownership: 'bot' as const,
    humanOwnerId: null,
    reason: 'handoff-timeout-released',
    expiresAt: null,
    clarificationCount: state.reason === 'max-clarifications-reached' ? 0 : state.clarificationCount,
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
    expiresAt: new Date(new Date(at).getTime() + AUTOMATIC_HANDOFF_TTL_MS).toISOString(),
    updatedAt: iso(at)
  };
}

function verifiedEvidence(evidence: PersistenceEvidence | null | undefined, decision: ConversationDecision) {
  if (!evidence?.persisted) return false;
  if (!String(evidence.receiptId || evidence.transactionId || evidence.stateId || '').trim()) return false;
  if (String(evidence.sourceMessageId || '') !== decision.sourceMessageId) return false;
  if (String(evidence.correlationId || '') !== decision.correlationId) return false;
  return true;
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

  const clarificationLimitHandoff = Boolean(
    state
    && state.ownership === 'human'
    && state.reason === 'max-clarifications-reached'
    && decision.decision === 'NEEDS_CLARIFICATION'
  );
  if (state && activeHuman(state, options.at ?? new Date()) && !clarificationLimitHandoff) {
    return { ...base, intent: 'NONE', text: null, canSend: false, confirmationVerified: false, evidence: null, handoffRequired: true, reason: 'HUMAN_OWNS_CONVERSATION' };
  }

  if (options.systemHealthy === false) {
    return { ...base, intent: 'SYSTEM_DEGRADED', text: 'El sistema no puede verificar la operación en este momento. Queda pendiente de revisión; no se confirmó ningún registro.', canSend: true, confirmationVerified: false, evidence: null, handoffRequired: true, reason: 'SYSTEM_NOT_AUTHORITATIVE' };
  }

  if (decision.responseIntent === 'NONE') {
    return { ...base, intent: 'NONE', text: null, canSend: false, confirmationVerified: false, evidence: null, handoffRequired: decision.audit.humanOwned, reason: decision.decisionReason };
  }

  if (decision.decision === 'NEEDS_CLARIFICATION') {
    const reachedLimit = Boolean(state && state.clarificationCount >= MAX_CLARIFICATIONS);
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
  if (verifiedEvidence(evidence, decision)) {
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
    reason: evidence?.persisted ? 'PERSISTENCE_EVIDENCE_NOT_BOUND_TO_DECISION' : decision.decisionReason
  };
}
