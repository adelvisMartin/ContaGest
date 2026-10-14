import test from 'node:test';
import assert from 'node:assert/strict';
import {parseLabRaceSlotReply,validLabTrack} from '../src/lab-race-slots.mjs';
import {resolveLabRaceClarification} from '../src/lab-conversation-context.mjs';

const prior={raceNumber:5};
const safe={intent:'conversation',risk:'safe'};

test('legitimate full ISO date and venue clarification remains supported',()=>{
  const race=parseLabRaceSlotReply('La Rinconada el 2026-10-12',prior);
  assert.deepEqual(race,{
    raceNumber:5,racetrack:'La Rinconada',raceDate:'2026-10-12',complete:true
  });
  assert.deepEqual(resolveLabRaceClarification('Hipódromo La Rinconada fecha 2026-10-12',prior,safe),{
    raceNumber:5,racetrack:'La Rinconada',raceDate:'2026-10-12'
  });
  assert.equal(validLabTrack('La Rinconada'),'La Rinconada');
});

test('date embedded inside a purported track-only reply cannot become a racetrack name',()=>{
  for(const malicious of [
    'La Rinconada el 2026-10-12 y visita',
    'La Rinconada el 2026-10-12 y paga',
    'En hipódromo La Rinconada fecha 2026-10-12 y consulta',
    'El Hipódromo 2026-10-12',
    'Las Pistas 2026-10-12'
  ]){
    assert.equal(parseLabRaceSlotReply(malicious,prior),null,malicious);
    assert.equal(resolveLabRaceClarification(malicious,prior,safe),null,malicious);
  }
});

test('payment verbs and financial instructions never fill a missing track slot',()=>{
  for(const malicious of [
    'La Rinconada y paga',
    'La Rinconada y pagas',
    'La Rinconada y pagan',
    'La Rinconada y cobra',
    'La Rinconada y cobran',
    'Hipódromo La Rinconada y paga',
    'En La Rinconada y cobra'
  ]){
    assert.equal(parseLabRaceSlotReply(malicious,prior),null,malicious);
    assert.equal(resolveLabRaceClarification(malicious,prior,safe),null,malicious);
  }
});

test('other preexisting fail-closed cases and unsupported calendar dates remain rejected',()=>{
  const priorWithScope={raceNumber:5,raceScope:{
    raceNumber:5,racetrack:'La Rinconada',raceDate:'2026-10-12'
  }};
  assert.equal(parseLabRaceSlotReply('La Rinconada el 2026-10-12',priorWithScope),null);
  for(const invalid of ['La Rinconada el 2026-02-30','La Rinconada el 2026-10-12; cambio saldo']){
    assert.equal(parseLabRaceSlotReply(invalid,prior),null);
  }
  assert.equal(resolveLabRaceClarification('La Rinconada el 2026-10-12',prior,{intent:'offer_player',risk:'monetary'}),null);
});

test('a date-only clarification remains allowed if another safe sender-scoped hint supplies the track',()=>{
  assert.deepEqual(parseLabRaceSlotReply('fecha 2026-10-12',{
    raceNumber:5,raceTrack:'La Rinconada'
  }),{
    raceNumber:5,raceDate:'2026-10-12',racetrack:'La Rinconada',complete:true
  });
});
