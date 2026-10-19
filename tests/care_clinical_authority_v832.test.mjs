import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generalEncounterCreationError } from '../backend/src/modules/verticals/care-clinical-write-policy.mjs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('generic creation never signs a human encounter, even under another type', () => {
  for (const type of ['consultation', 'anamnesis', 'dental-treatment', 'other']) {
    for (const status of ['signed', 'review', 'amended', 'cancelled']) {
      assert.ok(generalEncounterCreationError({ patientKind:'human', type, status }), `${type}/${status}`);
    }
  }
  assert.equal(generalEncounterCreationError({ patientKind:'human', type:'consultation', status:'draft' }), null);
});

test('ambulatory encounter creation is restricted to its appointment workflow', () => {
  for (const patientKind of ['human','animal']) {
    for (const status of ['draft','signed']) {
      assert.ok(generalEncounterCreationError({ patientKind, type:'ambulatory-visit', status }));
    }
  }
  assert.equal(generalEncounterCreationError({ patientKind:'animal', type:'consultation', status:'signed' }), null);
});

test('generic encounter route checks server patient kind before INSERT', () => {
  const route = read('../backend/src/modules/verticals/health-encounters.routes.ts');
  const patientCheck = route.indexOf('generalEncounterCreationError({ patientKind:patientRows[0].kind');
  const insert = route.indexOf('INSERT INTO public."CareEncounter"');
  assert.ok(patientCheck > 0 && patientCheck < insert);
  assert.match(route, /SELECT "id","kind" FROM public\."CarePatient" WHERE "tenantId"=\$1 AND "id"=\$2/);
});

test('dental signatures require actor-bound active clinical professional inside the transaction', () => {
  const route = read('../backend/src/modules/verticals/health-encounters.routes.ts');
  const helper = route.slice(route.indexOf('async function requireAssignedClinicalProfessional'),route.indexOf("router.get('/health/encounters'"));
  for(const guard of ['"tenantId"=$1','"id"=$2','"userId"=$3',"\"status\"='active'",'NULLIF(trim("licenseNumber")', 'FOR SHARE']){
    assert.ok(helper.includes(guard),guard);
  }
  const lifecycle = route.slice(route.indexOf("router.post('/health/encounters/:id/workflow'"),route.indexOf("router.post('/health/encounters/:id/treatment-plan-decision'"));
  assert.ok(lifecycle.indexOf('requireAssignedClinicalProfessional(')<lifecycle.indexOf('"status"=\'signed\''));
  const plan = route.slice(route.indexOf("router.post('/health/encounters/:id/treatment-plan-decision'"));
  assert.match(plan, /if\(b\.decision==='accepted'\)\{\s*await requireAssignedClinicalProfessional\(/);
});

test('professional directory creation cannot self-link an arbitrary health manager', () => {
  const source = read('../backend/src/modules/verticals/health-core.routes.ts');
  const registration = source.slice(source.indexOf("router.post('/health/professionals'"), source.indexOf("router.get('/health/appointments'"));
  assert.match(registration, /requirePermission\('admin\.manage'\)/);
  assert.match(registration, /VALUES \(gen_random_uuid\(\)::text,\$1,NULL,/);
  assert.doesNotMatch(registration, /ctx\(req\)\.userId/);
});

test('new additive migration removes direct Supabase client table authority for Care', () => {
  const sql = read('../backend/prisma/migrations/20261019150000_care_direct_client_privileges_v832/migration.sql');
  for(const table of ['CareProfessional','CarePatient','CareAppointment','CareEncounter',
    'CarePrescription','CareConsent','CareImmunization','CareHospitalization',
    'CareHospitalObservation','CareLabOrder','CareLabResult','CareDiagnosticStudy']){
    assert.ok(sql.includes(`'${table}'`),table);
  }
  assert.match(sql,/REVOKE ALL PRIVILEGES ON TABLE public\.%I FROM PUBLIC/);
  assert.match(sql,/ARRAY\['anon','authenticated'\]/);
  assert.doesNotMatch(sql,/GRANT .*authenticated|DROP TABLE|DROP POLICY/i);
});
