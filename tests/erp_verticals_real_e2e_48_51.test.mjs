import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read=(path)=>fs.readFileSync(path,'utf8');

test('48/51 workflow uses a real ephemeral PostgreSQL 17 service and exact candidate SHA',()=>{
  const source=read('.github/workflows/erp-verticals-real-e2e-v4851.yml');
  for(const token of ['postgres:17-alpine','contagest_verticals_e2e','CANDIDATE_SHA','git rev-parse HEAD','prisma:deploy','npm run seed','test:backend:verticals:real','upload-artifact@v7']) assert.ok(source.includes(token),token);
  assert.doesNotMatch(source,/mock-server|API_MODE:\s*mock|continue-on-error:\s*true/i);
});

test('48/51 real test covers all three verticals, permission denial, tenant isolation, restart persistence and cleanup',()=>{
  const source=read('qa/verticals-backend-real-v4851.test.ts');
  for(const token of [
    '/verticals/health/patients',
    '/verticals/health/encounters',
    '/verticals/veterinary/hospitalizations',
    '/verticals/gym/members',
    '/verticals/gym/assessments',
    'permission denial is real',
    'foreign-tenant fixtures',
    'server restart proves data persistence',
    't.after(async()=>'
  ]) assert.ok(source.includes(token),token);
  assert.match(source,/createRealBackendHarness\(\)/);
  assert.match(source,/signAccessToken/);
  assert.doesNotMatch(source,/ALLOW_DEV_TENANT_HEADER[^\n]*true|SUPABASE_AUTH_FALLBACK[^\n]*true/);
});

test('48/51 cleanup inventory is fail-visible rather than hidden',()=>{
  const workflow=read('.github/workflows/erp-verticals-real-e2e-v4851.yml');
  assert.match(workflow,/qa48_care_patients/);
  assert.match(workflow,/qa48_gym_members/);
  assert.match(workflow,/if:\s*always\(\)/);
});

test('48/51 gym assessment creation enforces tenant ownership before insert',()=>{
  const source=read('backend/src/modules/verticals/gym.routes.ts');
  const start=source.indexOf("router.post('/gym/assessments'");
  const end=source.indexOf("router.get('/gym/exercises'",start);
  const block=source.slice(start,end);
  assert.match(block,/GymMember/);
  assert.match(block,/GymTrainer/);
  assert.match(block,/El cliente no pertenece al tenant activo/);
  assert.match(block,/El entrenador no pertenece al tenant activo/);
});
