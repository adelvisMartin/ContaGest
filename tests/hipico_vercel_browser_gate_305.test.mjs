import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const frontendPackage=JSON.parse(readFileSync(new URL('../frontend/package.json',import.meta.url),'utf8'));
const frontendVercel=JSON.parse(readFileSync(new URL('../frontend/vercel.json',import.meta.url),'utf8'));
const browserRunner=readFileSync(new URL('../scripts/vercel-browser-preqa-v16.mjs',import.meta.url),'utf8');
const mobileNavigation=readFileSync(new URL('../qa/mobile-navigation-v163.spec.mjs',import.meta.url),'utf8');

test('#305 effective Vercel PR build cannot bypass the canonical browser pre-QA gate',()=>{
  assert.equal(frontendVercel.buildCommand,'npm run build','Vercel must delegate to the canonical frontend build instead of duplicating a partial command');
  assert.match(String(frontendPackage.scripts?.build||''),/npm run preqa:browser/,'canonical frontend build must execute real browser pre-QA');
  assert.match(String(frontendPackage.scripts?.['preqa:browser']||''),/vercel-browser-preqa-v16\.mjs/,'browser pre-QA must use the serverless Chromium runner');
});

test('#305 Vercel mobile sidebar QA is split into bounded Chromium batches without losing route coverage',()=>{
  assert.match(mobileNavigation,/CG_MOBILE_NAV_BATCH_INDEX/,'mobile navigation spec must select a deterministic batch from the environment');
  assert.match(mobileNavigation,/CG_MOBILE_NAV_BATCH_SIZE/,'mobile navigation spec must bound routes per Chromium process');
  assert.match(mobileNavigation,/MODULE_VISUAL_ROUTES/,'batching must be derived from the canonical route catalog, not a hand-maintained partial list');
  assert.match(browserRunner,/mobile sidebar navigation batch/,'Vercel browser runner must execute sidebar batches independently');
  assert.match(browserRunner,/CG_MOBILE_NAV_BATCH_INDEX/,'runner must pass an explicit batch index');
  assert.match(browserRunner,/CG_MOBILE_NAV_BATCH_SIZE/,'runner must pass the same bounded batch size used to cover all routes');
});
