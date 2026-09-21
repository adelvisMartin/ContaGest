import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const backend=()=>fs.readFileSync('backend/src/modules/verticals/health.routes.ts','utf8');
const page=()=>fs.readFileSync('frontend/src/pages/DentistryPracticePage.jsx','utf8');
const service=()=>fs.readFileSync('frontend/src/services/verticalService.js','utf8');
const lifecycle=()=>fs.readFileSync('frontend/src/components/dentistry/DentalLifecycleActions.jsx','utf8');
const migration=()=>fs.readFileSync('backend/prisma/migrations/20260921122000_dental_encounter_lifecycle_v1851/migration.sql','utf8');

test('18/51 database lifecycle admits review without removing prior terminal states',()=>{
  const source=migration();
  for(const state of ['draft','review','signed','amended','cancelled']) assert.ok(source.includes(`'${state}'`),state);
  assert.match(source,/CareEncounter_status_check/);
});

test('18/51 new dental treatments are forced to draft server-side',()=>{
  const source=backend();
  assert.match(source,/value\.type\s*===\s*'dental-treatment'/);
  assert.match(source,/value\.status\s*!==\s*'draft'/);
  assert.match(source,/normalizeDentalTreatmentDraft/);
  for(const token of ["state:'draft'","purpose:'treatment'",'createdBy','createdAt']) assert.ok(source.includes(token),token);
});

test('18/51 workflow endpoint only permits draft -> review -> signed',()=>{
  const source=backend();
  assert.match(source,/router\.post\('\/health\/encounters\/:id\/workflow'/);
  assert.match(source,/z\.enum\(\['submit-review','sign'\]\)/);
  assert.match(source,/previous\.status!=='draft'/);
  assert.match(source,/previous\.status!=='review'/);
  assert.match(source,/status"='review'|status\"='review'/);
  assert.match(source,/status"='signed'|status\"='signed'/);
  for(const token of ['reviewRequestedAt','reviewRequestedBy','signedAt','signedBy']) assert.ok(source.includes(token),token);
});

test('18/51 amendment creates a draft and does not supersede signed authority before signing',()=>{
  const source=backend();
  const amendStart=source.indexOf("router.post('/health/encounters/:id/amend'");
  const workflowStart=source.indexOf("router.post('/health/encounters/:id/workflow'");
  const amend=source.slice(amendStart,workflowStart>amendStart?workflowStart:amendStart+12000);
  assert.match(amend,/status[^\n]{0,100}'draft'/);
  assert.match(amend,/purpose:'amendment'/);
  assert.match(amend,/previousEncounterId/);
  assert.doesNotMatch(amend,/SET "status"='amended'/);
  assert.match(amend,/pending amendment|enmienda pendiente/i);
});

test('18/51 signing an amendment supersedes the prior signed version atomically',()=>{
  const source=backend();
  const workflowStart=source.indexOf("router.post('/health/encounters/:id/workflow'");
  const decisionStart=source.indexOf("router.post('/health/encounters/:id/treatment-plan-decision'");
  const workflow=source.slice(workflowStart,decisionStart>workflowStart?decisionStart:workflowStart+12000);
  assert.match(workflow,/previousEncounterId/);
  assert.match(workflow,/FOR UPDATE/);
  assert.match(workflow,/SET "status"='amended'/);
  assert.match(workflow,/SET "status"='signed'/);
});

test('18/51 frontend no longer auto-signs dental-treatment creation',()=>{
  const source=page();
  const start=source.indexOf('async function submitEncounter');
  const end=source.indexOf('async function createTreatmentPlan',start);
  const submit=source.slice(start,end);
  assert.match(submit,/type:'dental-treatment'/);
  assert.match(submit,/status:'draft'/);
  assert.doesNotMatch(submit,/status:'signed'/);
  assert.match(submit,/Borrador/);
});

test('18/51 frontend exposes explicit review/sign actions through canonical service',()=>{
  const svc=service();
  const ui=page();
  const actions=lifecycle();
  assert.match(svc,/transitionDentalEncounter\(id,\s*payload\)/);
  assert.match(svc,/encounters\/\$\{encodeURIComponent\(id\)\}\/workflow/);
  assert.match(ui,/HealthVerticalService\.transitionDentalEncounter\(/);
  assert.match(ui,/DentalLifecycleActions/);
  for(const token of ['Enviar a revisión','Firmar versión','En revisión','Borrador','Firmado','Enmendado']) assert.ok(actions.includes(token),token);
  assert.match(actions,/CgDialog/);
});

test('18/51 signed treatment remains the only state that can start amendment',()=>{
  const actions=lifecycle();
  const source=page();
  assert.match(actions,/status===['"]signed['"]/);
  assert.match(actions,/onAmend\?\.\(encounter\)/);
  assert.match(source,/onAmend=\{prepareAmendment\}/);
});


test('18/51 Wave A audit keeps lifecycle source owners singleton',()=>{
  const audit=fs.readFileSync('scripts/erp-ui-wave-a-audit-v251.mjs','utf8');
  assert.equal((audit.match(/const lifecycleActions=/g)||[]).length,1);
  assert.equal((audit.match(/const healthRoutes=/g)||[]).length,1);
  assert.equal((audit.match(/const lifecycleMigration=/g)||[]).length,1);
  assert.equal((audit.match(/const verticalService=/g)||[]).length,1);
});
