import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const src=fs.readFileSync('backend/src/modules/verticals/health-encounters.routes.ts','utf8');
const list=src.slice(src.indexOf("router.get('/health/encounters'"),src.indexOf("router.post('/health/encounters'"));
const insert=src.slice(src.indexOf("router.post('/health/encounters'"),src.indexOf("router.post('/health/encounters/:id/amend'"));
test('encounter list professional join is tenant aligned',()=>{assert.match(list,/pr\."tenantId"=e\."tenantId" AND pr\."id"=e\."professionalId"/)});
test('creation verifies appointment ID is owned by same tenant and patient',()=>{
 assert.match(insert,/if\(b\.appointmentId\)/);
 assert.match(insert,/FROM public\."CareAppointment"/);
 assert.match(insert,/WHERE "tenantId"=\$1 AND "id"=\$2 AND "patientId"=\$3/);
 assert.match(insert,/tenantId,b\.appointmentId,b\.patientId/);
});
test('appointment refusal occurs before clinical INSERT',()=>{
 assert.match(insert,/if\(!appointmentRows\.length\)throw new HttpError\(422/);
 assert.ok(insert.indexOf('if(b.appointmentId)')<insert.indexOf('INSERT INTO public."CareEncounter"'));
});
test('existing signed dental and patient scope controls are preserved',()=>{
 assert.match(insert,/WHERE "tenantId"=\$1 AND "id"=\$2 LIMIT 1/);
 assert.match(insert,/careAnamnesisClinicalDataSchema\.parse/);
 assert.match(insert,/encounterStatus/);
});
