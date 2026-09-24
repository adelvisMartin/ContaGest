import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const frontendPackage=JSON.parse(readFileSync(new URL('../frontend/package.json',import.meta.url),'utf8'));
const frontendVercel=JSON.parse(readFileSync(new URL('../frontend/vercel.json',import.meta.url),'utf8'));
const buildRunner=readFileSync(new URL('../frontend/scripts/vercel-build.mjs',import.meta.url),'utf8');
const browserRunner=readFileSync(new URL('../scripts/vercel-browser-preqa-v16.mjs',import.meta.url),'utf8');
const mobileNavigation=readFileSync(new URL('../qa/mobile-navigation-v163.spec.mjs',import.meta.url),'utf8');
const shardWorkflow=readFileSync(new URL('../.github/workflows/erp-ui-58x5-v251.yml',import.meta.url),'utf8');

test('#305 effective Vercel PR build cannot bypass the canonical browser pre-QA gate',()=>{
  assert.equal(frontendVercel.buildCommand,'npm run build','Vercel must delegate to the canonical frontend build instead of duplicating a partial command');
  assert.equal(frontendPackage.scripts?.build,'node scripts/vercel-build.mjs','canonical frontend build must delegate to the fail-fast staged runner');
  assert.match(buildRunner,/id:'browser-qa', command:'npm', args:\['run','preqa:browser'\]/,'staged build must execute the real browser pre-QA gate');
  assert.match(String(frontendPackage.scripts?.['preqa:browser']||''),/vercel-browser-preqa-v16\.mjs/,'browser pre-QA must use the serverless Chromium runner');
});

test('#305 exhaustive mobile route coverage is sharded in GitHub while Vercel keeps bounded high-signal smoke',()=>{
  assert.match(mobileNavigation,/CG_MOBILE_NAV_BATCH_INDEX/,'mobile navigation spec must retain deterministic batch support');
  assert.match(mobileNavigation,/CG_MOBILE_NAV_BATCH_SIZE/,'mobile navigation spec must retain bounded route selection');
  assert.match(mobileNavigation,/MODULE_VISUAL_ROUTES/,'batching derives from the canonical route catalog');

  assert.match(shardWorkflow,/matrix:\s*[\s\S]*batch:\s*\[0,1,2,3,4,5,6,7,8,9\]/,'GitHub workflow must shard the exhaustive route matrix');
  assert.match(shardWorkflow,/CG_58X5_BATCH_INDEX:\s*\$\{\{ matrix\.batch \}\}/,'each shard receives an explicit batch index');
  assert.match(shardWorkflow,/npm run test:browser:58:shard/,'route shards must execute the canonical 58x5 shard command');
  assert.match(shardWorkflow,/Require every browser shard to pass/,'aggregate verdict must fail closed');

  assert.match(browserRunner,/Full 58x5 route\/composition\/navigation\/transition matrix is delegated to \.github\/workflows\/erp-ui-58x5-v251\.yml/);
  assert.match(browserRunner,/mobile command navigation/,'Vercel must retain high-signal mobile navigation smoke');
  assert.doesNotMatch(browserRunner,/mobile sidebar navigation batch/,'Vercel must not duplicate the exhaustive shard loop');
});
