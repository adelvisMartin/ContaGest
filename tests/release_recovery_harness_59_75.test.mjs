import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read=(path)=>fs.readFileSync(path,'utf8');

test('59/75 visual strict keeps unbound forms visible but delegates their failure ownership',()=>{
  const source=read('scripts/visual-system-audit.mjs');
  assert.match(source,/item\.code !== 'unbound-form'/);
  assert.match(source,/if \(strict && \(structural > 0 \|\| pageCritical > 0\)\)/);
  const gate=read('scripts/visual-source-gate-v16.mjs');
  assert.match(gate,/if\(finding\.code==='unbound-form'\)continue/);
});

test('59/75 real persistence test owns its restricted-user fixture',()=>{
  const source=read('qa/postmerge-backend-persistence-v17.test.ts');
  assert.match(source,/prisma\.userProfile\.upsert/);
  assert.match(source,/QA Restricted User/);
  assert.match(source,/t\.after\(async\(\)=>/);
  assert.doesNotMatch(source,/Temporary QA user .* not found/);
});

test('59/75 browser preqa activates AL2023 explicitly after Chromium extraction',()=>{
  const source=read('scripts/vercel-browser-preqa-v16.mjs');
  assert.match(source,/const al2023='\/tmp\/al2023\/lib'/);
  assert.match(source,/fs\.existsSync\(al2023\)/);
  assert.match(source,/al2023Ready/);
  assert.match(source,/split\(': '\)|split\(':'\)/);
  assert.match(source,/Capa AL2023 no activa después de extraer Chromium/);
});
