import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root=process.cwd();
const read=(relative)=>fs.readFileSync(path.join(root,relative),'utf8');
const primitives=read('frontend/src/components/ui/cg/CgPrimitives.jsx');
const visual=read('frontend/src/styles/contagest-visual-system-v12.css');

test('50/51 Cg primitives keep accessibility and reusable-state contracts',()=>{
  for(const token of [
    'CgPageHeader','CgButton','CgIconButton','CgTextField','CgSelect','CgDialog','CgDataTable','CgEmptyState','CgState',
    'aria-label={label}','aria-labelledby={titleId}','scope="col"','requires an accessible label','requires a persistent label','requires an accessible title'
  ]) assert.ok(primitives.includes(token),token);
  assert.match(primitives,/Stack direction=\{\{ xs: 'column', sm: 'row' \}\}/);
  assert.match(primitives,/flexWrap="wrap"/);
  assert.match(primitives,/No hay registros representativos para esta vista/);
});

test('50/51 canonical visual owner keeps visible focus touch sizing and reduced motion',()=>{
  assert.match(visual,/--cg-v-control-touch:\s*44px/);
  assert.match(visual,/prefers-reduced-motion:reduce/);
  assert.match(visual,/:focus-visible|focus-visible/);
});

test('50/51 migrated code cannot redefine canonical Cg owners locally',()=>{
  const owners=['CgPageHeader','CgButton','CgIconButton','CgTextField','CgSelect','CgDialog','CgDataTable','CgEmptyState','CgState'];
  const canonical=path.normalize('frontend/src/components/ui/cg/CgPrimitives.jsx');
  const files=[];
  const walk=(dir)=>{
    for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
      const full=path.join(dir,entry.name);
      if(entry.isDirectory())walk(full);
      else if(/\.[jt]sx?$/.test(entry.name))files.push(full);
    }
  };
  walk(path.join(root,'frontend/src'));
  const duplicates=[];
  for(const file of files){
    const relative=path.normalize(path.relative(root,file));
    if(relative===canonical)continue;
    const source=fs.readFileSync(file,'utf8');
    for(const owner of owners){
      const declaration=new RegExp('(?:export\\s+)?(?:function|class|const|let|var)\\s+'+owner+'\\b');
      if(declaration.test(source))duplicates.push(relative+':'+owner);
    }
  }
  assert.deepEqual(duplicates,[]);
});

test('50/51 browser contract remains wired into canonical 58x5 runner',()=>{
  const runner=read('scripts/erp-browser-58x5-v251.mjs');
  assert.match(runner,/50\/51 reusable Cg primitives/);
  assert.match(runner,/qa\/cg-primitives-v5051\.spec\.mjs/);
});
