import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { healthBackendSource } from '../qa/support/vertical-authority-sources.mjs';

const backend=()=>healthBackendSource();
const service=()=>fs.readFileSync('frontend/src/services/verticalService.js','utf8');
const page=()=>fs.readFileSync('frontend/src/pages/DentistryPracticePage.jsx','utf8');

test('13/51 keeps a server-authoritative versioned amendment endpoint',()=>{
  const source=backend();
  assert.match(source,/router\.post\('\/health\/encounters\/:id\/amend'/);
  assert.match(source,/requirePermission\('health\.manage'\)/);
  assert.match(source,/FOR UPDATE/);
  assert.match(source,/previous\.status\s*!==\s*'signed'/);
  assert.match(source,/INSERT INTO public\."CareEncounter"/);
});

test('13/51 computes version metadata on the server and never trusts client actor or revision',()=>{
  const source=backend();
  for(const token of ['previousEncounterId','revision','reason','actorUserId','actorEmail','amendedAt','changedFields','before','after']) assert.ok(source.includes(token),token);
  assert.match(source,/ctx\(req\)\.userId/);
  assert.match(source,/ctx\(req\)\.email/);
  assert.doesNotMatch(source,/b\.actorUserId|b\.revision|b\.previousEncounterId/);
});

test('13/51 preserves prior clinicalData while 18/51 defers supersession until the amendment is signed',()=>{
  const source=backend();
  const amendStart=source.indexOf("router.post('/health/encounters/:id/amend'");
  const workflowStart=source.indexOf("router.post('/health/encounters/:id/workflow'");
  const amend=source.slice(amendStart,workflowStart);
  assert.match(amend,/JSON\.stringify\(nextClinicalData\)/);
  assert.match(amend,/previous\.clinicalData/);
  assert.doesNotMatch(amend,/UPDATE public\."CareEncounter"[\s\S]{0,500}SET[^;]*"clinicalData"/);
  assert.match(amend,/status[^\n]{0,100}'draft'/);
  assert.match(amend,/amendedAt:null/);
});

test('13/51 frontend uses the canonical amend service with an explicit reason',()=>{
  const svc=service();
  const ui=page();
  assert.match(svc,/amendEncounter\(id,\s*payload\)/);
  assert.match(svc,/encounters\\/\\$\\{pathId\\(id\\)\\}\\/amend/);
  for(const token of ['amendmentTarget','amendmentReason','prepareAmendment','HealthVerticalService.amendEncounter(','Motivo de la enmienda']) assert.ok(ui.includes(token),token);
});

test('13/51 history exposes revision status, actor, reason and structured change summary',()=>{
  const source=page();
  for(const token of ['versioning?.revision','versioning?.reason','versioning?.actor','versioning?.changedFields','Versión']) assert.ok(source.includes(token),token);
});
