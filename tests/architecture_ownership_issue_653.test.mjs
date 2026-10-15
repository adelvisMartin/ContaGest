import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditOwnership,validateOwnership,REQUIRED_CONTEXTS} from '../scripts/architecture-ownership-audit-v653.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const baseline=JSON.parse(fs.readFileSync(path.join(root,'config/architecture-ownership-v653.json'),'utf8'));
const fixture=()=>structuredClone(baseline);
const exists=(p)=>p!=='frontend/src/components/enterprise.js';
test('catalog covers required authority IDs',()=>{
 const result=validateOwnership(baseline,{exists});
 assert.equal(result.ok,true,JSON.stringify(result.findings));
 assert.equal(result.contextCount,REQUIRED_CONTEXTS.length);
});
test('duplicate owner or nested owner fails, including different IDs',()=>{
 const a=fixture();a.contexts[1].owner=a.contexts[0].owner;
 assert.match(validateOwnership(a,{exists}).findings.join(' '),/DUPLICATE_OWNER/);
 const b=fixture();b.contexts[1].owner=b.contexts[0].owner+'/nested';
 assert.match(validateOwnership(b,{exists}).findings.join(' '),/DUPLICATE_OWNER/);
});
test('missing bounded context is not silently accepted',()=>{
 const a=fixture();a.contexts.pop();
 assert.match(validateOwnership(a,{exists}).findings.join(' '),/MISSING_CONTEXT/);
});
test('missing path and traversal references fail closed',()=>{
 const a=fixture();a.contexts[1].contract='backend/not-real.ts';a.contexts[2].gate='../escape';
 const result=validateOwnership(a,{exists:(p)=>exists(p)&&p!=='backend/not-real.ts'});
 assert.equal(result.ok,false);
 assert.match(result.findings.join(' '),/PATH_MISSING/);
 assert.match(result.findings.join(' '),/INVALID_RELATIVE_PATH/);
});
test('declared cross-boundary imports fail closed',()=>{
 const a=fixture();
 a.contexts.find(c=>c.id==='sales').dependencies=['verticals'];
 a.contexts.find(c=>c.id==='verticals').dependencies=['ledger'];
 const result=validateOwnership(a,{exists});
 assert.match(result.findings.join(' '),/CORE_IMPORTS_VERTICAL/);
 assert.match(result.findings.join(' '),/VERTICAL_IMPORTS_ERP/);
});
test('retired owner cannot reappear or lose consumer proof',()=>{
 assert.match(validateOwnership(baseline,{exists:()=>true}).findings.join(' '),/DEPRECATED_OWNER_EXISTS/);
 const a=fixture();a.deprecations[0].consumerProof='../outside';
 assert.match(validateOwnership(a,{exists}).findings.join(' '),/INVALID_RELATIVE_PATH/);
});
test('current repository paths and gates exist',()=>{
 const result=auditOwnership(root);
 assert.equal(result.ok,true,JSON.stringify(result.findings));
});
