import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../backend/src/modules/verticals/veterinary-diagnostics.routes.ts',import.meta.url),'utf8');
const create=source.split("router.post('/lab-orders'")[1].split("router.get('/lab-results'")[0];

test('#814 lab order validates patient, encounter and clinician within one transaction',()=>{
  const tx=create.indexOf('prisma.$transaction(async (tx) => {');
  const patient=create.indexOf('FROM public."CarePatient"');
  const encounter=create.indexOf('FROM public."CareEncounter"');
  const professional=create.indexOf('FROM public."CareProfessional"');
  const insert=create.indexOf('INSERT INTO public."CareLabOrder"');
  const resultInsert=create.indexOf('INSERT INTO public."CareLabResult"');
  assert.ok(tx>=0&&patient>tx&&encounter>patient&&professional>encounter&&
    insert>professional&&resultInsert>insert,'both clinical links and results must share transaction');
  assert.match(create,/WHERE "tenantId"=\$1 AND "id"=\$2 AND "kind"='animal' AND "active"=true\s+FOR SHARE/);
  assert.match(create,/WHERE "tenantId"=\$1 AND "patientId"=\$2 AND "id"=\$3\s+FOR SHARE/);
  assert.match(create,/WHERE "tenantId"=\$1 AND "id"=\$2 FOR SHARE/);
  assert.match(create,/throw new HttpError\(404,'Mascota activa no encontrada\.'\)/);
  assert.match(create,/throw new HttpError\(422,'El encuentro no pertenece a la mascota activa\.'\)/);
  assert.match(create,/throw new HttpError\(422,'El profesional no pertenece al tenant activo\.'\)/);
  assert.doesNotMatch(create,/await prisma\.\$queryRawUnsafe/);
  assert.equal((create.match(/INSERT INTO public\."CareLabOrder"/g)||[]).length,1);
  assert.equal((create.match(/INSERT INTO public\."CareLabResult"/g)||[]).length,1);
});

test('#814 lab results keep the existing tenant-scoped order authority',()=>{
  const result=source.split("router.post('/lab-results'")[1].split("router.get('/studies'")[0];
  assert.match(result,/WHERE "tenantId"=\$1 AND "id"=\$2\s+FOR UPDATE/);
  assert.match(result,/WHERE "tenantId"=\$1 AND "id"=\$2 AND "labOrderId"=\$3/);
  assert.match(result,/WHERE "id"=\$1 AND "tenantId"=\$2/);
  assert.match(result,/pendingCount===0\?'completed':'processing'/);
});
