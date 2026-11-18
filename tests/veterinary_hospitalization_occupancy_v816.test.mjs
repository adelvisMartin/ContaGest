import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 veterinaryHospitalStatusTransitionAllowed as allowed,
 veterinaryHospitalCageLockKey as cageKey
} from '../backend/src/modules/verticals/veterinary-hospitalization-policy.mjs';

const source=readFileSync(new URL('../backend/src/modules/verticals/veterinary-hospitalization.routes.ts',import.meta.url),'utf8');
const create=source.split("router.post('/hospitalizations'")[1].split("router.patch('/hospitalizations/:id/status'")[0];
const patch=source.split("router.patch('/hospitalizations/:id/status'")[1].split('export default router;')[0];

test('#816 terminal states cannot reoccupy a cage; only valid admissions advance',()=>{
  for(const next of ['observed','discharged','transferred','cancelled'])
    assert.equal(allowed('admitted',next),true);
  for(const next of ['discharged','transferred','cancelled'])
    assert.equal(allowed('observed',next),true);
  for(const previous of ['discharged','transferred','cancelled'])
    for(const next of ['admitted','observed','discharged','transferred','cancelled'])
      assert.equal(allowed(previous,next),false,previous+' -> '+next);
  assert.equal(allowed('observed','admitted'),false);
  assert.equal(allowed('admitted','admitted'),false);
  assert.equal(allowed('UNKNOWN','discharged'),false);
});

test('#816 cage locks are tenant-scoped, insensitive to case/whitespace and require ward+cage',()=>{
  assert.equal(cageKey('tenant-A','Ward 1','Cage 1'),
    cageKey('tenant-A',' ward 1 ',' CAGE 1 '));
  assert.notEqual(cageKey('tenant-A','ward','cage'),
    cageKey('tenant-B','ward','cage'));
  assert.notEqual(cageKey('tenant-A','ward 1','cage'),
    cageKey('tenant-A','ward 2','cage'));
  for(const vals of [['tenant','', 'cage'],['tenant','ward',''],['','ward','cage']])
    assert.throws(()=>cageKey(...vals),/VET_CAGE_LOCK_KEY_INVALID/);
});

test('#816 admissions serialize patient and physical cage before inserts',()=>{
  assert.match(create,/prisma\.\$transaction\(async tx=>/);
  assert.match(create,/status!=='admitted'/);
  assert.match(create,/Boolean\(ward\)!==Boolean\(cage\)/);
  assert.match(create,/veterinaryHospitalCageLockKey\(tenantId,ward,cage\)/);
  assert.match(create,/SELECT pg_advisory_xact_lock\(hashtextextended\(\$1,0\)\)::text AS locked/);
  assert.match(create,/WHERE "tenantId"=\$1 AND "patientId"=\$2 AND "status" IN \('admitted','observed'\)/);
  assert.match(create,/lower\(btrim\("cage"\)\)=lower\(\$3\)/);
  assert.match(create,/if\(occupied\.length\)throw new HttpError\(409/);
  assert.match(create,/WHERE "tenantId"=\$1 AND "id"=\$2 AND "kind"='animal' AND "active"=true/);
  assert.match(create,/throw new HttpError\(404,'Mascota no encontrada\.'/);
  const occupied=create.indexOf('if(occupied.length)');
  const insert=create.indexOf('INSERT INTO public."CareHospitalization"');
  assert.ok(insert>occupied,'reject occupied cage before write');
});

test('#816 status mutations lock the row and preserve terminal transitions',()=>{
  assert.match(patch,/prisma\.\$transaction\(async tx=>/);
  assert.match(patch,/WHERE "tenantId"=\$1 AND "id"=\$2 FOR UPDATE/);
  assert.match(patch,/veterinaryHospitalStatusTransitionAllowed\(current\.status,b\.status\)/);
  assert.match(patch,/if\(current\.status===b\.status\)/);
  assert.match(patch,/WHERE "id"=\$1 AND "tenantId"=\$2 AND "status"=\$6/);
  assert.match(patch,/if\(changed\.length!==1\)throw new HttpError\(409/);
  assert.match(patch,/b\.dischargedAt&&b\.status!=='discharged'/);
});


test('#816 observations cannot race a terminal hospitalization status transition',()=>{
  const patientRoutes=readFileSync(
    new URL('../backend/src/modules/verticals/veterinary-patients.routes.ts',import.meta.url),'utf8');
  const observation=patientRoutes.split("router.post('/observations'")[1]
    .split("router.get('/procedures'")[0];
  const transaction=observation.indexOf('prisma.$transaction(async(tx)=>');
  const lock=observation.indexOf('FOR SHARE');
  const insert=observation.indexOf('INSERT INTO public."CareHospitalObservation"');
  assert.ok(transaction>=0&&lock>transaction&&insert>lock,
    'Lock admission before persisting observation');
  assert.match(observation,/FROM public\."CareHospitalization"/);
  assert.match(observation,/WHERE "tenantId"=\$1 AND "id"=\$2 AND "status" IN \('admitted','observed'\)/);
  assert.match(observation,/WHERE "tenantId"=\$1 AND "id"=\$2 AND "status" IN \('admitted','observed'\)\s+FOR SHARE/);
  assert.match(observation,/FROM public\."CareProfessional"/);
  assert.match(observation,/tx\.\$queryRawUnsafe/);
  assert.doesNotMatch(observation,/await prisma\.\$queryRawUnsafe/);
  assert.match(patch,/WHERE "tenantId"=\$1 AND "id"=\$2 FOR UPDATE/);
});
