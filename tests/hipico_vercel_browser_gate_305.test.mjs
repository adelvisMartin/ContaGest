import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const frontendPackage=JSON.parse(readFileSync(new URL('../frontend/package.json',import.meta.url),'utf8'));
const frontendVercel=JSON.parse(readFileSync(new URL('../frontend/vercel.json',import.meta.url),'utf8'));

test('#305 effective Vercel PR build cannot bypass the canonical browser pre-QA gate',()=>{
  assert.equal(frontendVercel.buildCommand,'npm run build','Vercel must delegate to the canonical frontend build instead of duplicating a partial command');
  assert.match(String(frontendPackage.scripts?.build||''),/npm run preqa:browser/,'canonical frontend build must execute real browser pre-QA');
  assert.match(String(frontendPackage.scripts?.['preqa:browser']||''),/vercel-browser-preqa-v16\.mjs/,'browser pre-QA must use the serverless Chromium runner');
});
