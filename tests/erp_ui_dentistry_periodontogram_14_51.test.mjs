import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { healthBackendSource } from '../qa/support/vertical-authority-sources.mjs';

const backend=()=>healthBackendSource();
const page=()=>fs.readFileSync('frontend/src/pages/DentistryPracticePage.jsx','utf8');
const panel=()=>fs.readFileSync('frontend/src/components/dentistry/PeriodontalChartPanel.jsx','utf8');

test('14/51 validates a structured six-site periodontogram on dental encounters',()=>{
  const source=backend();
  for(const token of ['periodontalClinicalDataSchema','periodontalSiteSchema','periodontogram','probingDepthMm','gingivalMarginMm','bleeding','suppuration','plaque','mobilityGrade','furcationGrade']) assert.ok(source.includes(token),token);
  for(const site of ['mesiobuccal','midbuccal','distobuccal','mesiolingual','midlingual','distolingual']) assert.ok(source.includes(site),site);
  assert.match(source,/\.length\(6\)/);
  assert.match(source,/new Set\(value\.sites\.map/);
  assert.match(source,/value\.type\s*===\s*'periodontal-chart'/);
});

test('14/51 periodontogram uses existing CareEncounter authority and no parallel endpoint',()=>{
  const source=page();
  assert.match(source,/HealthVerticalService\.createEncounter\(/);
  assert.match(source,/type:'periodontal-chart'/);
  assert.match(source,/status:'signed'/);
  assert.match(source,/clinicalData:\{periodontogram:/);
  assert.doesNotMatch(source,/createPeriodontogram|PeriodontogramService/);
});

test('14/51 UI captures six sites and tooth-level mobility/furcation accessibly',()=>{
  const source=panel();
  for(const token of ['PERIODONTAL_SITES','probingDepthMm','gingivalMarginMm','bleeding','suppuration','plaque','mobilityGrade','furcationGrade','aria-pressed']) assert.ok(source.includes(token),token);
  assert.match(source,/minHeight:\s*44|minHeight:\s*'44px'/);
  assert.doesNotMatch(source,/querySelector|addEventListener|innerHTML/);
});

test('14/51 exposes periodontal evolution by comparing signed charts for the same tooth',()=>{
  const source=panel();
  for(const token of ['previousSameTooth','maxProbingDepth','maxAttachmentLevel','bleedingSites','plaqueSites','deltaLabel','Evolución periodontal']) assert.ok(source.includes(token),token);
});

test('14/51 shared tooth catalog remains the source for permanent and primary dentition',()=>{
  const source=page()+panel();
  assert.match(source,/PERMANENT_TEETH/);
  assert.match(source,/PRIMARY_TEETH/);
});
