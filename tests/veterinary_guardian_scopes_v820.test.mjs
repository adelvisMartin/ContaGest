import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const schema = fs.readFileSync('backend/src/modules/verticals/veterinary.schemas.ts','utf8');
const head = schema.indexOf('export const veterinaryGuardianPortalGrantSchema');
const tail = schema.indexOf('export const veterinaryBoardingSettingsSchema',head);
const body = schema.slice(head,tail);
test('guardian scopes refuse duplicate entries rather than wasting permission slots',()=>{
  assert.match(body,/new Set\(value\)\.size===value\.length/);
  assert.match(body,/No repitas los ámbitos autorizados/);
});
test('guardian default retains explicit source-defined scope allowlist',()=>{
  assert.match(body,/z\.enum\(VETERINARY_GUARDIAN_PORTAL_SCOPES\)/);
  assert.match(body,/\.default\(\[\.\.\.VETERINARY_GUARDIAN_PORTAL_SCOPES\]\)/);
});
test('do not change patient, expiry and strict unknown fields safeguards',()=>{
  assert.match(body,/patientId:z\.string\(\)\.min\(10\)/);
  assert.match(body,/max\(168\)\.default\(48\)/);
  assert.match(body,/\}\)\.strict\(\)/);
});
