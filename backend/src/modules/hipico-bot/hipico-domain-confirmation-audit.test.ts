import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { __test__ } from './hipico-domain-event.store.js';

const routeSource=readFileSync(new URL('./hipico-canonical.routes.ts',import.meta.url),'utf8');
const storeSource=readFileSync(new URL('./hipico-domain-event.store.ts',import.meta.url),'utf8');
const querySource=readFileSync(new URL('./hipico-domain-query.store.ts',import.meta.url),'utf8');
const migrationSource=readFileSync(new URL('../../../../supabase/sql/hipico_v16_operator_confirmation_audit.sql',import.meta.url),'utf8');

function row(overrides:Record<string,unknown>={}){
  return{
    id:'evt-1',eventType:'RACE_OPENED',disposition:'applied',previousState:'PREPARING',nextState:'OPEN',reason:'VALID_TRANSITION',
    sourceMessageId:'msg-1',rawMessage:'abre carrera',normalizedPayload:{raceNumber:4,racetrack:'Churchill Downs',raceContextComplete:true},
    actorRef:'operator-1',source:'canonical_operator_api',parserVersion:'v1',schemaVersion:1,
    eventTimestamp:'2026-09-11T20:00:00.000Z',originalEventId:null,
    operatorConfirmed:true,confirmationReason:'operator verified opening',...overrides
  } as any;
}
function event(overrides:Record<string,unknown>={}){
  return{
    type:'RACE_OPENED',sourceMessageKey:'source-1',sourceMessageId:'msg-1',rawMessage:'abre carrera',
    normalizedPayload:{racetrack:'Churchill Downs',raceContextComplete:true,raceNumber:4},actorRef:'operator-1',
    source:'canonical_operator_api',parserVersion:'v1',schemaVersion:1,timestamp:'2026-09-11T20:00:00.000Z',
    originalEventId:null,requiresReview:false,operatorConfirmed:true,confirmationReason:'operator verified opening',...overrides
  } as any;
}

test('confirmation audit rejects orphan reasons and confirmed actions without a meaningful reason',()=>{
  assert.deepEqual(__test__.confirmationAudit(event()),{
    operatorConfirmed:true,confirmationReason:'operator verified opening'
  });
  assert.throws(()=>__test__.confirmationAudit(event({operatorConfirmed:false,confirmationReason:'orphan reason'})),/HIPICO_CONFIRMATION_FLAG_REQUIRED/);
  assert.throws(()=>__test__.confirmationAudit(event({operatorConfirmed:true,confirmationReason:'ok'})),/HIPICO_CONFIRMATION_REASON_REQUIRED/);
  assert.throws(()=>__test__.confirmationAudit(event({operatorConfirmed:true,confirmationReason:'x'.repeat(501)})),/HIPICO_CONFIRMATION_REASON_REQUIRED/);
});

test('confirmation facts are immutable under source-message replay',()=>{
  assert.doesNotThrow(()=>__test__.assertDomainReplay(row(),event()));
  assert.throws(()=>__test__.assertDomainReplay(row(),event({operatorConfirmed:false,confirmationReason:null})),(error:any)=>error?.code==='HIPICO_DOMAIN_REPLAY_MISMATCH');
  assert.throws(()=>__test__.assertDomainReplay(row(),event({confirmationReason:'different audited reason'})),(error:any)=>error?.code==='HIPICO_DOMAIN_REPLAY_MISMATCH');
});

test('canonical route persists confirmation flag and reason instead of using them as transient gates only',()=>{
  assert.match(routeSource,/operatorConfirmed:\s*input\.confirmedOperatorAction/);
  assert.match(routeSource,/confirmationReason:\s*input\.confirmationReason\s*\|\|\s*null/);
  assert.match(routeSource,/!input\.confirmedOperatorAction\s*&&\s*String\(input\.confirmationReason/);
  assert.match(storeSource,/operator_confirmed,confirmation_reason/);
  assert.match(querySource,/operator_confirmed AS "operatorConfirmed"/);
  assert.match(querySource,/confirmation_reason AS "confirmationReason"/);
});

test('database contract makes confirmation evidence structurally valid and append-only compatible',()=>{
  assert.match(migrationSource,/add column if not exists operator_confirmed boolean not null default false/i);
  assert.match(migrationSource,/add column if not exists confirmation_reason text/i);
  assert.match(migrationSource,/hipico_domain_events_confirmation_audit_check/);
  assert.match(migrationSource,/char_length\(btrim\(coalesce\(confirmation_reason, ''\)\)\) between 5 and 500/i);
});
