import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OBSERVABILITY_STAGES,
  buildObservationTrace,
  candidateSha,
  normalizeObservationEvent,
  sanitizeObservationMetadata
} from './hipico-observability.js';

const OWNER='11111111-1111-4111-8111-111111111111';

test('v11 stages cover the canonical support chain in order',()=>{
  assert.deepEqual(OBSERVABILITY_STAGES,[
    'INBOUND','NORMALIZATION','PARSER','CONTEXT','RISK_POLICY','AGENT_DECISION',
    'PERSISTENCE','OUTBOX','DELIVERY_RECEIPT','RECONCILIATION_HANDOFF'
  ]);
});

test('trace ids are deterministic without exposing provider ids',()=>{
  const a=buildObservationTrace({ownerId:OWNER,groupKey:'lab:a',groupId:'group-a',sourceRef:'wamid.secret'});
  const b=buildObservationTrace({ownerId:OWNER,groupKey:'lab:a',groupId:'group-a',sourceRef:'wamid.secret'});
  assert.deepEqual(a,b);
  assert.match(a.requestId,/^req_[a-f0-9]{32}$/);
  assert.match(a.correlationId,/^corr_[a-f0-9]{32}$/);
  assert.equal(JSON.stringify(a).includes('wamid.secret'),false);
});

test('metadata sanitizer removes credentials and message/identity payloads recursively',()=>{
  const clean=sanitizeObservationMetadata({
    status:'accepted',reason:'SAFE',latency:12,
    authorization:'Bearer do-not-log',token:'secret',cookie:'sid=secret',
    text:'raw whatsapp text',destination:'584121234567',sender:'584121234567',
    nested:{apiKey:'secret',password:'secret',safe:'ok'},
    list:[{message:'private',code:'E1'}]
  }) as Record<string,unknown>;
  const rendered=JSON.stringify(clean);
  for(const forbidden of ['do-not-log','sid=secret','raw whatsapp text','584121234567','apiKey','password','private']){
    assert.equal(rendered.includes(forbidden),false,forbidden);
  }
  assert.equal((clean.nested as any).safe,'ok');
  assert.equal((clean.list as any[])[0].code,'E1');
});

test('candidate SHA is accepted only when it is an exact git SHA',()=>{
  assert.equal(candidateSha({HIPICO_CANDIDATE_SHA:'a'.repeat(40)}),'a'.repeat(40));
  assert.equal(candidateSha({HIPICO_CANDIDATE_SHA:'main',GITHUB_SHA:'b'.repeat(40)}),'b'.repeat(40));
  assert.equal(candidateSha({HIPICO_CANDIDATE_SHA:'short'}),null);
});

test('event normalization bounds reason/latency and preserves full multigroup scope',()=>{
  const trace=buildObservationTrace({ownerId:OWNER,groupKey:'lab:a',groupId:'group-a',sourceRef:'msg-1'});
  const event=normalizeObservationEvent({
    ...trace,stage:'RISK_POLICY',outcome:'HELD',reasonCode:' HUMAN_REQUIRED ',latencyMs:-10,
    metadata:{decision:'HUMAN_REQUIRED',rawBody:'never'}
  });
  assert.equal(event.ownerId,OWNER);
  assert.equal(event.groupKey,'lab:a');
  assert.equal(event.groupId,'group-a');
  assert.equal(event.reasonCode,'HUMAN_REQUIRED');
  assert.equal(event.latencyMs,0);
  assert.equal(JSON.stringify(event.metadata).includes('never'),false);
});
