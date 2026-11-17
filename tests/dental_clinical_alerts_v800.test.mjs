import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {projectDentalClinicalAlerts} from '../frontend/src/components/dentistry/dental-clinical-alerts.mjs';

test('#800 clinical alerts never assert absence from incomplete pagination or unreviewed claims',()=>{
  assert.deepEqual(projectDentalClinicalAlerts(null).alerts,[]);
  assert.equal(projectDentalClinicalAlerts({items:[],nextCursor:'opaque'}).complete,false);
  const source=[
    {id:'one',kind:'allergy',detail:{substance:'penicilina'},status:'reviewed',isSuperseded:false},
    {id:'two',kind:'medication',detail:{name:'medicamento'},status:'draft'},
    {id:'three',kind:'problem',detail:{name:'problema'},status:'reviewed',isSuperseded:true}
  ];
  assert.equal(projectDentalClinicalAlerts({items:source,nextCursor:'more'}).alerts.length,0);
  const snapshot=projectDentalClinicalAlerts({items:source,nextCursor:null});
  assert.equal(snapshot.complete,true);
  assert.deepEqual(snapshot.alerts.map(x=>x.id),['one']);
  assert.equal(snapshot.unverified,1);
  assert.equal(snapshot.alerts[0].status,'reviewed');
});
test('#800 presentation reuses patient-scoped CareClinicalFact read, no parallel storage or mutation',()=>{
  const panel=readFileSync('frontend/src/components/dentistry/DentalClinicalAlertsPanel.jsx','utf8');
  const page=readFileSync('frontend/src/pages/DentistryPracticePage.jsx','utf8');
  const service=readFileSync('frontend/src/services/verticalService.js','utf8');
  const route=readFileSync('backend/src/modules/verticals/health-longitudinal.routes.ts','utf8');
  assert.match(page,/<DentalClinicalAlertsPanel patientId=\{selectedPatientId\}/);
  assert.match(panel,/HealthVerticalService\.clinicalFacts\(patientId\)/);
  assert.match(panel,/cg:pwa-session-changed/);
  assert.match(panel,/seq\.current\+=1/);
  assert.match(panel,/Historial incompleto/);
  assert.match(service,/clinicalFacts\(patientId, cursor = ''\)/);
  assert.match(route,/requirePermission\('health.manage'\)/);
  assert.match(route,/Cache-Control', 'no-store'/);
  assert.doesNotMatch(panel,/localStorage\.setItem|innerHTML|querySelector|clinicalFacts.*POST/);
});
