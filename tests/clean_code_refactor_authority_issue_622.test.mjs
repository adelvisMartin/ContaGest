import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

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
function rel(file,root=ROOT){return path.relative(root,file).replaceAll('\\','/');}
function legacyEnterpriseReferences(root=ROOT){
  return walk(root).filter((file)=>{
    const fileName=rel(file,root);
    // Regression fixtures can mention the deleted adapter without importing it.
    if(fileName.startsWith('tests/')||fileName.startsWith('qa/')||fileName==='scripts/architecture-clean-code-audit-v622.mjs')return false;
    const source=fs.readFileSync(file,'utf8');
    return source.includes('/enterprise.js')||source.includes("from './enterprise'")||source.includes("from './enterprise.js'")||source.includes("from '../components/enterprise");
  }).map((file)=>rel(file,root)).sort();
}

test('#622 clean-code authority defines the complete structural finding taxonomy',()=>{
  const policy=JSON.parse(fs.readFileSync('config/architecture-clean-code-authority-v1.json','utf8'));
  const expected=['DUPLICATE_AUTHORITY','BOUNDARY_VIOLATION','CYCLIC_DEPENDENCY','DEAD_CODE_CANDIDATE','UNSAFE_ANY_BOUNDARY','PERSISTENCE_LEAK','LEGACY_ADAPTER_ORPHAN','TEST_AUTHORITY_DRIFT','OVERSIZED_MODULE','DUPLICATE_HELPER'];
  assert.deepEqual(policy.findingTypes,expected);
  assert.equal(policy.rules.deadCodeRequiresZeroConsumers,true);
  assert.equal(policy.rules.automaticDeletion,false);
  assert.equal(policy.rules.allowlistRequiresOwnerReasonExpiry,true);
});

test('#622 characterized orphan stays removed and canonical UI owners remain',()=>{
  const candidate='frontend/src/components/enterprise.js';
  assert.equal(fs.existsSync(candidate),false,'characterized orphan must not reappear as parallel authority');
  assert.deepEqual(legacyEnterpriseReferences(),[],'no source consumer may retain the deleted adapter');
  for(const owner of ['frontend/src/components/ui/kit.js','frontend/src/components/ui/erp.js','frontend/src/components/vnext/index.js']) assert.ok(fs.existsSync(owner),`missing canonical owner: ${owner}`);
});

test('#622 audit implementation and architecture documentation are authoritative',()=>{
  assert.ok(fs.existsSync('scripts/architecture-clean-code-audit-v622.mjs'));
  assert.ok(fs.existsSync('docs/architecture/clean-code-refactor-authority-v1.md'));
  const runner=fs.readFileSync('scripts/run-authoritative-contracts.mjs','utf8');
  assert.match(runner,/clean_code_refactor_authority_issue_622\.test\.mjs/);
  const audit=fs.readFileSync('scripts/architecture-clean-code-audit-v622.mjs','utf8');
  assert.match(audit,/BOUNDARY_VIOLATION/);
  assert.match(audit,/CYCLIC_DEPENDENCY/);
  assert.match(audit,/LEGACY_ADAPTER_ORPHAN/);
});


test('#657 orphan consumer scan rejects runtime imports but ignores test-only references', (t) => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'cg-deprecation-proof-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const runtime=path.join(root,'frontend/src/active.js');
  fs.mkdirSync(path.dirname(runtime),{recursive:true});
  const testPath=path.join(root,'tests/reference-only.test.mjs');
  fs.mkdirSync(path.dirname(testPath),{recursive:true});
  fs.writeFileSync(testPath,"const removed = '/enterprise.js';\n");
  assert.deepEqual(legacyEnterpriseReferences(root),[],
    'reference-only regression fixtures must not count as app consumers');
  fs.writeFileSync(runtime,"import { old } from './enterprise.js';\n");
  assert.deepEqual(legacyEnterpriseReferences(root),['frontend/src/active.js'],
    'real application import must still block adapter cleanup');
  fs.rmSync(runtime);
  assert.deepEqual(legacyEnterpriseReferences(root),[]);
});
