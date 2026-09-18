import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const backend=()=>fs.readFileSync('backend/src/modules/verticals/health.routes.ts','utf8');
const service=()=>fs.readFileSync('frontend/src/services/verticalService.js','utf8');
const page=()=>fs.readFileSync('frontend/src/pages/DentistryPracticePage.jsx','utf8');

test('13/51 adds a server-authoritative encounter amendment endpoint',()=>{
  const source=backend();
  assert.match(source,/router\.post\('\/health\/encounters\/:id\/amend'/);
  assert.match(source,/requirePermission\('health\.manage'\)/);
  assert.match(source,/FOR UPDATE/);
  assert.match(source,/status"='signed'|status\"='signed'|status\s*===\s*'signed'/);
  assert.match(source,/SET "status"='amended'/);
  assert.match(source,/INSERT INTO public\."CareEncounter"/);
});

test('13/51 computes version metadata on the server and never trusts client actor or revision',()=>{
  const source=backend();
  for(const token of ['previousEncounterId','revision','reason','actorUserId','actorEmail','amendedAt','changedFields','before','after']) assert.ok(source.includes(token),token);
  assert.match(source,/ctx\(req\)\.userId/);
  assert.match(source,/ctx\(req\)\.email/);
  assert.doesNotMatch(source,/b\.actorUserId|b\.revision|b\.previousEncounterId/);
});

test('13/51 preserves prior clinicalData and creates a new signed version instead of overwriting it',()=>{
  const source=backend();
  assert.match(source,/JSON\.stringify\(nextClinicalData\)/);
  assert.match(source,/old\.clinicalData|previous\.clinicalData/);
  assert.doesNotMatch(source,/UPDATE public\."CareEncounter"[\s\S]{0,400}SET[^;]*"clinicalData"/);
  assert.match(source,/status[^\n]{0,80}'signed'/);
});

test('13/51 frontend uses the canonical amend service with an explicit reason',()=>{
  const svc=service();
  const ui=page();
  assert.match(svc,/amendEncounter\(id,\s*payload\)/);
  assert.match(svc,/encounters\/\$\{encodeURIComponent\(id\)\}\/amend/);
  for(const token of ['amendmentTarget','amendmentReason','prepareAmendment','HealthVerticalService.amendEncounter(','Motivo de la enmienda']) assert.ok(ui.includes(token),token);
});

test('13/51 history exposes revision status, actor, reason and structured change summary',()=>{
  const source=page();
  for(const token of ['versioning?.revision','versioning?.reason','versioning?.actor','versioning?.changedFields','Versión']) assert.ok(source.includes(token),token);
});
