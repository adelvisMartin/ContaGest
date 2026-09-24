import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const pkg=JSON.parse(fs.readFileSync(new URL('../frontend/package.json',import.meta.url),'utf8'));
const runner=fs.readFileSync(new URL('../frontend/scripts/vercel-build.mjs',import.meta.url),'utf8');

test('59/75 frontend build uses the staged Vercel runner',()=>{
  assert.equal(pkg.scripts.build,'node scripts/vercel-build.mjs');
});

test('59/75 staged runner preserves every previous frontend build gate in order',()=>{
  const ordered=[
    "id:'identity', command:'npm', args:['run','build:identity']",
    "id:'source-qa', command:'npm', args:['run','preqa:source']",
    "id:'browser-qa', command:'npm', args:['run','preqa:browser']",
    "id:'backend-stage', command:'npm', args:['run','stage:backend']",
    "id:'vite-build', command:'vite', args:['build']"
  ];
  let previous=-1;
  for(const contract of ordered){
    const index=runner.indexOf(contract);
    assert.ok(index>previous,`missing or reordered build stage: ${contract}`);
    previous=index;
  }
});

test('59/75 runner is fail-fast and does not downgrade failing stages',()=>{
  assert.match(runner,/if \(!runStage\(stages\[index\], index\)\) break;/);
  assert.match(runner,/result\.status !== 0/);
  assert.match(runner,/process\.exitCode = Number\(result\.status \|\| 1\)/);
  assert.doesNotMatch(runner,/allowFailure|continue-on-error|process\.exitCode\s*=\s*0/);
});

test('59/75 diagnostics expose only bounded non-secret build metadata',()=>{
  assert.match(runner,/VERCEL_GIT_COMMIT_SHA/);
  assert.match(runner,/VERCEL_GIT_COMMIT_REF/);
  assert.match(runner,/VERCEL_ENV/);
  assert.doesNotMatch(runner,/DATABASE_URL|SUPABASE_SERVICE_ROLE_KEY|JWT_SECRET|LICENSE_HASH_SECRET|process\.env\)/);
  for(const stage of ['identity','source-qa','browser-qa','backend-stage','vite-build']){
    assert.ok(runner.includes(`id:'${stage}'`));
  }
});


test('59/75 Vercel preview keeps exhaustive 58x5 batches delegated to the canonical workflow',()=>{
  const source=fs.readFileSync(new URL('../scripts/vercel-browser-preqa-v16.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(source,/58x5 fine-composition batch|58x5 exhaustive batch|mobile sidebar navigation batch/);
  assert.match(source,/delegated to \.github\/workflows\/erp-ui-58x5-v251\.yml/);
});
