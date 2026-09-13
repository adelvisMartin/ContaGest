import test from 'node:test';
import assert from 'node:assert/strict';
import {
  componentState,
  hipicoError,
  hipicoNormalizedMessageSchema,
  normalizedRaceDate,
  operationalRaceContextKey
} from './hipico-domain.js';

void test('canonical error envelope is bounded and stable', () => {
  assert.deepEqual(hipicoError({
    code: 'RACE_CONTEXT_AMBIGUOUS',
    message: 'La carrera no se pudo resolver.',
    requestId: 'req-12345678'
  }), {
    ok: false,
    code: 'RACE_CONTEXT_AMBIGUOUS',
    message: 'La carrera no se pudo resolver.',
    requestId: 'req-12345678',
    retryable: false
  });
});

void test('component state accepts explicit readiness values only', () => {
  assert.deepEqual(componentState('not_configured', 'DOCUMENT_ENGINE_NOT_INSTALLED'), {
    state: 'not_configured',
    reason: 'DOCUMENT_ENGINE_NOT_INSTALLED'
  });
});

void test('normalized channel message contract is strict and deterministic', () => {
  const parsed = hipicoNormalizedMessageSchema.parse({
    channel: 'test',
    groupId: '120363111111111111@g.us',
    externalMessageId: 'm-1',
    senderId: 'p-1',
    sentAt: '2026-09-12T12:00:00.000Z',
    type: 'chat',
    text: 'hola',
    historySync: false,
    fromMe: false,
    hasMedia: false,
    mediaKind: 'none'
  });
  assert.equal(parsed.externalMessageId, 'm-1');
  assert.throws(() => hipicoNormalizedMessageSchema.parse({ ...parsed, unexpected: true }));
});

void test('race context validation rejects invalid calendar dates and produces stable keys', () => {
  assert.equal(normalizedRaceDate('2026-02-29'), undefined);
  assert.equal(normalizedRaceDate('2028-02-29'), '2028-02-29');
  assert.equal(
    operationalRaceContextKey({ racetrack: 'La Rinconada', raceNumber: 4, raceDate: '2026-09-12' }),
    operationalRaceContextKey({ racetrack: 'LA RINCONADA', raceNumber: 4, raceDate: '2026-09-12' })
  );
  assert.equal(operationalRaceContextKey({ racetrack: 'La Rinconada', raceNumber: 0, raceDate: '2026-09-12' }), null);
});
