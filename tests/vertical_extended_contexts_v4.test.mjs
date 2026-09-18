import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=(relativePath)=>fs.readFileSync(path.join(root,relativePath),'utf8');
const routesOf=(relativePath)=>[...read(relativePath).matchAll(/\brouter\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g)]
  .map((match)=>`${match[1].toUpperCase()} ${match[2]}`);

const healthExtendedRoutes=[
  'GET /health/prescriptions',
  'POST /health/prescriptions',
  'GET /health/consents',
  'POST /health/consents'
];

const gymExtendedRoutes=[
  'GET /gym/payments',
  'POST /gym/payments',
  'GET /gym/classes/:classId/bookings',
  'POST /gym/classes/bookings',
  'PATCH /gym/memberships/:id/status'
];

test('vertical extended aggregator preserves tenant gate and bounded-context order',()=>{
  const source=read('backend/src/modules/verticals/verticals-extended.routes.ts');
  assert.match(source,/import healthExtendedRoutes from '\.\/health-extended\.routes\.js';/);
  assert.match(source,/import gymExtendedRoutes from '\.\/gym-extended\.routes\.js';/);
  const tenant=source.indexOf('router.use(requireTenant)');
  const health=source.indexOf('router.use(healthExtendedRoutes)');
  const gym=source.indexOf('router.use(gymExtendedRoutes)');
  assert.ok(tenant>=0&&tenant<health&&health<gym);
  assert.doesNotMatch(source,/router\.(?:get|post|put|patch|delete)\(/);
});

test('health extended context preserves exact legacy route order',()=>{
  assert.deepEqual(routesOf('backend/src/modules/verticals/health-extended.routes.ts'),healthExtendedRoutes);
});

test('gym extended context preserves exact legacy route order',()=>{
  assert.deepEqual(routesOf('backend/src/modules/verticals/gym-extended.routes.ts'),gymExtendedRoutes);
});

test('extended child routers inherit tenant context and retain explicit permission gates',()=>{
  for(const relativePath of [
    'backend/src/modules/verticals/health-extended.routes.ts',
    'backend/src/modules/verticals/gym-extended.routes.ts'
  ]){
    const source=read(relativePath);
    assert.doesNotMatch(source,/router\.use\(requireTenant\)/);
    assert.match(source,/requirePermission\(/);
    assert.match(source,/from '\.\/verticals\.shared\.js';/);
    assert.match(source,/export default router;/);
  }
});
