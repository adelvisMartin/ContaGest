import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RACE_STATE, DAY_STATE, DOMAIN_EVENT, EVENT_DISPOSITION,
  applyDomainEvent, replayDomainEvents, transitionRace
} from '../frontend/public/hipico-control/assets/js/race-state-machine.js';

const event = (type, key, extra = {}) => ({
  eventId: `evt-${key}`,
  sourceMessageKey: key,
  type,
  timestamp: '2026-08-27T12:00:00.000Z',
  parserVersion: 'test',
  schemaVersion: 1,
  ...extra
});

test('race lifecycle accepts only documented forward transitions', () => {
  const events = [
    event(DOMAIN_EVENT.PLAN_RECORDED, 'plan'),
    event(DOMAIN_EVENT.RACE_CLOSED, 'close'),
    event(DOMAIN_EVENT.RESULT_RECORDED, 'result'),
    event(DOMAIN_EVENT.SETTLEMENT_READY, 'settlement-ready'),
    event(DOMAIN_EVENT.SETTLEMENT_RECORDED, 'settlement'),
    event(DOMAIN_EVENT.BALANCE_CONFIRMED, 'balance'),
    event(DOMAIN_EVENT.RACE_PUBLISHED, 'publish'),
    event(DOMAIN_EVENT.RACE_ARCHIVED, 'archive')
  ];
  const { state, outcomes } = replayDomainEvents(events, { kind: 'race' });
  assert.equal(state.status, RACE_STATE.ARCHIVED);
  assert.equal(state.stateVersion, 8);
  assert.equal(state.eventJournal.length, 8);
  assert.ok(outcomes.every((item) => item.disposition === EVENT_DISPOSITION.APPLIED));
});

test('duplicate source message is idempotent and does not append or increment', () => {
  const first = applyDomainEvent(null, event(DOMAIN_EVENT.PLAN_RECORDED, 'same'), { kind: 'race' });
  const duplicate = applyDomainEvent(first.state, event(DOMAIN_EVENT.PLAN_RECORDED, 'same'), { kind: 'race' });
  assert.equal(duplicate.disposition, EVENT_DISPOSITION.DUPLICATE);
  assert.equal(duplicate.state.stateVersion, 1);
  assert.equal(duplicate.state.eventJournal.length, 1);
});

test('out-of-order result before plan is retained as evidence but cannot corrupt status', () => {
  const result = applyDomainEvent(null, event(DOMAIN_EVENT.RESULT_RECORDED, 'late-result'), { kind: 'race' });
  assert.equal(result.state.status, RACE_STATE.PREPARING);
  assert.equal(result.disposition, EVENT_DISPOSITION.REJECTED);
  assert.equal(result.state.eventJournal.length, 1);
  assert.equal(result.state.reviewQueue.length, 1);
  assert.equal(result.state.stateVersion, 0);
});

test('ambiguous message is queued for human review and never auto-commits', () => {
  const opened = applyDomainEvent(null, event(DOMAIN_EVENT.PLAN_RECORDED, 'plan-a'), { kind: 'race' }).state;
  const ambiguous = applyDomainEvent(opened, event(DOMAIN_EVENT.AMBIGUOUS, 'ambiguous', { payload: { text: '?? llegada quizá 1y2' } }), { kind: 'race' });
  assert.equal(ambiguous.state.status, RACE_STATE.OPEN);
  assert.equal(ambiguous.state.stateVersion, 1);
  assert.equal(ambiguous.disposition, EVENT_DISPOSITION.REVIEW);
  assert.equal(ambiguous.state.reviewQueue.length, 1);
});

test('correction and reversal append evidence and reference the original event', () => {
  let state = applyDomainEvent(null, event(DOMAIN_EVENT.PLAN_RECORDED, 'plan-b'), { kind: 'race' }).state;
  state = applyDomainEvent(state, event(DOMAIN_EVENT.BET_RECORDED, 'bet-1', { payload: { amountMinor: '6000000' } }), { kind: 'race' }).state;
  const original = state.eventJournal.at(-1);
  const correction = applyDomainEvent(state, event(DOMAIN_EVENT.CORRECTION, 'correction-1', { originalEventId: original.eventId, payload: { reason: 'operator_review' } }), { kind: 'race' });
  assert.equal(correction.disposition, EVENT_DISPOSITION.EVIDENCE_ONLY);
  assert.equal(correction.state.eventJournal.at(-1).originalEventId, original.eventId);
  const reversal = applyDomainEvent(correction.state, event(DOMAIN_EVENT.REVERSAL, 'reversal-1', { originalEventId: original.eventId }), { kind: 'race' });
  assert.equal(reversal.state.eventJournal.at(-1).originalEventId, original.eventId);
  const doubleReverse = applyDomainEvent(reversal.state, event(DOMAIN_EVENT.REVERSAL, 'reversal-2', { originalEventId: original.eventId }), { kind: 'race' });
  assert.equal(doubleReverse.disposition, EVENT_DISPOSITION.REVIEW);
  assert.equal(doubleReverse.state.reviewQueue.at(-1).reason, 'ALREADY_REVERSED');
});

test('day lifecycle is independent from race lifecycle', () => {
  const { state } = replayDomainEvents([
    event(DOMAIN_EVENT.DAY_OPENED, 'day-open'),
    event(DOMAIN_EVENT.DAY_CLOSING, 'day-closing'),
    event(DOMAIN_EVENT.DAY_CLOSED, 'day-close'),
    event(DOMAIN_EVENT.DAY_ARCHIVED, 'day-archive')
  ], { kind: 'day' });
  assert.equal(state.status, DAY_STATE.ARCHIVED);
  assert.equal(state.stateVersion, 4);
});

test('legacy transitionRace remains backward compatible and fail-closed', () => {
  const invalid = transitionRace({ status: RACE_STATE.OPEN }, RACE_STATE.SETTLED, { source: 'test', timestamp: '2026-08-27T12:00:00Z' });
  assert.equal(invalid.status, RACE_STATE.OPEN);
  assert.equal(invalid.rejectedTransition.reason, 'INVALID_TRANSITION');
});
