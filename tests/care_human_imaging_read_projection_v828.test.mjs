import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const routes=fs.readFileSync('backend/src/modules/verticals/health-imaging.routes.ts','utf8');
const root=fs.readFileSync('backend/src/modules/verticals/health.routes.ts','utf8');

test('imaging overview only presents tenant-owned human studies and bounded metadata',()=>{
  assert.match(root,/imagingRoutes/);
  assert.match(routes,/requirePermission\('health\.manage'\)/);
  assert.match(routes,/FROM public\."CareDiagnosticStudy"/);
  assert.match(routes,/p\."kind"='human'/);
  assert.match(routes,/s\."tenantId"=\$1 AND s\."patientId"=\$2/);
  assert.match(routes,/LIMIT 100/);
});

test('imaging projection does not return raw storage paths, external URLs or unreviewed narrative',()=>{
  assert.doesNotMatch(routes,/SELECT \*/);
  assert.doesNotMatch(routes,/"attachmentPath"|"externalUrl"/);
  assert.doesNotMatch(routes,/s\."findings"|s\."impression"/);
  assert.match(routes,/Cache-Control', 'no-store'/);
});
