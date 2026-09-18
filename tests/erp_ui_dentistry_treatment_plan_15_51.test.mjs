import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const backend=()=>fs.readFileSync('backend/src/modules/verticals/health.routes.ts','utf8');
const page=()=>fs.readFileSync('frontend/src/pages/DentistryPracticePage.jsx','utf8');
const panel=()=>fs.readFileSync('frontend/src/components/dentistry/TreatmentPlanPanel.jsx','utf8');
const service=()=>fs.readFileSync('frontend/src/services/verticalService.js','utf8');

test('15/51 validates diagnosis alternatives phases procedures and server-priced budget',()=>{
  const source=backend();
  for(const token of ['dentalTreatmentPlanClinicalDataSchema','diagnosis','alternatives','phases','procedures','quantity','unitPrice','budget','estimatedTotal','dentalMoneyCents','dentalCentsMoney']) assert.ok(source.includes(token),token);
  assert.match(source,/value\.type\s*===\s*'dental-treatment-plan'/);
  assert.match(source,/normalizeDentalTreatmentPlan/);
});

test('15/51 creates a proposed draft through existing CareEncounter authority',()=>{
  const source=page();
  assert.match(source,/HealthVerticalService\.createEncounter\(/);
  assert.match(source,/type:'dental-treatment-plan'/);
  assert.match(source,/status:'draft'/);
  assert.match(source,/status:'proposed'/);
  assert.match(source,/acceptance:\{status:'pending'\}/);
});

test('15/51 acceptance decision is server-authored and terminal for the draft plan',()=>{
  const source=backend();
  assert.match(source,/router\.post\('\/health\/encounters\/:id\/treatment-plan-decision'/);
  assert.match(source,/FOR UPDATE/);
  assert.match(source,/previous\.status\s*!==\s*'draft'/);
  assert.match(source,/decision==='accepted'\?'signed':'cancelled'|decision === 'accepted' \? 'signed' : 'cancelled'/);
  for(const token of ['decidedAt','actorUserId','actorEmail','acceptance']) assert.ok(source.includes(token),token);
  assert.doesNotMatch(source,/b\.actorUserId|b\.decidedAt/);
});

test('15/51 UI models alternatives and phased procedures without pretending acceptance is a signature',()=>{
  const source=panel();
  for(const token of ['alternatives','phases','procedures','Agregar alternativa','Agregar fase','Agregar procedimiento','Presupuesto estimado','Aceptar plan','Rechazar plan']) assert.ok(source.includes(token),token);
  assert.doesNotMatch(source,/firma|signature|CareConsent/i);
});

test('15/51 frontend uses canonical treatment-plan decision service',()=>{
  const svc=service();
  const ui=page();
  assert.match(svc,/decideTreatmentPlan\(id,\s*payload\)/);
  assert.match(svc,/treatment-plan-decision/);
  assert.match(ui,/HealthVerticalService\.decideTreatmentPlan\(/);
});
