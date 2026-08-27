export const RACE_STATE = Object.freeze({
  PREPARING: 'PREPARING',
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
  RESULT_RECEIVED: 'RESULT_RECEIVED',
  SETTLEMENT_READY: 'SETTLEMENT_READY',
  SETTLED: 'SETTLED',
  BALANCED: 'BALANCED',
  PUBLISHED: 'PUBLISHED',
  ARCHIVED: 'ARCHIVED'
});

export const DAY_STATE = Object.freeze({
  PREPARING: 'PREPARING',
  OPEN: 'OPEN',
  CLOSING: 'CLOSING',
  CLOSED: 'CLOSED',
  ARCHIVED: 'ARCHIVED'
});

export const DOMAIN_EVENT = Object.freeze({
  PLAN_RECORDED: 'PLAN_RECORDED',
  RACE_OPENED: 'RACE_OPENED',
  BET_RECORDED: 'BET_RECORDED',
  RACE_CLOSED: 'RACE_CLOSED',
  RESULT_RECORDED: 'RESULT_RECORDED',
  SETTLEMENT_READY: 'SETTLEMENT_READY',
  SETTLEMENT_RECORDED: 'SETTLEMENT_RECORDED',
  BALANCE_CONFIRMED: 'BALANCE_CONFIRMED',
  RACE_PUBLISHED: 'RACE_PUBLISHED',
  RACE_ARCHIVED: 'RACE_ARCHIVED',
  DAY_OPENED: 'DAY_OPENED',
  DAY_CLOSING: 'DAY_CLOSING',
  DAY_CLOSED: 'DAY_CLOSED',
  DAY_ARCHIVED: 'DAY_ARCHIVED',
  CORRECTION: 'CORRECTION',
  REVERSAL: 'REVERSAL',
  AMBIGUOUS: 'AMBIGUOUS',
  UNKNOWN: 'UNKNOWN'
});

export const EVENT_DISPOSITION = Object.freeze({
  APPLIED: 'APPLIED',
  EVIDENCE_ONLY: 'EVIDENCE_ONLY',
  DUPLICATE: 'DUPLICATE',
  REVIEW: 'REVIEW',
  REJECTED: 'REJECTED'
});

const RACE_TRANSITIONS = Object.freeze({
  [RACE_STATE.PREPARING]: new Set([RACE_STATE.OPEN, RACE_STATE.CLOSED]),
  [RACE_STATE.OPEN]: new Set([RACE_STATE.CLOSED]),
  [RACE_STATE.CLOSED]: new Set([RACE_STATE.RESULT_RECEIVED]),
  [RACE_STATE.RESULT_RECEIVED]: new Set([RACE_STATE.SETTLEMENT_READY]),
  [RACE_STATE.SETTLEMENT_READY]: new Set([RACE_STATE.SETTLED]),
  [RACE_STATE.SETTLED]: new Set([RACE_STATE.BALANCED, RACE_STATE.PUBLISHED]),
  [RACE_STATE.BALANCED]: new Set([RACE_STATE.PUBLISHED]),
  [RACE_STATE.PUBLISHED]: new Set([RACE_STATE.ARCHIVED]),
  [RACE_STATE.ARCHIVED]: new Set()
});

const DAY_TRANSITIONS = Object.freeze({
  [DAY_STATE.PREPARING]: new Set([DAY_STATE.OPEN]),
  [DAY_STATE.OPEN]: new Set([DAY_STATE.CLOSING]),
  [DAY_STATE.CLOSING]: new Set([DAY_STATE.CLOSED]),
  [DAY_STATE.CLOSED]: new Set([DAY_STATE.ARCHIVED]),
  [DAY_STATE.ARCHIVED]: new Set()
});

const RACE_EVENT_TARGET = Object.freeze({
  [DOMAIN_EVENT.PLAN_RECORDED]: RACE_STATE.OPEN,
  [DOMAIN_EVENT.RACE_OPENED]: RACE_STATE.OPEN,
  [DOMAIN_EVENT.RACE_CLOSED]: RACE_STATE.CLOSED,
  [DOMAIN_EVENT.RESULT_RECORDED]: RACE_STATE.RESULT_RECEIVED,
  [DOMAIN_EVENT.SETTLEMENT_READY]: RACE_STATE.SETTLEMENT_READY,
  [DOMAIN_EVENT.SETTLEMENT_RECORDED]: RACE_STATE.SETTLED,
  [DOMAIN_EVENT.BALANCE_CONFIRMED]: RACE_STATE.BALANCED,
  [DOMAIN_EVENT.RACE_PUBLISHED]: RACE_STATE.PUBLISHED,
  [DOMAIN_EVENT.RACE_ARCHIVED]: RACE_STATE.ARCHIVED
});

const DAY_EVENT_TARGET = Object.freeze({
  [DOMAIN_EVENT.DAY_OPENED]: DAY_STATE.OPEN,
  [DOMAIN_EVENT.DAY_CLOSING]: DAY_STATE.CLOSING,
  [DOMAIN_EVENT.DAY_CLOSED]: DAY_STATE.CLOSED,
  [DOMAIN_EVENT.DAY_ARCHIVED]: DAY_STATE.ARCHIVED
});

const EVIDENCE_ONLY_EVENTS = new Set([
  DOMAIN_EVENT.BET_RECORDED,
  DOMAIN_EVENT.CORRECTION,
  DOMAIN_EVENT.REVERSAL
]);

function nowIso(value) {
  const date = value ? new Date(value) : new Date();
  if (!Number.isFinite(date.getTime())) throw new Error('INVALID_EVENT_TIMESTAMP');
  return date.toISOString();
}

function normalizedAggregate(state, kind) {
  const fallback = kind === 'day' ? DAY_STATE.PREPARING : RACE_STATE.PREPARING;
  return {
    ...(state || {}),
    kind,
    status: state?.status || fallback,
    stateVersion: Number(state?.stateVersion || 0),
    eventJournal: Array.isArray(state?.eventJournal) ? [...state.eventJournal] : [],
    reviewQueue: Array.isArray(state?.reviewQueue) ? [...state.reviewQueue] : []
  };
}

function eventIdentity(event = {}) {
  const sourceMessageKey = String(event.sourceMessageKey || '').trim();
  const eventId = String(event.eventId || '').trim();
  if (sourceMessageKey) return `source:${sourceMessageKey}`;
  if (eventId) return `event:${eventId}`;
  throw new Error('EVENT_IDENTITY_REQUIRED');
}

function hasIdentity(state, identity) {
  return state.eventJournal.some((entry) => entry.identity === identity);
}

function journalEntry(event, identity, disposition, extra = {}) {
  const recordedAt = nowIso(event.recordedAt || event.timestamp);
  return Object.freeze({
    eventId: String(event.eventId || identity),
    identity,
    type: String(event.type || DOMAIN_EVENT.UNKNOWN),
    sourceMessageKey: event.sourceMessageKey ? String(event.sourceMessageKey) : null,
    source: event.source || 'system',
    actor: event.actor || null,
    parserVersion: event.parserVersion || null,
    schemaVersion: Number(event.schemaVersion || 1),
    recordedAt,
    payload: event.payload == null ? null : structuredClone(event.payload),
    disposition,
    ...extra
  });
}

function enqueueReview(state, entry, reason) {
  return {
    ...state,
    eventJournal: [...state.eventJournal, entry],
    reviewQueue: [...state.reviewQueue, Object.freeze({
      eventId: entry.eventId,
      identity: entry.identity,
      type: entry.type,
      reason,
      queuedAt: entry.recordedAt
    })]
  };
}

export function canTransition(from, to) {
  return Boolean(RACE_TRANSITIONS[from]?.has(to));
}

export function canTransitionDay(from, to) {
  return Boolean(DAY_TRANSITIONS[from]?.has(to));
}

export function transitionRace(state, to, evidence = {}) {
  const aggregate = normalizedAggregate(state, 'race');
  const from = aggregate.status;
  if (from === to) return aggregate;
  if (!canTransition(from, to)) {
    return {
      ...aggregate,
      rejectedTransition: { from, to, reason: 'INVALID_TRANSITION', evidence }
    };
  }
  return {
    ...aggregate,
    status: to,
    stateVersion: aggregate.stateVersion + 1,
    lastTransitionAt: nowIso(evidence.timestamp),
    lastTransitionSource: evidence.source || 'system',
    rejectedTransition: undefined
  };
}

export function transitionDay(state, to, evidence = {}) {
  const aggregate = normalizedAggregate(state, 'day');
  const from = aggregate.status;
  if (from === to) return aggregate;
  if (!canTransitionDay(from, to)) {
    return {
      ...aggregate,
      rejectedTransition: { from, to, reason: 'INVALID_TRANSITION', evidence }
    };
  }
  return {
    ...aggregate,
    status: to,
    stateVersion: aggregate.stateVersion + 1,
    lastTransitionAt: nowIso(evidence.timestamp),
    lastTransitionSource: evidence.source || 'system',
    rejectedTransition: undefined
  };
}

function validateCorrectionReference(state, event) {
  const originalEventId = String(event.originalEventId || event.payload?.originalEventId || '').trim();
  if (!originalEventId) return { ok: false, reason: 'ORIGINAL_EVENT_REQUIRED' };
  const original = state.eventJournal.find((entry) => entry.eventId === originalEventId || entry.identity === originalEventId);
  if (!original) return { ok: false, reason: 'ORIGINAL_EVENT_NOT_FOUND' };
  if (event.type === DOMAIN_EVENT.REVERSAL && state.eventJournal.some((entry) => entry.type === DOMAIN_EVENT.REVERSAL && entry.originalEventId === original.eventId && entry.disposition === EVENT_DISPOSITION.EVIDENCE_ONLY)) {
    return { ok: false, reason: 'ALREADY_REVERSED' };
  }
  return { ok: true, original };
}

/**
 * Applies one domain event without rewriting history.
 * Unknown/ambiguous/out-of-order events are journaled and queued for review;
 * they never mutate the authoritative status.
 */
export function applyDomainEvent(state, event, options = {}) {
  const kind = options.kind || state?.kind || (DAY_EVENT_TARGET[event?.type] ? 'day' : 'race');
  const aggregate = normalizedAggregate(state, kind);
  const identity = eventIdentity(event);

  if (hasIdentity(aggregate, identity)) {
    return { state: aggregate, disposition: EVENT_DISPOSITION.DUPLICATE, duplicate: true };
  }

  const type = String(event?.type || DOMAIN_EVENT.UNKNOWN);
  if (type === DOMAIN_EVENT.UNKNOWN || type === DOMAIN_EVENT.AMBIGUOUS || event?.confidence === 'ambiguous' || event?.requiresReview === true) {
    const entry = journalEntry(event, identity, EVENT_DISPOSITION.REVIEW, { reason: 'AMBIGUOUS_OR_UNKNOWN' });
    return {
      state: enqueueReview(aggregate, entry, 'AMBIGUOUS_OR_UNKNOWN'),
      disposition: EVENT_DISPOSITION.REVIEW,
      duplicate: false
    };
  }

  if (type === DOMAIN_EVENT.CORRECTION || type === DOMAIN_EVENT.REVERSAL) {
    const reference = validateCorrectionReference(aggregate, event);
    if (!reference.ok) {
      const entry = journalEntry(event, identity, EVENT_DISPOSITION.REVIEW, { reason: reference.reason });
      return { state: enqueueReview(aggregate, entry, reference.reason), disposition: EVENT_DISPOSITION.REVIEW, duplicate: false };
    }
    const entry = journalEntry(event, identity, EVENT_DISPOSITION.EVIDENCE_ONLY, {
      originalEventId: reference.original.eventId,
      correctionKind: type
    });
    return {
      state: { ...aggregate, eventJournal: [...aggregate.eventJournal, entry] },
      disposition: EVENT_DISPOSITION.EVIDENCE_ONLY,
      duplicate: false
    };
  }

  if (EVIDENCE_ONLY_EVENTS.has(type)) {
    const entry = journalEntry(event, identity, EVENT_DISPOSITION.EVIDENCE_ONLY);
    return {
      state: { ...aggregate, eventJournal: [...aggregate.eventJournal, entry] },
      disposition: EVENT_DISPOSITION.EVIDENCE_ONLY,
      duplicate: false
    };
  }

  const target = kind === 'day' ? DAY_EVENT_TARGET[type] : RACE_EVENT_TARGET[type];
  if (!target) {
    const entry = journalEntry(event, identity, EVENT_DISPOSITION.REVIEW, { reason: 'EVENT_NOT_VALID_FOR_AGGREGATE' });
    return { state: enqueueReview(aggregate, entry, 'EVENT_NOT_VALID_FOR_AGGREGATE'), disposition: EVENT_DISPOSITION.REVIEW, duplicate: false };
  }

  const from = aggregate.status;
  if (from === target) {
    const entry = journalEntry(event, identity, EVENT_DISPOSITION.EVIDENCE_ONLY, { from, to: target, reason: 'SAME_STATE_EVIDENCE' });
    return { state: { ...aggregate, eventJournal: [...aggregate.eventJournal, entry] }, disposition: EVENT_DISPOSITION.EVIDENCE_ONLY, duplicate: false };
  }

  const allowed = kind === 'day' ? canTransitionDay(from, target) : canTransition(from, target);
  if (!allowed) {
    const entry = journalEntry(event, identity, EVENT_DISPOSITION.REJECTED, { from, to: target, reason: 'OUT_OF_ORDER_OR_INVALID_TRANSITION' });
    return {
      state: enqueueReview(aggregate, entry, 'OUT_OF_ORDER_OR_INVALID_TRANSITION'),
      disposition: EVENT_DISPOSITION.REJECTED,
      duplicate: false
    };
  }

  const entry = journalEntry(event, identity, EVENT_DISPOSITION.APPLIED, { from, to: target });
  return {
    state: {
      ...aggregate,
      status: target,
      stateVersion: aggregate.stateVersion + 1,
      lastTransitionAt: entry.recordedAt,
      lastTransitionSource: entry.source,
      eventJournal: [...aggregate.eventJournal, entry],
      rejectedTransition: undefined
    },
    disposition: EVENT_DISPOSITION.APPLIED,
    duplicate: false
  };
}

export function replayDomainEvents(events = [], options = {}) {
  let state = normalizedAggregate(options.initialState, options.kind || 'race');
  const outcomes = [];
  for (const event of events) {
    const outcome = applyDomainEvent(state, event, options);
    state = outcome.state;
    outcomes.push({ identity: (() => { try { return eventIdentity(event); } catch { return null; } })(), disposition: outcome.disposition });
  }
  return { state, outcomes };
}

export function classifyTemporalEligibility(race, messageTimestamp) {
  if (!race?.closedAt) return { eligible: true, reason: 'OPEN_WINDOW' };
  const message = new Date(messageTimestamp || 0).getTime();
  const close = new Date(race.closedAt).getTime();
  if (!Number.isFinite(message) || !Number.isFinite(close)) return { eligible: false, reason: 'TIME_UNKNOWN' };
  return message <= close ? { eligible: true, reason: 'BEFORE_CLOSE' } : { eligible: false, reason: 'AFTER_CLOSE' };
}
