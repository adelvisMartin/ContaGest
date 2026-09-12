import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_CANONICAL_FUTURE_SKEW_MS,
  canonicalPayloadIssue,
  canonicalTimestampIssue,
  gregorianDaysInMonth
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

test('Gregorian calendar helper is deterministic even for years where Date.UTC has legacy 1900 coercion',()=>{
  assert.equal(gregorianDaysInMonth(2024,2),29);
  assert.equal(gregorianDaysInMonth(2025,2),28);
  assert.equal(gregorianDaysInMonth(2000,2),29);
  assert.equal(gregorianDaysInMonth(1900,2),28);
  assert.equal(gregorianDaysInMonth(96,2),29);
  assert.equal(gregorianDaysInMonth(99,2),28);
  assert.equal(gregorianDaysInMonth(0,2),0);
  assert.equal(gregorianDaysInMonth(2026,13),0);
});

test('canonical timestamp requires explicit ISO-8601 timezone and valid calendar fields',()=>{
  const now=Date.parse('2026-09-12T00:00:00.000Z');
  assert.equal(canonicalTimestampIssue('2025-01-01T00:00:00.000Z',now),null);
  assert.equal(canonicalTimestampIssue('2024-02-29T23:59:59.123456Z',now),null);
  assert.equal(canonicalTimestampIssue('2025-01-01T01:30:00+01:30',now),null);
  for(const invalid of [
    '0000-01-01T00:00:00Z',
    '2026-09-11',
    '2026-09-11T06:00:00',
    '2026-09-11 06:00:00Z',
    '09/11/2026 06:00:00',
    '2026-02-29T06:00:00Z',
    '2026-02-31T06:00:00Z',
    '2026-13-01T06:00:00Z',
    '2026-09-11T24:00:00Z',
    '2026-09-11T06:60:00Z',
    '2026-09-11T06:00:60Z',
    '2026-09-11T06:00:00+14:30',
    '2026-09-11T06:00:00+15:00',
    'not-a-date'
  ]) assert.equal(canonicalTimestampIssue(invalid,now),'HIPICO_EVENT_TIMESTAMP_INVALID',invalid);
});

test('canonical timestamp allows historical evidence but rejects future clock drift beyond five minutes',()=>{
  const now=Date.parse('2026-09-12T00:00:00.000Z');
  assert.equal(canonicalTimestampIssue(new Date(now+MAX_CANONICAL_FUTURE_SKEW_MS).toISOString(),now),null);
  assert.equal(canonicalTimestampIssue(new Date(now+MAX_CANONICAL_FUTURE_SKEW_MS+1).toISOString(),now),'HIPICO_EVENT_TIMESTAMP_IN_FUTURE');
});