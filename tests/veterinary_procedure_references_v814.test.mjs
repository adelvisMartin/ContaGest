import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../backend/src/modules/verticals/veterinary-patients.routes.ts',import.meta.url),'utf8');
const read=source.split("router.get('/procedures'")[1].split("router.post('/procedures'")[0];
const write=source.split("router.post('/procedures'")[1].split('export default router;')[0];

test('#810/#814 procedure reads join patient/professional by tenant and remain scoped',()=>{
  assert.match(read,/JOIN public\."CarePatient" p ON p\."id"=c\."patientId" AND p\."tenantId"=c\."tenantId"/);
  assert.match(read,/LEFT JOIN public\."CareProfessional" pr ON pr\."id"=c\."professionalId" AND pr\."tenantId"=c\."tenantId"/);
  assert.match(read,/WHERE c\."tenantId"=\$1/);
  assert.doesNotMatch(read,/SELECT p\.\*/);
});

test('#814 validates encounter patient and tenant before inserting veterinary procedure',()=>{
  const transaction=write.indexOf('prisma.$transaction(async(tx)=>');
  const patient=write.indexOf('FROM public."CarePatient"');
  const encounter=write.indexOf('FROM public."CareEncounter"');
  const professional=write.indexOf('FROM public."CareProfessional"');
  const insert=write.indexOf('INSERT INTO public."CareProcedure"');
  assert.ok(transaction>=0&&patient>transaction&&encounter>patient&&
    professional>encounter&&insert>professional);
  assert.match(write,/WHERE "tenantId"=\$1 AND "id"=\$2 AND "kind"='animal' AND "active"=true/);
  assert.match(write,/WHERE "tenantId"=\$1 AND "patientId"=\$2 AND "id"=\$3 FOR SHARE/);
  assert.match(write,/WHERE "tenantId"=\$1 AND "id"=\$2 FOR SHARE/);
  assert.match(write,/if\(encounters\.length!==1\)/);
  assert.match(write,/if\(professionals\.length!==1\)/);
  assert.match(write,/WHERE "tenantId"=\$1/);
  assert.match(write,/ok\(res,created,201\)/);
  assert.doesNotMatch(write,/await prisma\.\$(?:queryRawUnsafe|executeRawUnsafe)/);
});
