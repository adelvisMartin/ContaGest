import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditWorkflowInventory} from '../scripts/workflow-inventory-v654.mjs';

test('the live workflow catalog classifies every deployed CI and manual gate',()=>{
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
 const report=auditWorkflowInventory(root);
 assert.equal(report.ok,true,report.errors.join('\n'));
 assert.equal(report.classifiedCount,report.workflowCount);
});

function fixture(fn) {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cg654-'));
 const workflows=path.join(dir,'.github/workflows');
 fs.mkdirSync(workflows,{recursive:true});
 const file='.github/workflows/sample.yml';
 const yaml=['name: Sample Gate','on:','  pull_request:','    branches: [main]','  workflow_dispatch:','permissions:','  contents: read','jobs:','  unit:','    name: Unit Gate','    runs-on: ubuntu-latest','    steps:','      - run: node --test',''].join('\n');
 fs.writeFileSync(path.join(dir,file),yaml);
 const manifest={schemaVersion:1,issue:654,workflows:[{file,classification:'AUTHORITATIVE',owner:'qa',status:'ACTIVE',reason:'Maintained sample gate'}]};
 try{return fn({dir,file,manifest,workflows});}finally{fs.rmSync(dir,{force:true,recursive:true});}
}

test('a classified workflow yields an auditable trigger and job manifest',()=>fixture(({dir,manifest})=>{
 const r=auditWorkflowInventory(dir,manifest);
 assert.equal(r.ok,true,JSON.stringify(r.errors));
 assert.equal(r.workflowCount,1);
 assert.deepEqual(r.workflows[0].triggers,['pull_request','workflow_dispatch']);
 assert.deepEqual(r.workflows[0].jobs,['unit']);
}));
test('new workflows require an explicit owner and status',()=>fixture(({dir,workflows,manifest})=>{
 fs.writeFileSync(path.join(workflows,'new.yml'),'name: New\non:\n  push:\njobs:\n  check:\n    runs-on: ubuntu-latest\n');
 assert.match(auditWorkflowInventory(dir,manifest).errors.join(' '),/UNCLASSIFIED_WORKFLOW/);
}));
test('duplicate entries are rejected rather than overwritten',()=>fixture(({dir,manifest})=>{
 manifest.workflows.push({...manifest.workflows[0]});
 assert.match(auditWorkflowInventory(dir,manifest).errors.join(' '),/DUPLICATE_INVENTORY_ENTRY/);
}));
test('invalid paths, owner, status and classification cannot bypass review',()=>fixture(({dir,manifest})=>{
 manifest.workflows[0]={...manifest.workflows[0],file:'../escape.yml',owner:'',classification:'UNCLASSIFIED',status:'DONE'};
 const out=auditWorkflowInventory(dir,manifest).errors.join(' ');
 for (const token of ['INVALID_INVENTORY_PATH','UNCLASSIFIED_WORKFLOW']) assert.match(out,new RegExp(token));
}));
test('no job or trigger fails closed',()=>fixture(({dir,file,manifest})=>{
 fs.writeFileSync(path.join(dir,file),'name: Broken\njobs:\n');
 const r=auditWorkflowInventory(dir,manifest);
 assert.equal(r.ok,false);
 assert.match(r.errors.join(' '),/WORKFLOW_TRIGGERS_UNDETECTED/);
 assert.match(r.errors.join(' '),/WORKFLOW_JOBS_UNDETECTED/);
}));
test('temporary workflows remain review-required, not silently removed',()=>fixture(({dir,manifest})=>{
 manifest.workflows[0]={...manifest.workflows[0],classification:'TEMPORARY',status:'REVIEW_REQUIRED'};
 const r=auditWorkflowInventory(dir,manifest);
 assert.equal(r.ok,true);
 assert.match(r.warnings.join(' '),/REVIEW_TEMPORARY/);
}));
test('retired temporary workflow without consumer proof is rejected',()=>fixture(({dir,manifest})=>{
 manifest.workflows[0]={...manifest.workflows[0],classification:'TEMPORARY',status:'RETIRED'};
 assert.match(auditWorkflowInventory(dir,manifest).errors.join(' '),/RETIREMENT_WITHOUT_CONSUMER_PROOF/);
}));
