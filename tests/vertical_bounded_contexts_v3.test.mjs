import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=(relativePath)=>fs.readFileSync(path.join(root,relativePath),'utf8');
const routesOf=(relativePath)=>[...read(relativePath).matchAll(/\brouter\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g)]
  .map((match)=>`${match[1].toUpperCase()} ${match[2]}`);

const healthRoutes=[
  'GET /health/summary',
  'GET /health/patients',
  'POST /health/patients',
  'GET /health/professionals',
  'POST /health/professionals',
  'GET /health/appointments',
  'POST /health/appointments',
  'GET /health/encounters',
  'POST /health/encounters',
  'POST /health/measurements',
  'POST /health/immunizations'
];

const gymRoutes=[
  'GET /gym/summary',
  'GET /gym/members',
  'POST /gym/members',
  'GET /gym/trainers',
  'POST /gym/trainers',
  'GET /gym/plans',
  'POST /gym/plans',
  'POST /gym/memberships',
  'POST /gym/checkins',
  'GET /gym/assessments',
  'POST /gym/assessments',
  'GET /gym/routines',
  'POST /gym/routines',
  'GET /gym/nutrition',
  'POST /gym/nutrition',
  'GET /gym/classes',
  'POST /gym/classes'
];

const communicationRoutes=[
  'GET /communications/templates',
  'POST /communications/templates',
  'POST /communications/render'
];

test('vertical aggregator preserves tenant gate and bounded-context mount order',()=>{
  const source=read('backend/src/modules/verticals/verticals.routes.ts');
  assert.match(source,/import healthRoutes from '\.\/health\.routes\.js';/);
  assert.match(source,/import gymRoutes from '\.\/gym\.routes\.js';/);
  assert.match(source,/import communicationRoutes from '\.\/communications\.routes\.js';/);
  const tenant=source.indexOf('router.use(requireTenant)');
  const health=source.indexOf('router.use(healthRoutes)');
  const gym=source.indexOf('router.use(gymRoutes)');
  const communications=source.indexOf('router.use(communicationRoutes)');
  assert.ok(tenant>=0&&tenant<health&&health<gym&&gym<communications);
  assert.doesNotMatch(source,/router\.(?:get|post|put|patch|delete)\(/);
});

test('health bounded context preserves exact legacy route order',()=>{
  assert.deepEqual(routesOf('backend/src/modules/verticals/health.routes.ts'),healthRoutes);
});

test('gym bounded context preserves exact legacy route order',()=>{
  assert.deepEqual(routesOf('backend/src/modules/verticals/gym.routes.ts'),gymRoutes);
});

test('communications bounded context preserves exact legacy route order',()=>{
  assert.deepEqual(routesOf('backend/src/modules/verticals/communications.routes.ts'),communicationRoutes);
});

test('child routers inherit tenant context and retain explicit permission gates',()=>{
  for(const relativePath of [
    'backend/src/modules/verticals/health.routes.ts',
    'backend/src/modules/verticals/gym.routes.ts',
    'backend/src/modules/verticals/communications.routes.ts'
  ]){
    const source=read(relativePath);
    assert.doesNotMatch(source,/router\.use\(requireTenant\)/);
    assert.match(source,/requirePermission\(/);
    assert.match(source,/export default router;/);
  }
});

test('shared vertical helpers remain isolated from route ownership',()=>{
  const source=read('backend/src/modules/verticals/verticals.shared.ts');
  for(const name of ['optionalText','dateText','jsonRecord','jsonArray','ctx','one','num']){
    assert.match(source,new RegExp(`export const ${name}\\b`));
  }
  assert.doesNotMatch(source,/Router\(/);
});
