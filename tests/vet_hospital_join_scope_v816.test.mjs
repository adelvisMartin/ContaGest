import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../backend/src/modules/verticals/veterinary-hospitalization.routes.ts',import.meta.url),'utf8');
const query=source.split("router.get('/hospitalizations',")[1].split("router.post('/hospitalizations',")[0];
test('#816 hospital patient name/species joins must be tenant scoped',()=>{
 assert.match(query,/JOIN public\."CarePatient" p ON p\."id"=h\."patientId" AND p\."tenantId"=h\."tenantId" AND p\."kind"='animal'/);
});
test('#816 observation count cannot include another tenant with same hospital ID',()=>{
 assert.match(query,/LEFT JOIN public\."CareHospitalObservation" o ON o\."hospitalizationId"=h\."id" AND o\."tenantId"=h\."tenantId"/);
 assert.match(query,/count\(o\."id"\)::int AS "observationCount"/);
});
test('#816 professional display name remains tenant scoped',()=>{
 assert.match(query,/LEFT JOIN public\."CareProfessional" pr ON pr\."id"=h\."professionalId" AND pr\."tenantId"=h\."tenantId"/);
 assert.match(query,/WHERE h\."tenantId"=\$1/);
});
test('#816 only read path altered: no child cross-tenant join by ID',()=>{
 assert.doesNotMatch(query,/JOIN public\."CarePatient" p ON p\."id"=h\."patientId" AND p\."kind"/);
 assert.doesNotMatch(query,/JOIN public\."CareHospitalObservation" o ON o\."hospitalizationId"=h\."id"\s*\n/);
 assert.match(source,/router\.patch\('\/hospitalizations\/:id\/status'/);
});
