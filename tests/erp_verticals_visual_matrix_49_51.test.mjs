import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read=(path)=>fs.readFileSync(path,'utf8');

test('49/51 matrix covers five vertical routes, five viewports and both themes',()=>{
  const source=read('qa/verticals-visual-matrix-v4951.spec.mjs');
  for(const route of ['odontologia','veterinaria','gimnasio','rutinas','nutricion']) assert.ok(source.includes("'"+route+"'"),route);
  for(const width of [360,390,430,768,1366]) assert.ok(source.includes('width:'+width),String(width));
  assert.match(source,/THEMES=\['light','dark'\]/);
  assert.match(source,/page\.screenshot\(\{fullPage:true\}\)/);
  assert.match(source,/testInfo\.attach/);
});

test('49/51 detector is fail-closed for overlap and overflow classes',()=>{
  const source=read('qa/verticals-visual-matrix-v4951.spec.mjs');
  for(const token of ['document-overflow','outside-viewport','interactive-overlap','icon-label-overlap','clipped-operational-text','duplicate-id','touch-target']) assert.ok(source.includes(token),token);
  assert.match(source,/expect\(failures,JSON\.stringify\(failures,null,2\)\)\.toEqual\(\[\]\)/);
});

test('49/51 visual workflow is exact-SHA and stores browser evidence',()=>{
  const source=read('.github/workflows/erp-verticals-visual-v4951.yml');
  for(const token of ['CANDIDATE_SHA','git rev-parse HEAD','playwright install --with-deps chromium','test:browser:verticals:visual','upload-artifact@v7','evidencia-visual-49-51-']) assert.ok(source.includes(token),token);
  assert.doesNotMatch(source,/continue-on-error:\s*true/);
});

test('49/51 suite mocks API data but measures real rendered DOM geometry',()=>{
  const source=read('qa/verticals-visual-matrix-v4951.spec.mjs');
  assert.match(source,/page\.route\('\*\*\/api\/v1\/\*\*'/);
  assert.match(source,/page\.goto\('\/\?module='/);
  assert.match(source,/getBoundingClientRect/);
  assert.doesNotMatch(source,/setContent\(|fixtureHtml|staticHtml/i);
});
