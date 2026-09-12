import assert from 'node:assert/strict';
import test from 'node:test';
import { __test__ } from './hipico-domain-event.store.js';

const OWNER='11111111-1111-4111-8111-111111111111';
const base={
  ownerId:OWNER,
  groupKey:'group-a',
  aggregateKind:'race' as const,
  aggregateKey:'racectx_1234567890abcdef12345678',
  event:{
    type:'RACE_OPENED' as const,
    sourceMessageKey:'source-1',
    normalizedPayload:{raceNumber:4,racetrack:'Churchill Downs',raceContextComplete:true},
    actorRef:'operator-token:1234567890abcdef12345678',
    source:'canonical_operator_api',
    schemaVersion:1,
    timestamp:new Date(Date.now()-1000).toISOString(),
    operatorConfirmed:true,
    confirmationReason:'operator verified opening'
  }
};

test('storage boundary accepts the bounded canonical event envelope',()=>{
  assert.equal(__test__.persistenceInputIssue(base),null);
});

test('storage boundary rejects malformed scope before opening a database transaction',()=>{
  assert.equal(__test__.persistenceInputIssue({...base,ownerId:'not-a-uuid'}),'HIPICO_DOMAIN_OWNER_INVALID');
  assert.equal(__test__.persistenceInputIssue({...base,groupKey:'x'.repeat(121)}),'HIPICO_DOMAIN_EVENT_SCOPE_REQUIRED');
  assert.equal(__test__.persistenceInputIssue({...base,aggregateKey:'x'.repeat(181)}),'HIPICO_DOMAIN_EVENT_SCOPE_REQUIRED');
  assert.equal(__test__.persistenceInputIssue({...base,event:{...base.event,sourceMessageKey:'x'.repeat(321)}}),'HIPICO_DOMAIN_EVENT_SCOPE_REQUIRED');
});

test('storage boundary independently rejects payload amplification, missing timestamps and future timestamps',()=>{
  assert.equal(
    __test__.persistenceInputIssue({...base,event:{...base.event,normalizedPayload:{blob:'x'.repeat(140*1024)}}}),
    'HIPICO_NORMALIZED_PAYLOAD_TOO_LARGE'
  );
  const {timestamp:_timestamp,...withoutTimestamp}=base.event;
  assert.equal(
    __test__.persistenceInputIssue({...base,event:withoutTimestamp}),
    'HIPICO_EVENT_TIMESTAMP_REQUIRED'
  );
  assert.equal(
    __test__.persistenceInputIssue({...base,event:{...base.event,timestamp:''}}),
    'HIPICO_EVENT_TIMESTAMP_REQUIRED'
  );
  assert.equal(
    __test__.persistenceInputIssue({...base,event:{...base.event,timestamp:'2026-09-11 20:00:00'}}),
    'HIPICO_EVENT_TIMESTAMP_INVALID'
  );
  assert.equal(
    __test__.persistenceInputIssue({...base,event:{...base.event,timestamp:new Date(Date.now()+10*60*1000).toISOString()}}),
    'HIPICO_EVENT_TIMESTAMP_IN_FUTURE'
  );
});

test('validTimestamp cannot silently replace missing source time with the current clock',()=>{
  assert.throws(()=>__test__.validTimestamp(undefined),/HIPICO_EVENT_TIMESTAMP_REQUIRED/);
  assert.throws(()=>__test__.validTimestamp(''),/HIPICO_EVENT_TIMESTAMP_REQUIRED/);
  assert.throws(()=>__test__.validTimestamp('31\/02\/2026 10:00'),/HIPICO_EVENT_TIMESTAMP_INVALID/);
  assert.equal(
    __test__.validTimestamp('2026-09-11T20:00:00-04:00').toISOString(),
    '2026-09-12T00:00:00.000Z'
  );
});

test('storage boundary rejects oversized audit and message fields',()=>{
  assert.equal(__test__.persistenceInputIssue({...base,event:{...base.event,rawMessage:'x'.repeat(4001)}}),'HIPICO_DOMAIN_RAW_MESSAGE_TOO_LARGE');
  assert.equal(__test__.persistenceInputIssue({...base,event:{...base.event,actorRef:'x'.repeat(221)}}),'HIPICO_DOMAIN_ACTOR_REF_INVALID');
  assert.equal(__test__.persistenceInputIssue({...base,event:{...base.event,parserVersion:'x'.repeat(121)}}),'HIPICO_DOMAIN_PARSER_VERSION_INVALID');
  assert.equal(__test__.persistenceInputIssue({...base,event:{...base.event,schemaVersion:0}}),'HIPICO_DOMAIN_SCHEMA_VERSION_INVALID');
});