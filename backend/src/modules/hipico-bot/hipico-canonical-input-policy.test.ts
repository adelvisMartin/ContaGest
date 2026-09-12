import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_CANONICAL_FUTURE_SKEW_MS,
  canonicalPayloadIssue,
  canonicalTimestampIssue
} from './hipico-canonical-input-policy.js';

test('canonical payload accepts bounded JSON evidence and rejects resource amplification',()=>{
  assert.equal(canonicalPayloadIssue({raceNumber:4,racetrack:'Churchill Downs',board:['7','3','1']}),null);
  assert.equal(canonicalPayloadIssue({blob:'x'.repeat(140*1024)}),'HIPICO_NORMALIZED_PAYLOAD_TOO_LARGE');
  assert.equal(canonicalPayloadIssue({rows:Array.from({length:1001},(_,i)=>i)}),'HIPICO_NORMALIZED_PAYLOAD_TOO_COMPLEX');

  let nested:unknown='leaf';
  for(let i=0;i<14;i+=1)nested={child:nested};
  assert.equal(canonicalPayloadIssue(nested),'HIPICO_NORMALIZED_PAYLOAD_TOO_DEEP');
  assert.equal(canonicalPayloadIssue({value:Number.NaN}),'HIPICO_NORMALIZED_PAYLOAD_INVALID');
});

test('canonical timestamp allows historical evidence but rejects future clock drift beyond five minutes',()=>{
  const now=Date.parse('2026-09-12T00:00:00.000Z');
  assert.equal(canonicalTimestampIssue('2025-01-01T00:00:00.000Z',now),null);
  assert.equal(canonicalTimestampIssue(new Date(now+MAX_CANONICAL_FUTURE_SKEW_MS).toISOString(),now),null);
  assert.equal(canonicalTimestampIssue(new Date(now+MAX_CANONICAL_FUTURE_SKEW_MS+1).toISOString(),now),'HIPICO_EVENT_TIMESTAMP_IN_FUTURE');
  assert.equal(canonicalTimestampIssue('not-a-date',now),'HIPICO_EVENT_TIMESTAMP_INVALID');
});
