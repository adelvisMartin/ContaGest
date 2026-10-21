import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../backend/src/modules/verticals/veterinary-diagnostics.routes.ts',import.meta.url),'utf8');
const list=source.split("router.get('/studies',")[1].split("router.post('/studies',")[0];
const create=source.split("router.post('/studies',")[1].split("export default router")[0];
test('#814 list studies joins patient and professional through study tenant authority',()=>{
 assert.match(list,/JOIN public\."CarePatient" p ON p\."id"=s\."patientId" AND p\."tenantId"=s\."tenantId" AND p\."kind"='animal'/);
 assert.match(list,/LEFT JOIN public\."CareProfessional" pr ON pr\."id"=s\."professionalId" AND pr\."tenantId"=s\."tenantId"/);
 assert.match(list,/WHERE s\."tenantId"=\$1/);
});
test('#814 creating an imaging study checks signed encounter patient and tenant within insert predicate',()=>{
 assert.match(create,/AND \(\$3::text IS NULL OR EXISTS \([\s\S]*?FROM public\."CareEncounter" e[\s\S]*?e\."tenantId"=\$1 AND e\."id"=\$3 AND e\."patientId"=p\."id"/);
});
test('#814 creating study checks professional belongs to server tenant',()=>{
 assert.match(create,/AND \(\$4::text IS NULL OR EXISTS \([\s\S]*?FROM public\."CareProfessional" pr[\s\S]*?pr\."tenantId"=\$1 AND pr\."id"=\$4/);
});
test('#814 rejects phantom rows fail-closed without leaking whether patient or staff exists in another tenant',()=>{
 assert.match(create,/if \(!rows\.length\) throw new HttpError\(422/);
 assert.doesNotMatch(create,/SELECT \* FROM public\."CareEncounter" WHERE "id"=\$3(?! AND "tenantId")/);
 assert.match(create,/b\.encounterId \|\| null, b\.professionalId \|\| null/);
});
test('#814 same SQL insert keeps no extra clinical write/alternate source of truth',()=>{
 assert.equal((create.match(/INSERT INTO public\."CareDiagnosticStudy"/g)||[]).length,1);
 assert.match(create,/FROM public\."CarePatient" p/);
 assert.match(create,/p\."kind"='animal'/);
});
