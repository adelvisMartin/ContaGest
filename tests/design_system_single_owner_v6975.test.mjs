import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {renderContaGestCss,renderHipicoCss} from '../scripts/generate-design-tokens-v631.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=relative=>readFileSync(resolve(root,relative),'utf8');
const cssRoot='frontend/public/hipico-control/assets/css/';
const generated=read(cssRoot+'platform-tokens-v1.css');
const legacy=[
  read(cssRoot+'ui-system-v3-compat.css'),
  read(cssRoot+'ui-system-v4.css')
];

test('#6975 generated adapters equal the shared canonical design source byte-for-byte',()=>{
  assert.equal(read('frontend/public/design-system/contagest-semantic-tokens-v1.css'),
    renderContaGestCss());
  assert.equal(generated,renderHipicoCss());
  for(const key of ['--cg-v-weight-strong','--cg-v-control-dense',
    '--cg-v-control-tabs','--cg-v-control-chip']){
    assert.match(read('frontend/public/design-system/contagest-semantic-tokens-v1.css'),
      new RegExp('^\\s*'+key+':','m'),key);
  }
});

test('#6975 v3/v4 CSS remain variable consumers, never competing token owners',()=>{
  const property=/^\\s*--hc-[a-z0-9-]+\\s*:/gim;
  for(const source of legacy){
    assert.doesNotMatch(source,property,
      'only the generated token adapter may declare --hc-* values');
    assert.match(source,/var\\(--hc-/,'historical selectors keep semantic references');
  }
});

test('#6975 all v4 compatibility variables used by the PWA are generated',()=>{
  const source=[...legacy,read(cssRoot+'ui-system-v4-convergence.css')].join('\\n');
  const refs=new Set([...source.matchAll(/var\\((--hc-v4-[a-z0-9-]+)/gi)]
    .map(match=>match[1]));
  assert.ok(refs.size>=25,'must exercise substantive v4 compatibility surface');
  for(const alias of refs){
    assert.match(generated,new RegExp('^\\s*'+alias+':','m'),alias);
  }
  const html=read('frontend/public/hipico-control/index.html');
  const base=html.indexOf('./assets/css/app.css');
  const adapter=html.indexOf('./assets/css/platform-tokens-v1.css');
  assert.ok(base>=0&&adapter>base,'generated adapter must follow legacy component CSS');
});
