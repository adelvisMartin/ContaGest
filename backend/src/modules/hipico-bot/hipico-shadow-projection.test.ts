import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShadowProjection } from './hipico-shadow-projection.js';

const event=(id:string,sender:string,intent:string,operational:any,receivedAt:string,body='')=>({
  id,sender,intent,body,receivedAt,payload:{operational}
});

test('shadow projection mirrors RC1 partial JUEGA/CONSIGUE matching',()=>{
  const projection=buildShadowProjection([
    event('e1','Adel','offer_player',{offers:[{role:'player',play:'PP',horse:'3',amount:20}]},'2026-08-17T12:00:00Z','Juega PP del 3 con 20'),
    event('e2','Luis','offer_receiver',{offers:[{role:'receiver',play:'PP',horse:'3',amount:15}]},'2026-08-17T12:00:01Z','Consigue PP del 3 con 15')
  ]);
  assert.equal(projection.matches.length,1);
  assert.deepEqual(
    {play:projection.matches[0].play,horse:projection.matches[0].horse,amount:projection.matches[0].amount,player:projection.matches[0].player,receiver:projection.matches[0].receiver},
    {play:'PP',horse:'3',amount:15,player:'Adel',receiver:'Luis'}
  );
  assert.equal(projection.unmatched.length,1);
  assert.equal(projection.unmatched[0].remaining,5);
});

test('same sender cannot self-match and different horse does not match',()=>{
  const projection=buildShadowProjection([
    event('e1','Adel','offer_player',{offers:[{play:'PP',horse:'3',amount:20}]},'2026-08-17T12:00:00Z'),
    event('e2','Adel','offer_receiver',{offers:[{play:'PP',horse:'3',amount:20}]},'2026-08-17T12:00:01Z'),
    event('e3','Luis','offer_receiver',{offers:[{play:'PP',horse:'4',amount:20}]},'2026-08-17T12:00:02Z')
  ]);
  assert.equal(projection.matches.length,0);
  assert.equal(projection.unmatched.length,3);
});

test('offer after close is flagged late and excluded until a new plan opens a segment',()=>{
  const projection=buildShadowProjection([
    event('e1','Adel','offer_player',{offers:[{play:'PP',horse:'3',amount:20}]},'2026-08-17T12:00:00Z'),
    event('c1','Sistema','race_close',{raceNumber:4},'2026-08-17T12:00:01Z','Cierra carrera 4'),
    event('late','Luis','offer_receiver',{offers:[{play:'PP',horse:'3',amount:20}]},'2026-08-17T12:00:02Z'),
    event('plan','Sistema','plan_snapshot',{offers:[]},'2026-08-17T12:00:03Z','TERCIOS'),
    event('e2','Adel','offer_player',{offers:[{play:'1N',horse:'6',amount:10}]},'2026-08-17T12:00:04Z'),
    event('e3','Luis','offer_receiver',{offers:[{play:'1N',horse:'6',amount:10}]},'2026-08-17T12:00:05Z')
  ]);
  assert.equal(projection.lateOffers.length,1);
  assert.equal(projection.lateOffers[0].eventId,'late');
  assert.equal(projection.matches.length,1);
  assert.equal(projection.matches[0].segmentId,2);
  assert.equal(projection.matches[0].play,'1N');
});

test('projection records confirmations, result, settlement and balances without mutation',()=>{
  const projection=buildShadowProjection([
    event('confirm','Luis','offer_confirmation',{confirmation:'J'},'2026-08-17T12:00:00Z','J'),
    event('result','Sistema','race_result',{board:['2','1','6','4']},'2026-08-17T12:00:01Z'),
    event('settle','Sistema','settlement_snapshot',{settlementRows:[{role:'player',participant:'Adel',amount:20}]},'2026-08-17T12:00:02Z'),
    event('balance','Sistema','balance_snapshot',{balances:[{participant:'Adel',available:100}]},'2026-08-17T12:00:03Z')
  ]);
  assert.equal(projection.mode,'shadow');
  assert.equal(projection.confirmations.length,1);
  assert.deepEqual(projection.results[0].board,['2','1','6','4']);
  assert.equal(projection.settlements.length,1);
  assert.equal(projection.balances.length,1);
});
