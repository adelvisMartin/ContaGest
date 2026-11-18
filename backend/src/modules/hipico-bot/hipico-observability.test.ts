import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OBSERVABILITY_STAGES,
  buildObservationTrace,
  candidateSha,
  normalizeObservationEvent,
  safeObservationReasonCode,
  safeObservationTraceId,
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

test('#1314 untrusted trace references cannot expose provider IDs or report tokens',()=>{
  const raw='Bearer '+'a'.repeat(42)+'?t='+ 'b'.repeat(43);
  const input={ownerId:OWNER,groupKey:'lab:a',groupId:'group-a',sourceRef:'synthetic-event',requestId:raw,correlationId:'584121234567@c.us'};
  const event=buildObservationTrace(input);
  const again=buildObservationTrace(input);
  assert.deepEqual(event,again);
  assert.match(event.requestId,/^req_[a-f0-9]{32}$/);
  assert.match(event.correlationId,/^corr_[a-f0-9]{32}$/);
  assert.equal(JSON.stringify(event).includes('584121234567'),false);
  assert.equal(JSON.stringify(event).includes('Bearer'),false);
  const other=buildObservationTrace({...input,groupId:'group-b'});
  assert.notEqual(event.correlationId,other.correlationId,'Never correlate owners or groups by an untrusted alias');
  assert.equal(
    safeObservationTraceId(input.correlationId,'corr',`${OWNER}|lab:a|group-a`),
    event.correlationId,'A support query must recover the same normalized group identifier'
  );
  assert.equal(safeObservationTraceId(event.correlationId,'corr','any-group'),event.correlationId,
    'Opaque references are stable on storage normalization');
});

test('#1314 raw observation input cannot bypass trace sanitization',()=>{
  const original=buildObservationTrace({ownerId:OWNER,groupKey:'lab:a',groupId:'group-a',sourceRef:'synthetic-event'});
  const event=normalizeObservationEvent({...original,
    requestId:'https://example.invalid/report?t='+'Q'.repeat(43),
    correlationId:'584121234567@c.us',
    stage:'INBOUND',outcome:'HELD',reasonCode:'HUMAN_REQUIRED'
  });
  const rendered=JSON.stringify(event);
  assert.match(event.requestId,/^req_[a-f0-9]{32}$/);
  assert.match(event.correlationId,/^corr_[a-f0-9]{32}$/);
  assert.equal(rendered.includes('584121234567'),false);
  assert.equal(rendered.includes('example.invalid'),false);
});

test('#1314 legacy support bundles normalize output IDs and keep private scoped filter aliases',()=>{
  const store=fs.readFileSync(new URL('./hipico-observability.store.ts',import.meta.url),'utf8');
  assert.match(store,/requestId:safeObservationTraceId\(row\.request_id,'req',scope\)/);
  assert.match(store,/correlationId:safeObservationTraceId\(row\.correlation_id,'corr',scope\)/);
  assert.match(store,/OR correlation_id=\$\{legacyCorrelationId\}/);
  assert.match(store,/WHERE owner_id=\$\{input.ownerId\}::uuid/);
  assert.match(store,/AND group_key=\$\{input.groupKey\}/);
  assert.match(store,/AND group_id=\$\{input.groupId\}/);
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

test('HIPICO #1314 redacts private report URLs and sender identifiers hidden in metadata values',()=>{
  const token='A'.repeat(43);
  const raw='GET /api/v1/hipico/report-shares/public?t='+token+' from 584121234567@c.us';
  const clean=sanitizeObservationMetadata({
    detail:raw, note:'Contact +584121234567', actor:'participant-7@lid',
    url:'https://example.invalid/share?%74='+token, t:token,
    trace:'safe', evidence:[{code:'HUMAN_REQUIRED', info:'Bearer '+token}]
  }) as Record<string,unknown>;
  const output=JSON.stringify(clean);
  for(const forbidden of [token,'584121234567','participant-7@lid']){
    assert.equal(output.includes(forbidden),false,forbidden);
  }
  assert.equal(clean.trace,'safe');
  assert.equal((clean.evidence as any[])[0].code,'HUMAN_REQUIRED');
  assert.equal(Object.hasOwn(clean,'t'),false);
  assert.match(String(clean.detail),/\[REDACTED\]/);
});

test('HIPICO #1314 redacts capability crossing the original 500-character boundary',()=>{
  const token='B'.repeat(43);
  const clean=sanitizeObservationMetadata('a'.repeat(480)+'?t='+token);
  assert.equal(String(clean).includes(token.slice(0,10)),false);
  assert.equal(String(clean).length<=500,true);
});

test('HIPICO #1314 sanitizes sensitive metadata keys without leaking identity',()=>{
  const clean=sanitizeObservationMetadata({
    'owner-584121234567': 'synthetic', status:'SAFE', details: { message:'private', 'participant-7@lid': 'secret' }
  }) as Record<string,unknown>;
  const rendered=JSON.stringify(clean);
  assert.equal(rendered.includes('584121234567'),false);
  assert.equal(rendered.includes('participant-7@lid'),false);
  assert.equal(clean.status,'SAFE');
  assert.equal(rendered.includes('private'),false);
});

test('HIPICO #1314 sanitizes bare JWTs nested in operational status fields',()=>{
  const jwt=['a'.repeat(24),'b'.repeat(24),'c'.repeat(24)].join('.');
  const event=sanitizeObservationMetadata({
    detail:`Probe token: ${jwt}`, nested:{trace:jwt}, elapsed:12
  }) as Record<string,unknown>;
  const out=JSON.stringify(event);
  assert.equal(out.includes(jwt),false);
  assert.equal(event.elapsed,12);
  assert.match(out,/\[REDACTED_TOKEN\]/);
});

test('HIPICO #1314 metadata keys with prototype names cannot corrupt the support bundle',()=>{
  const input=JSON.parse('{"__proto__":{"contaminated":true},"constructor":"observed","status":"SAFE"}');
  const clean=sanitizeObservationMetadata(input) as Record<string,unknown>;
  assert.equal(({} as any).contaminated,undefined);
  assert.equal(Object.getPrototypeOf(clean),null);
  assert.equal(Object.hasOwn(clean,'__proto__'),true);
  assert.equal(JSON.stringify(clean).includes('contaminated'),true);
  assert.equal(clean.constructor,'observed');
  assert.equal(clean.status,'SAFE');
});

test('HIPICO #1314 never persists opaque identifiers or error text in reason codes',()=>{
  const sensitive=[
    'Bearer '+ 'q'.repeat(43),
    'provider-error: +584121234567',
    'SESSION_584121234567',
    'https://example.invalid/report?t='+'A'.repeat(43),
    'jwt.'+'a'.repeat(25)+'.'+'b'.repeat(32)
  ];
  for(const raw of sensitive){
    const safe=safeObservationReasonCode(raw);
    assert.match(safe,/^REDACTED_REASON_[A-F0-9]{16}$/);
    assert.equal(safe,safeObservationReasonCode(raw));
    assert.equal(safe.includes('584121234567'),false);
    const trace=buildObservationTrace({
      ownerId:OWNER,groupKey:'lab:safe',groupId:'group-synthetic',sourceRef:'event-1'
    });
    const event=normalizeObservationEvent({
      ...trace,stage:'DELIVERY_RECEIPT',outcome:'ERROR',reasonCode:raw
    });
    assert.equal(event.reasonCode,safe);
    assert.equal(JSON.stringify(event).includes(raw),false);
  }
  assert.equal(safeObservationReasonCode('PROVIDER_ACCEPTED'),'PROVIDER_ACCEPTED');
  assert.equal(safeObservationReasonCode('HTTP_429'),'HTTP_429');
  assert.equal(safeObservationReasonCode(''),'UNSPECIFIED');
});

test('HIPICO #1314 support export sanitizes legacy event reason codes too',()=>{
  const store=fs.readFileSync(new URL('./hipico-observability.store.ts',import.meta.url),'utf8');
  assert.match(store,/reasonCode:safeObservationReasonCode\(row\.reason_code\)/);
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
