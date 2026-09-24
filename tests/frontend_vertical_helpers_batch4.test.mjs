import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read=(path)=>fs.readFileSync(path,'utf8');

test('batch 4 extracts pure Dentistry workspace helpers',()=>{
  const page=read('frontend/src/pages/DentistryPracticePage.jsx');
  const helpers=read('frontend/src/components/dentistry/dentistryWorkspace.helpers.js');
  assert.match(page,/dentistryWorkspace\.helpers\.js/);
  for(const token of ['PROCEDURES','SPECIALTIES','rows','patientName']) assert.match(helpers,new RegExp(`export const ${token}\\b`),token);
  assert.doesNotMatch(helpers,/React|useState|useEffect|VerticalService|MediaService|fetch\(/);
  assert.doesNotMatch(page,/const PROCEDURES=|const SPECIALTIES=|const rows=|const patientName=/);
  assert.match(page,/function DentistryWorkspace/);
});

test('batch 4 extracts pure Veterinary workspace helpers while preserving the single renderer owner',()=>{
  const workspace=read('frontend/src/components/veterinary/VeterinaryWorkspace.jsx');
  const helpers=read('frontend/src/components/veterinary/veterinaryWorkspace.helpers.js');
  assert.match(workspace,/veterinaryWorkspace\.helpers\.js/);
  for(const token of ['TABS','STATUS_TONE','MONTHS','compactDate','onlyDate','phoneDigits','displayError','reportVeterinaryError','arrayData','objectData','shortCode','localDateTime','localDateTimeFromIso']){
    assert.match(helpers,new RegExp(`export const ${token}\\b`),token);
  }
  assert.doesNotMatch(helpers,/<[A-Za-z]|React|useState|useEffect|VerticalService|BackendApi|fetch\(/);
  assert.doesNotMatch(workspace,/const TABS =|const STATUS_TONE =|const MONTHS =|const arrayData =|const objectData =/);
  assert.match(workspace,/export function VeterinaryWorkspace/);
  assert.match(workspace,/const Icon =/);
});

test('batch 4 extracts pure Gym workspace helpers without moving state ownership',()=>{
  const page=read('frontend/src/pages/GymManagementPage.jsx');
  const helpers=read('frontend/src/components/fitness/gymWorkspace.helpers.js');
  assert.match(page,/gymWorkspace\.helpers\.js/);
  for(const token of ['rows','object','localDate','localDateTime','amount','memberOptions','trainerOptions','planOptions','MONTHS']){
    assert.match(helpers,new RegExp(`export const ${token}\\b`),token);
  }
  assert.doesNotMatch(helpers,/React|useState|useEffect|GymVerticalService|BackendApi|fetch\(/);
  assert.doesNotMatch(page,/const rows=|const object=|const localDate=|const localDateTime=|const amount=|const memberOptions=|const trainerOptions=|const planOptions=/);
  assert.match(page,/function GymWorkspace/);
});

test('implementation audit preserves prior status and records batch 4 review history',()=>{
  const manifest=JSON.parse(read('config/implementation-roadmap-1-58.json'));
  const expected=[3,...Array.from({length:11},(_,i)=>10+i),...Array.from({length:12},(_,i)=>21+i),...Array.from({length:15},(_,i)=>33+i)];
  const actual=manifest.implementations
    .filter((row)=>(row.reviewBatches||[]).includes('CLEAN_CODE_BATCH_4_FRONTEND_HELPERS'))
    .map((row)=>row.id);
  assert.deepEqual(actual,expected);
  assert.equal(manifest.implementations.find((row)=>row.id===38).reviewStatus,'CLEAN_CODE_BATCH_1');
  assert.equal(manifest.implementations.find((row)=>row.id===11).reviewStatus,'CLEAN_CODE_BATCH_3_SCHEMA_AUTHORITY');
});
