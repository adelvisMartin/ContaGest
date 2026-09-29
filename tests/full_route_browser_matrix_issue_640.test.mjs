import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(file)=>fs.readFileSync(file,'utf8');

test('#640 matrix derives all 58 routes from the existing canonical visual catalog',async()=>{
  const contract=await import('../qa/support/full-route-browser-contract-v640.mjs');
  assert.equal(contract.FULL_ROUTE_BROWSER_CONTRACT.routes.length,58);
  assert.equal(new Set(contract.FULL_ROUTE_BROWSER_CONTRACT.routes).size,58);
  assert.deepEqual(contract.FULL_ROUTE_BROWSER_CONTRACT.themes,['light','dark','system']);
  assert.deepEqual(contract.FULL_ROUTE_BROWSER_CONTRACT.motion,['normal','reduced']);
  for(const width of [360,390,430,768,1024,1366,1440,1920]){
    assert.ok(contract.FULL_ROUTE_BROWSER_CONTRACT.viewports.some((item)=>item.width===width),`missing viewport ${width}`);
  }
});

test('#640 runner supports full/affected and advisory browser profiles without sleeps or force',()=>{
  const runner=read('scripts/full-route-browser-matrix-v640.mjs');
  assert.match(runner,/affected/);
  assert.match(runner,/full/);
  assert.match(runner,/chromium/);
  assert.match(runner,/firefox/);
  assert.match(runner,/webkit/);
  assert.match(runner,/CG_AFFECTED_ROUTES/);
  assert.match(runner,/artifacts\/browser-matrix/);
  assert.doesNotMatch(runner,/waitForTimeout|\.skip\(|--force|force:\s*true/);
});

test('#640 package and local verification expose canonical route-matrix entrypoints',()=>{
  const pkg=JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['qa:browser:routes:affected'],'node scripts/full-route-browser-matrix-v640.mjs affected chromium');
  assert.equal(pkg.scripts['qa:browser:routes:full'],'node scripts/full-route-browser-matrix-v640.mjs full chromium');
  assert.equal(pkg.scripts['qa:browser:routes:firefox'],'node scripts/full-route-browser-matrix-v640.mjs full firefox');
  assert.equal(pkg.scripts['qa:browser:routes:webkit'],'node scripts/full-route-browser-matrix-v640.mjs full webkit');
  const local=read('scripts/local-verification-runner-v630.mjs');
  assert.match(local,/['"]ui-routes['"]/);
  assert.match(local,/npm run qa:browser:routes:full/);
});

test('#640 contract is wired into the authoritative contract runner',()=>{
  const suite=read('scripts/run-authoritative-contracts.mjs');
  assert.match(suite,/tests\/full_route_browser_matrix_issue_640\.test\.mjs/);
});
