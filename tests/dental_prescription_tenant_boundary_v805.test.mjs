import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const route=fs.readFileSync('backend/src/modules/verticals/health-extended.routes.ts','utf8');
const start=route.indexOf("router.post('/health/prescriptions'");
const end=route.indexOf("router.get('/health/consents'",start);
const block=route.slice(start,end);
test('prescription insert is one tenant-scoped INSERT SELECT',()=>{
 assert.match(block,/INSERT INTO public\."CarePrescription"/);
 assert.match(block,/SELECT gen_random_uuid\(\)::text, \$1, p\."id"/);
 assert.match(block,/FROM public\."CarePatient" p/);
 assert.match(block,/p\."tenantId"=\$1 AND p\."id"=\$2 AND p\."active"=true/);
});
test('optional encounter must belong to same patient and tenant',()=>{
 assert.match(block,/EXISTS \([\s\S]*?FROM public\."CareEncounter" e[\s\S]*?e\."tenantId"=\$1 AND e\."id"=\$3 AND e\."patientId"=p\."id"/);
});
test('optional professional must belong to tenant',()=>{
 assert.match(block,/FROM public\."CareProfessional" pr[\s\S]*?pr\."tenantId"=\$1 AND pr\."id"=\$4/);
});
test('invalid references cannot produce a fake created response',()=>{
 assert.match(block,/if \(!rows\.length\) throw new HttpError\(422/);
 assert.match(block,/ok\(res, one\(rows\), 201\)/);
 assert.doesNotMatch(block,/INSERT INTO public\."CarePrescription"[\s\S]*?VALUES\s*\(/);
});

test('#805 dental prescription workspace consumes one CarePrescription authority, with session and patient scoping',()=>{
 const src=fs.readFileSync('frontend/src/components/dentistry/DentalPrescriptionPanel.jsx','utf8');
 const page=fs.readFileSync('frontend/src/pages/DentistryPracticePage.jsx','utf8');
 const service=fs.readFileSync('frontend/src/services/verticalService.js','utf8');
 assert.match(page,/<DentalPrescriptionPanel[\s\S]*?patientId=\{selectedPatientId\}/);
 assert.match(src,/HealthVerticalService\.prescriptions\(patientId\)/);
 assert.match(src,/HealthVerticalService\.createPrescription\(payload\)/);
 assert.match(src,/item\?\.patientId===patientId/);
 assert.match(src,/item\?\.status==='signed'/);
 assert.match(src,/identity!==sessionScope\(\)/);
 assert.match(src,/cg:pwa-session-changed/);
 assert.match(src,/cg:auth-expired/);
 assert.match(src,/savingRef\.current/);
 assert.match(src,/no se reenvía automáticamente/);
 assert.match(service,/createPrescription\(payload\)/);
 assert.doesNotMatch(src,/localStorage\.setItem|innerHTML|indexedDB|\.createObjectStore\(/);
});
