import test from 'node:test';
import assert from 'node:assert/strict';
import { initialHipicoState, reduceHipicoDomainEvent, mapOperationalIntentToDomainEvent } from './hipico-domain-state.js';

const event=(type:any,key:string,extra:Record<string,unknown>={})=>({
  type,sourceMessageKey:key,timestamp:'2026-08-27T12:00:00.000Z',...extra
});

test('backend race reducer rejects result before open/close',()=>{
  const start=initialHipicoState('race');
  const result=reduceHipicoDomainEvent(start,event('RESULT_RECORDED','m-result'));
  assert.equal(result.disposition,'rejected');
  assert.equal(result.state.status,'PREPARING');
  assert.equal(result.state.stateVersion,0);
});

test('backend race reducer applies valid ordered lifecycle',()=>{
  let state=initialHipicoState('race');
  for(const [type,key] of [
    ['PLAN_RECORDED','plan'],['RACE_CLOSED','close'],['RESULT_RECORDED','result'],
    ['SETTLEMENT_READY','ready'],['SETTLEMENT_RECORDED','settle'],['BALANCE_CONFIRMED','balance'],
    ['RACE_PUBLISHED','publish'],['RACE_ARCHIVED','archive']
  ] as const){
    const outcome=reduceHipicoDomainEvent(state,event(type,key));
    assert.equal(outcome.disposition,'applied');
    state=outcome.state;
  }
  assert.equal(state.status,'ARCHIVED');
  assert.equal(state.stateVersion,8);
});

test('explicit approved race opening maps to RACE_OPENED but review-gated evidence cannot advance state',()=>{
  assert.equal(mapOperationalIntentToDomainEvent('race_open'),'RACE_OPENED');

  const reviewOnly=reduceHipicoDomainEvent(
    initialHipicoState('race'),
    event('RACE_OPENED','open-review',{requiresReview:true})
  );
  assert.equal(reviewOnly.disposition,'review');
  assert.equal(reviewOnly.state.status,'PREPARING');
  assert.equal(reviewOnly.state.stateVersion,0);

  const approved=reduceHipicoDomainEvent(
    initialHipicoState('race'),
    event('RACE_OPENED','open-approved',{requiresReview:false})
  );
  assert.equal(approved.disposition,'applied');
  assert.equal(approved.state.status,'OPEN');
  assert.equal(approved.state.stateVersion,1);
});

test('duplicate source message is side-effect free',()=>{
  let state=initialHipicoState('race');
  state=reduceHipicoDomainEvent(state,event('PLAN_RECORDED','same')).state;
  const duplicate=reduceHipicoDomainEvent(state,event('PLAN_RECORDED','same'));
  assert.equal(duplicate.disposition,'duplicate');
  assert.equal(duplicate.state.stateVersion,1);
  assert.equal(duplicate.state.status,'OPEN');
});

test('unknown and ambiguous evidence never advances state',()=>{
  for(const type of ['UNKNOWN','AMBIGUOUS'] as const){
    const outcome=reduceHipicoDomainEvent(initialHipicoState('race'),event(type,`m-${type}`));
    assert.equal(outcome.disposition,'review');
    assert.equal(outcome.state.status,'PREPARING');
  }
});

test('day close cannot skip OPEN/CLOSING',()=>{
  const outcome=reduceHipicoDomainEvent(initialHipicoState('day'),event('DAY_CLOSED','close-day'));
  assert.equal(outcome.disposition,'rejected');
  assert.equal(outcome.state.status,'PREPARING');
});

test('classifier intents map explicitly and unknown stays reviewable',()=>{
  assert.equal(mapOperationalIntentToDomainEvent('plan_snapshot'),'PLAN_RECORDED');
  assert.equal(mapOperationalIntentToDomainEvent('race_open'),'RACE_OPENED');
  assert.equal(mapOperationalIntentToDomainEvent('race_result'),'RESULT_RECORDED');
  assert.equal(mapOperationalIntentToDomainEvent('something-new'),'UNKNOWN');
});