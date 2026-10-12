import { parseWhatsAppPre } from './runtime-utils.mjs';

// Adapter only. All authorization, conversation/risk rules and domain state live in the backend.
// Incoming LAB chat is shadow evidence; this module never builds a domain command.
export function labCanonicalEvent(row, config, now = () => new Date()) {
  if (!row?.id || row.fromMe || row.hasMedia || !String(row.text || '').trim()) {
    return { eligible: false, reason: 'LAB_MESSAGE_NOT_TEXT_INPUT' };
  }
  const groupId = String(config?.labGroupId || '').trim().toLowerCase();
  const channelKey = String(config?.labChannelKey || '').trim();
  const sourceId = String(config?.sourceGroupId || '').trim().toLowerCase();
  if (!/^[0-9]+@g\.us$/.test(groupId) || groupId === sourceId || !channelKey) {
    return { eligible: false, reason: 'LAB_IDENTITY_UNAVAILABLE' };
  }
  const parsed = parseWhatsAppPre(row.pre, now());
  const sender = String(parsed.senderLabel || '').trim();
  if (!sender || sender.toLowerCase() === 'unknown') {
    return { eligible: false, reason: 'LAB_SENDER_UNVERIFIED' };
  }
  return {
    eligible: true,
    event: {
      bridgeVersion: String(config.bridgeVersion || 'playwright-lab-v1'),
      externalMessageId: String(row.id).slice(0, 320),
      groupId,
      groupName: String(config.labGroupName || '').slice(0, 220),
      channelKey,
      labChannelKey: channelKey,
      channelRole: 'lab',
      shadowMode: true,
      historySync: false,
      senderId: sender.slice(0, 220),
      senderLabel: sender.slice(0, 220),
      fromMe: false,
      timestamp: parsed.timestamp,
      type: 'chat',
      mediaKind: 'none',
      text: String(row.text).slice(0, 4000),
      hasMedia: false,
      quotedExternalMessageId: row.quotedId ? String(row.quotedId).slice(0, 320) : null,
      rawMeta: ''
    }
  };
}

// Return a typed plan, never treat a plain message string as delivery authorization.
// Even an authorized plan is sent ONLY by the existing pinned LAB + durable ACK journal.
export function selectCanonicalLabReply(response, localClassification) {
  if (response?.ok !== true || !response?.conversationDecision || !response?.responsePlan || !response?.data) {
    return { kind: 'BLOCKED', reason: 'LAB_CANONICAL_CONTRACT_INVALID', text: null };
  }
  const decision = response.conversationDecision;
  const plan = response.responsePlan;
  if (response.duplicate === true || decision.decision === 'NO_RESPONSE' ||
      plan.intent === 'NONE' || plan.handoffRequired || !plan.canSend || !plan.text) {
    return { kind: 'NO_RESPONSE', reason: String(plan.reason || decision.decisionReason || 'NO_RESPONSE'), text: null };
  }
  if (decision.effectsAllowed !== false || decision.transportAction !== 'NONE' || plan.confirmationVerified === true) {
    return { kind: 'BLOCKED', reason: 'LAB_DOMAIN_AUTHORITY_VIOLATION', text: null };
  }
  const remoteRisk = String(response.data.risk || '');
  const localRisk = String(localClassification?.risk || '');
  if (!['safe','monetary','review'].includes(remoteRisk) || !['safe','monetary','review'].includes(localRisk)) {
    return { kind: 'BLOCKED', reason: 'LAB_UNKNOWN_RISK', text: null };
  }
  // Risk disagreement cannot accidentally turn an offer into an automatic success reply.
  if (remoteRisk !== 'safe' || localRisk !== 'safe') {
    if (!['NEEDS_CLARIFICATION','HELD_FOR_REVIEW','REJECTED','ESCALATED'].includes(decision.decision)) {
      return { kind: 'BLOCKED', reason: 'LAB_UNSAFE_RESPONSE_INTENT', text: null };
    }
    if (plan.intent === 'CONFIRMED') {
      return { kind: 'BLOCKED', reason: 'LAB_MONETARY_CONFIRMATION_FORBIDDEN', text: null };
    }
  }
  const text = String(plan.text).trim();
  if (!text || text.length > 3000) return { kind: 'BLOCKED', reason: 'LAB_RESPONSE_LENGTH_INVALID', text: null };
  return { kind: 'SEND_LAB', reason: String(plan.reason || decision.decisionReason || 'CANONICAL_SHADOW'), text };
}
