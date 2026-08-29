import crypto from 'node:crypto';
import { classify, type IntentResult } from './hipico-operational-classifier.js';

export const CONVERSATION_POLICY_VERSION = 'hipico-conversation-v1';
export const DEFAULT_PARSER_VERSION = 'hipico-operational-classifier-v1';

export type ConversationStage =
  | 'RECEIVED'
  | 'NORMALIZED'
  | 'PARSED'
  | 'CONTEXT_RESOLVED'
  | 'DECISIONED'
  | 'RESPONSE_PLANNED';

export type ConversationDecisionType =
  | 'NO_RESPONSE'
  | 'ACK_RECEIVED'
  | 'NEEDS_CLARIFICATION'
  | 'HELD_FOR_REVIEW'
  | 'REJECTED'
  | 'ESCALATED';

export type ConversationMessage = {
  sourceMessageId: string;
  participantId: string;
  text: string;
  timestamp: string;
  raceId?: string | null;
  quotedSourceMessageId?: string | null;
  mediaKind?: string | null;
};

export type ConversationContext = {
  seenSourceMessageIds?: ReadonlySet<string> | readonly string[];
  lastTimestampByParticipant?: Readonly<Record<string, string>>;
  activeRaceId?: string | null;
  closedRaceIds?: ReadonlySet<string> | readonly string[];
  humanOwnedParticipantIds?: ReadonlySet<string> | readonly string[];
};

export type ConversationDecision = {
  stage: 'RESPONSE_PLANNED';
  stages: readonly ConversationStage[];
  decision: ConversationDecisionType;
  decisionReason: string;
  responseIntent:
    | 'NONE'
    | 'ACK_RECEIVED'
    | 'NEEDS_CLARIFICATION'
    | 'REJECTED'
    | 'ESCALATED'
    | 'SYSTEM_DEGRADED';
  responseText: string | null;
  confidence: number;
  parserVersion: string;
  policyVersion: string;
  correlationId: string;
  sourceMessageId: string;
  participantId: string;
  raceId: string | null;
  classifierIntent: string;
  effectsAllowed: false;
  transportAction: 'NONE';
  audit: {
    duplicate: boolean;
    outOfOrder: boolean;
    humanOwned: boolean;
    monetaryOrStateful: boolean;
  };
};

function asSet(value: ReadonlySet<string> | readonly string[] | undefined) {
  return value instanceof Set ? value : new Set(value || []);
}

function canonicalParticipant(value: string) {
  return String(value || '').trim().toLowerCase();
}

function deterministicCorrelationId(message: ConversationMessage) {
  return `conv_${crypto
    .createHash('sha256')
    .update(`${CONVERSATION_POLICY_VERSION}|${message.sourceMessageId}|${canonicalParticipant(message.participantId)}`)
    .digest('hex')
    .slice(0, 24)}`;
}

function validTimestamp(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isOutOfOrder(message: ConversationMessage, context: ConversationContext) {
  const previous = context.lastTimestampByParticipant?.[canonicalParticipant(message.participantId)];
  if (!previous) return false;
  const currentMs = validTimestamp(message.timestamp);
  const previousMs = validTimestamp(previous);
  return currentMs !== null && previousMs !== null && currentMs < previousMs;
}

function response(
  message: ConversationMessage,
  result: IntentResult,
  decision: ConversationDecisionType,
  decisionReason: string,
  responseIntent: ConversationDecision['responseIntent'],
  responseText: string | null,
  audit: ConversationDecision['audit']
): ConversationDecision {
  return {
    stage: 'RESPONSE_PLANNED',
    stages: ['RECEIVED', 'NORMALIZED', 'PARSED', 'CONTEXT_RESOLVED', 'DECISIONED', 'RESPONSE_PLANNED'],
    decision,
    decisionReason,
    responseIntent,
    responseText,
    confidence: Number.isFinite(result.confidence) ? Math.max(0, Math.min(1, result.confidence)) : 0,
    parserVersion: DEFAULT_PARSER_VERSION,
    policyVersion: CONVERSATION_POLICY_VERSION,
    correlationId: deterministicCorrelationId(message),
    sourceMessageId: message.sourceMessageId,
    participantId: message.participantId,
    raceId: message.raceId || contextRace(result, message) || null,
    classifierIntent: result.intent,
    effectsAllowed: false,
    transportAction: 'NONE',
    audit
  };
}

function contextRace(result: IntentResult, message: ConversationMessage) {
  const raceNumber = result.entities?.raceNumber;
  return raceNumber == null ? message.raceId || null : String(raceNumber);
}

function monetaryRequiresClarification(result: IntentResult) {
  if (result.risk !== 'monetary') return false;
  if (['balance_snapshot', 'settlement_snapshot', 'plan_snapshot', 'pending_confirmation'].includes(result.intent)) return false;
  if (['cancel_or_correction'].includes(result.intent)) return true;
  const entities = result.entities || {};
  if (['offer_player', 'offer_receiver'].includes(result.intent)) {
    return !entities.play || !entities.horse || entities.amount == null || !Number.isFinite(Number(entities.amount));
  }
  return result.intent === 'betting_or_balance';
}

function clarificationFor(result: IntentResult) {
  const entities = result.entities || {};
  if (['offer_player', 'offer_receiver'].includes(result.intent)) {
    const missing: string[] = [];
    if (!entities.play) missing.push('tipo de jugada');
    if (!entities.horse) missing.push('caballo/selección');
    if (entities.amount == null || !Number.isFinite(Number(entities.amount))) missing.push('monto');
    return `Necesito aclarar ${missing.join(', ')} antes de continuar. No se registró ninguna operación.`;
  }
  if (result.intent === 'cancel_or_correction') {
    return 'Indica exactamente qué mensaje/jugada deseas corregir o cancelar. No se modificó ninguna operación.';
  }
  return 'El mensaje tiene contenido monetario ambiguo. Indica jugada, selección, monto y carrera cuando corresponda. No se registró nada.';
}

export function decideConversation(
  message: ConversationMessage,
  context: ConversationContext = {},
  classifier: (text: string) => IntentResult = classify
): ConversationDecision {
  const sourceMessageId = String(message.sourceMessageId || '').trim();
  const participantId = String(message.participantId || '').trim();
  if (!sourceMessageId || !participantId) {
    throw new Error('sourceMessageId y participantId son obligatorios para una decisión auditable.');
  }

  const normalizedMessage: ConversationMessage = {
    ...message,
    sourceMessageId,
    participantId,
    text: String(message.text || '').trim(),
    timestamp: String(message.timestamp || '')
  };
  const result = classifier(normalizedMessage.text);
  const seen = asSet(context.seenSourceMessageIds);
  const humanOwned = asSet(context.humanOwnedParticipantIds).has(canonicalParticipant(participantId));
  const duplicate = seen.has(sourceMessageId);
  const outOfOrder = isOutOfOrder(normalizedMessage, context);
  const monetaryOrStateful = result.risk === 'monetary' || ['race_close', 'day_close', 'race_result'].includes(result.intent);
  const audit = { duplicate, outOfOrder, humanOwned, monetaryOrStateful };

  if (duplicate) {
    return response(normalizedMessage, result, 'NO_RESPONSE', 'DUPLICATE_SOURCE_MESSAGE', 'NONE', null, audit);
  }

  if (humanOwned) {
    return response(normalizedMessage, result, 'NO_RESPONSE', 'HUMAN_OWNS_CONVERSATION', 'NONE', null, audit);
  }

  if (normalizedMessage.mediaKind && normalizedMessage.mediaKind !== 'none' && !normalizedMessage.text) {
    return response(normalizedMessage, result, 'ESCALATED', 'UNSUPPORTED_MEDIA_WITHOUT_TEXT', 'ESCALATED', 'El contenido requiere revisión de un operador.', audit);
  }

  if (outOfOrder && monetaryOrStateful) {
    return response(normalizedMessage, result, 'HELD_FOR_REVIEW', 'OUT_OF_ORDER_STATEFUL_MESSAGE', 'ESCALATED', 'Mensaje recibido fuera de orden. Queda retenido para revisión; no se registró ninguna operación.', audit);
  }

  const raceId = normalizedMessage.raceId || contextRace(result, normalizedMessage);
  if (raceId && asSet(context.closedRaceIds).has(String(raceId)) && monetaryOrStateful) {
    return response(normalizedMessage, result, 'REJECTED', 'RACE_ALREADY_CLOSED', 'REJECTED', 'La carrera indicada ya está cerrada. No se registró ninguna operación.', audit);
  }

  if (result.confidence < 0.75 && monetaryOrStateful) {
    return response(normalizedMessage, result, 'NEEDS_CLARIFICATION', 'LOW_CONFIDENCE_STATEFUL_MESSAGE', 'NEEDS_CLARIFICATION', 'No puedo determinar la intención con suficiente seguridad. Aclara la operación; no se registró nada.', audit);
  }

  if (monetaryRequiresClarification(result)) {
    return response(normalizedMessage, result, 'NEEDS_CLARIFICATION', 'MISSING_OR_AMBIGUOUS_MONETARY_FIELDS', 'NEEDS_CLARIFICATION', clarificationFor(result), audit);
  }

  if (['race_close', 'day_close', 'race_result', 'balance_snapshot', 'plan_snapshot', 'settlement_snapshot', 'pending_confirmation'].includes(result.intent)) {
    return response(normalizedMessage, result, 'HELD_FOR_REVIEW', 'STATEFUL_INTENT_REQUIRES_AUTHORITATIVE_REVIEW', 'ACK_RECEIVED', 'Mensaje recibido y clasificado para revisión. No se aplicó ningún cambio de estado ni saldo.', audit);
  }

  if (['empty'].includes(result.intent)) {
    return response(normalizedMessage, result, 'NO_RESPONSE', 'EMPTY_MESSAGE', 'NONE', null, audit);
  }

  if (result.risk === 'safe') {
    return response(normalizedMessage, result, 'ACK_RECEIVED', 'SAFE_INFORMATIONAL_INTENT', 'ACK_RECEIVED', result.suggestion || 'Mensaje recibido.', audit);
  }

  return response(normalizedMessage, result, 'HELD_FOR_REVIEW', 'REVIEW_REQUIRED_BY_CLASSIFIER', 'ACK_RECEIVED', 'Mensaje recibido para revisión. No se ejecutó ninguna operación.', audit);
}

export function nextConversationContext(context: ConversationContext, message: ConversationMessage, decision: ConversationDecision): ConversationContext {
  const seen = new Set(asSet(context.seenSourceMessageIds));
  seen.add(message.sourceMessageId);
  const lastTimestampByParticipant = { ...(context.lastTimestampByParticipant || {}) };
  const key = canonicalParticipant(message.participantId);
  const current = validTimestamp(message.timestamp);
  const previous = validTimestamp(lastTimestampByParticipant[key] || '');
  if (current !== null && (previous === null || current >= previous)) lastTimestampByParticipant[key] = message.timestamp;
  return { ...context, seenSourceMessageIds: seen, lastTimestampByParticipant };
}

export const __test__ = { deterministicCorrelationId, monetaryRequiresClarification, canonicalParticipant };
