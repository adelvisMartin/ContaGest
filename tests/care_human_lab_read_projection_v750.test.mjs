import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const routes=fs.readFileSync('backend/src/modules/verticals/health-human-lab.routes.ts','utf8');
const root=fs.readFileSync('backend/src/modules/verticals/health.routes.ts','utf8');

test('human lab read uses canonical shared authority with tenant/patient and human-kind predicate',()=>{
  assert.match(root,/humanLabRoutes/);
  assert.match(routes,/requirePermission\('health\.manage'\)/);
  assert.match(routes,/FROM public\."CareLabOrder"/);
  assert.match(routes,/FROM public\."CareLabResult"/);
  assert.match(routes,/p\."kind"='human'/);
  assert.match(routes,/"tenantId"=\$1 AND "id"=\$2/);
  assert.match(routes,/LIMIT 100/);
});

test('human lab never exposes raw attachment storage paths in projection',()=>{
  assert.doesNotMatch(routes,/SELECT \*/);
  assert.doesNotMatch(routes,/"attachmentPath"/);
  assert.match(routes,/Cache-Control', 'no-store'/);
});
