import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { matchesActiveVeterinaryPatient } from '../frontend/src/components/veterinary/veterinary-patient-scope.mjs';

const valid={requestPatientId:'animal-a',activePatientId:'animal-a',requestEpoch:4,currentEpoch:4,
 requestScope:'tenant-a:user-a',currentScope:'tenant-a:user-a'};

test('#810 matching patient + tenant/user + request version allows one clinical read',()=>{
 assert.equal(matchesActiveVeterinaryPatient(valid),true);
});
test('#810 stale patient, session and old request results fail closed',()=>{
 for(const changed of [
  {activePatientId:'animal-b'},{currentEpoch:5},{requestScope:'tenant-b:user-a'},
  {currentScope:'tenant-a:user-b'},{currentScope:''},{activePatientId:''}
 ])assert.equal(matchesActiveVeterinaryPatient({...valid,...changed}),false);
});
test('#810 dossier prevents late patient history and cross-patient mutation rendering',()=>{
 const code=readFileSync('frontend/src/pages/VeterinaryClinicPageV1123.jsx','utf8');
 assert.match(code,/selectedIdRef\.current=patientId/);
 assert.match(code,/historyEpochRef\.current\+=1/);
 assert.match(code,/if\(!allowsResult\(patientId,epoch,scope\)\)return false/);
 assert.match(code,/cg:pwa-session-changed/);
 assert.match(code,/cg:auth-expired/);
 assert.match(code,/record\?\.patientId!==selectedIdRef\.current/);
 assert.match(code,/item\.patientId===selectedIdRef\.current/);
 assert.match(code,/onClick=\{\(\)=>selectPatient\(item\.id\)\}/);
});
