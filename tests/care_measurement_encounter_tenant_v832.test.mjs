import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const file=fs.readFileSync('backend/src/modules/verticals/health-measurements.routes.ts','utf8');
const start=file.indexOf("router.post('/health/measurements',");
const end=file.indexOf("router.post('/health/measurements/veterinary-vitals'",start);
const src=file.slice(start,end);
test('measurement POST checks patient within tenant before write',()=>{
 assert.match(src,/CarePatient/);
 assert.match(src,/WHERE "tenantId"=\$1 AND "id"=\$2/);
});
test('optional encounter checks tenant AND patient before INSERT',()=>{
 assert.match(src,/if\(b\.encounterId\)/);
 assert.match(src,/FROM public\."CareEncounter"/);
 assert.match(src,/WHERE "tenantId"=\$1 AND "id"=\$2 AND "patientId"=\$3/);
 assert.ok(src.indexOf('if(b.encounterId)')<src.indexOf('INSERT INTO public."CareMeasurement"'));
});
test('not-found or cross-patient encounter fails before mutation',()=>{
 assert.match(src,/if\(!encounterRows\.length\)throw new HttpError\(422/);
});
test('the measurement and tenant parameters remain server-owned',()=>{
 assert.match(src,/tenantId,b\.encounterId,b\.patientId/);
 assert.match(src,/tenantId,b\.patientId,b\.encounterId\|\|null/);
});
