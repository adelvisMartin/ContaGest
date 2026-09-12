import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compareMatchToActiveRace,
  enrichOperationalRaceContext
} from '../frontend/public/hipico-control/assets/js/whatsapp/race-context.js';

function offer(id, messageId, overrides = {}) {
  return {
    id,
    messageId,
    segmentId: 1,
    duplicate: false,
    track: '',
    raceNumber: null,
    reviewReasons: [],
    requiresApproval: false,
    needsReview: false,
    ...overrides
  };
}

function message(id, raceContext = {}, overrides = {}) {
  return {
    id,
    segmentId: 1,
    raceContext: {
      track: '',
      raceNumber: null,
      actionable: false,
      ...raceContext
    },
    ...overrides
  };
}

test('offers inherit only the nearest actionable opening from the same segment', () => {
  const opening = message('open-1', {
    track: 'Churchill Downs',
    raceNumber: 3,
    actionable: true
  }, { type: 'race-open' });
  const playerMessage = message('player-message');
  const receiverMessage = message('receiver-message');
  const player = offer('player-offer', playerMessage.id);
  const receiver = offer('receiver-offer', receiverMessage.id);
  const analysis = {
    messages: [opening, playerMessage, receiverMessage],
    raceOpenings: [opening],
    offers: [player, receiver],
    matches: [{
      id: 'match-1',
      playerOfferIds: [player.id],
      receiverOfferIds: [receiver.id],
      reviewReasons: []
    }],
    stats: {}
  };

  const enriched = enrichOperationalRaceContext(analysis);

  assert.equal(enriched.matches.length, 1);
  assert.deepEqual(enriched.matches[0].raceContext, {
    track: 'Churchill Downs',
    raceNumber: 3,
    complete: true,
    source: 'both'
  });
  assert.equal(enriched.matches[0].requiresApproval, false);
  assert.equal(enriched.unmatched.length, 0);
});

test('opening from another segment is never inherited', () => {
  const opening = message('open-1', {
    track: 'Churchill Downs',
    raceNumber: 3,
    actionable: true
  }, { type: 'race-open', segmentId: 1 });
  const playerMessage = message('player-message', {}, { segmentId: 2 });
  const player = offer('player-offer', playerMessage.id, { segmentId: 2 });
  const analysis = {
    messages: [opening, playerMessage],
    raceOpenings: [opening],
    offers: [player],
    matches: [],
    stats: {}
  };

  const enriched = enrichOperationalRaceContext(analysis);

  assert.equal(enriched.offers[0].raceContext.complete, false);
  assert.equal(enriched.offers[0].requiresApproval, true);
  assert.ok(enriched.offers[0].reviewReasons.includes('contexto de carrera incompleto'));
});

test('direct race context that contradicts the active opening is flagged fail-closed', () => {
  const opening = message('open-1', {
    track: 'Churchill Downs',
    raceNumber: 3,
    actionable: true
  }, { type: 'race-open' });
  const playerMessage = message('player-message', {
    track: 'Churchill Downs',
    raceNumber: 4,
    actionable: true
  });
  const player = offer('player-offer', playerMessage.id);
  const analysis = {
    messages: [opening, playerMessage],
    raceOpenings: [opening],
    offers: [player],
    matches: [],
    stats: {}
  };

  const enriched = enrichOperationalRaceContext(analysis);

  assert.equal(enriched.offers[0].raceContext.conflict, true);
  assert.equal(enriched.offers[0].requiresApproval, true);
  assert.ok(enriched.offers[0].reviewReasons.includes('contexto de carrera contradictorio'));
});

test('a proposed pair spanning two different races is rejected instead of imported', () => {
  const playerMessage = message('player-message', {
    track: 'Churchill Downs',
    raceNumber: 3,
    actionable: true
  });
  const receiverMessage = message('receiver-message', {
    track: 'Churchill Downs',
    raceNumber: 4,
    actionable: true
  });
  const player = offer('player-offer', playerMessage.id);
  const receiver = offer('receiver-offer', receiverMessage.id);
  const analysis = {
    messages: [playerMessage, receiverMessage],
    raceOpenings: [],
    offers: [player, receiver],
    matches: [{
      id: 'match-cross-race',
      playerOfferIds: [player.id],
      receiverOfferIds: [receiver.id],
      reviewReasons: []
    }],
    stats: {}
  };

  const enriched = enrichOperationalRaceContext(analysis);

  assert.equal(enriched.matches.length, 0);
  assert.equal(enriched.unmatched.length, 2);
  assert.equal(enriched.stats.raceContextRejected, 2);
  assert.ok(enriched.unmatched.every((item) => item.reviewReasons.includes('oferta incompatible con contraparte de otra carrera')));
});

test('active-race comparison requires both track and race number', () => {
  const match = {
    raceContext: {
      track: 'Churchill Down',
      raceNumber: 3,
      complete: true
    }
  };

  assert.equal(compareMatchToActiveRace(match, { racetrack: 'Churchill Downs', number: 3 }).status, 'MATCH');
  assert.equal(compareMatchToActiveRace(match, { racetrack: 'Churchill Downs', number: 4 }).status, 'MISMATCH');
  assert.equal(compareMatchToActiveRace(match, { racetrack: 'Colonial Downs', number: 3 }).status, 'MISMATCH');
  assert.equal(compareMatchToActiveRace({ raceContext: { complete: false } }, { racetrack: 'Churchill Downs', number: 3 }).status, 'AMBIGUOUS');
  assert.equal(compareMatchToActiveRace(match, null).status, 'NO_ACTIVE_RACE');
});
