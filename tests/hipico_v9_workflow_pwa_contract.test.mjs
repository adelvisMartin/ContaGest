import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (relative) => readFile(new URL(`../${relative}`, import.meta.url), 'utf8');

test('v9 manual release workflow can supply explicit P0 and security-critical evidence without client authority changes', async () => {
  const workflow = await read('.github/workflows/hipico-production-gates-v290.yml');
  for (const input of ['p0_open', 'security_critical', 'physical_qa_status']) {
    assert.ok(workflow.includes(`${input}:`), `workflow_dispatch input missing: ${input}`);
  }
  assert.match(workflow, /HIPICO_P0_OPEN:/);
  assert.match(workflow, /HIPICO_SECURITY_CRITICAL:/);
  assert.match(workflow, /HIPICO_PHYSICAL_QA_STATUS:/);
  assert.doesNotMatch(workflow, /HIPICO_AUTOMATIC_OWNER_APPROVED:\s*\$\{\{ inputs\./);
});

test('PWA update and cloud version conflict paths are fail-safe and preserve local recovery before retry', async () => {
  const [app, supabase, sw] = await Promise.all([
    read('frontend/public/hipico-control/assets/js/app.js'),
    read('frontend/public/hipico-control/assets/js/supabase.js'),
    read('frontend/public/hipico-control/sw.js')
  ]);

  assert.match(app, /navigator\.serviceWorker\.register/);
  assert.match(app, /registration\.addEventListener\("updatefound"/);
  assert.match(app, /actualización lista/i);
  assert.match(app, /isVersionConflict\(error\)/);
  assert.match(app, /createSnapshot\(workspace, "conflicto-nube-reintento"\)/);
  assert.match(app, /mergeWorkspaces\(workspace, remote\.state\)/);
  assert.match(app, /return saveCloudWorkspace\(workspace, cloudWorkspaceId, Number\(remote\.version \|\| 0\)\)/);

  assert.match(supabase, /HIPICO_VERSION_CONFLICT/);
  assert.match(supabase, /error\.code\) === "40001"/);
  assert.match(sw, /cache:\s*'no-store'/);
  assert.match(sw, /build-info\.json/);
});
