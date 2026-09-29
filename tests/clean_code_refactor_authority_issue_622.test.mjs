import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const SOURCE_EXTENSIONS=new Set(['.js','.jsx','.mjs','.cjs','.ts','.tsx']);
const IGNORE=new Set(['node_modules','.git','dist','coverage','.next']);

function walk(dir){
  if(!fs.existsSync(dir))return [];
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap((entry)=>{
    if(IGNORE.has(entry.name))return [];
    const absolute=path.join(dir,entry.name);
    if(entry.isDirectory())return walk(absolute);
    return SOURCE_EXTENSIONS.has(path.extname(entry.name))?[absolute]:[];
  });
}

function rel(file){return path.relative(ROOT,file).replaceAll('\\','/');}

function consumersOf(target){
  const targetBase=path.basename(target,path.extname(target));
  return walk(ROOT).filter((file)=>rel(file)!==target).filter((file)=>{
    const source=fs.readFileSync(file,'utf8');
    return source.includes('/enterprise.js')||source.includes('/enterprise')||source.includes(`./${targetBase}.js`)||source.includes(`./${targetBase}'`)||source.includes(`./${targetBase}\"`);
  }).map(rel).sort();
}

test('#622 clean-code authority defines the complete structural finding taxonomy',()=>{
  const policy=JSON.parse(fs.readFileSync('config/architecture-clean-code-authority-v1.json','utf8'));
  const expected=['DUPLICATE_AUTHORITY','BOUNDARY_VIOLATION','CYCLIC_DEPENDENCY','DEAD_CODE_CANDIDATE','UNSAFE_ANY_BOUNDARY','PERSISTENCE_LEAK','LEGACY_ADAPTER_ORPHAN','TEST_AUTHORITY_DRIFT','OVERSIZED_MODULE','DUPLICATE_HELPER'];
  assert.deepEqual(policy.findingTypes,expected);
  assert.equal(policy.rules.deadCodeRequiresZeroConsumers,true);
  assert.equal(policy.rules.automaticDeletion,false);
  assert.equal(policy.rules.allowlistRequiresOwnerReasonExpiry,true);
});

test('#622 characterization proves enterprise.js has zero source consumers before removal',()=>{
  const candidate='frontend/src/components/enterprise.js';
  assert.ok(fs.existsSync(candidate),'characterization must run while candidate still exists');
  assert.deepEqual(consumersOf(candidate),[]);
  for(const owner of ['frontend/src/components/ui/kit.js','frontend/src/components/ui/erp.js','frontend/src/components/vnext/index.js']) assert.ok(fs.existsSync(owner),`missing canonical owner: ${owner}`);
});

test('#622 audit implementation and architecture documentation are authoritative',()=>{
  assert.ok(fs.existsSync('scripts/architecture-clean-code-audit-v622.mjs'));
  assert.ok(fs.existsSync('docs/architecture/clean-code-refactor-authority-v1.md'));
  const runner=fs.readFileSync('scripts/run-authoritative-contracts.mjs','utf8');
  assert.match(runner,/clean_code_refactor_authority_issue_622\.test\.mjs/);
});
