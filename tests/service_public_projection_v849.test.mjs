import test from 'node:test';
import assert from 'node:assert/strict';
import {projectPublicServiceCatalog as project, ServicePublicProjectionError} from '../backend/src/modules/service-catalog/service-public-projection.mjs';
const id=n=>String(n).padStart(8,'0')+'-134d-4c86-a116-884e04d6c82a';
const tenantId=id(1);
const row=(n=10,changes={})=>({id:id(n),tenantId,categoryId:id(5),name:'Consulta',
  description:'Servicio informativo',status:'active',visibility:'public',
  version:1,modality:'onsite',durationMinutes:30,...changes});
const go=rows=>project({tenantId,rows});
const deny=rows=>assert.throws(()=>go(rows),e=>e instanceof ServicePublicProjectionError);
test('public service has minimal immutable allowlisted fields',()=>{
  const r=go([row()]);
  assert.equal(r.services.length,1);assert.equal(r.publicOnly,true);
  assert.equal(r.pricingProvided,false);assert.equal(r.availabilityProvided,false);
  assert.deepEqual(Object.keys(r.services[0]).sort(),
    ['id','categoryId','name','description','modality','durationMinutes','version'].sort());
  assert.ok(Object.isFrozen(r.services[0]));assert.ok(Object.isFrozen(r.services));
});
test('internal/archived do not appear in public projection',()=>{
  const r=go([row(),row(11,{visibility:'internal'}),row(12,{status:'archived'})]);
  assert.equal(r.services.length,1);
});
test('cross tenant and duplicate identifiers fail closed, not silently filtered',()=>{
  deny([row(10,{tenantId:id(99)})]);deny([row(),row()]);
});
test('reject attempted private/price/benefit fields instead of echoing PII',()=>{
  for(const field of ['cost','price','taxRate','remainingUses','userId','clinicalNotes','privatePhone']){
    deny([row(10,{[field]:'SECRET'})]);
  }
});
test('strict validation for version, duration, modality and sparse snapshots',()=>{
  deny([row(10,{version:0})]);deny([row(10,{durationMinutes:0})]);
  deny([row(10,{modality:'clinical_script'})]);
  const sparse=[];sparse.length=1;deny(sparse);
});
test('deterministic name/id sort, does not change the original rows',()=>{
  const rows=[row(13,{name:'Zumba'}),row(11,{name:'Aseo'}),row(12,{name:'Aseo'})];
  const snap=JSON.stringify(rows);
  const projected=go(rows).services.map(x=>x.id);
  assert.deepEqual(projected,[id(11),id(12),id(13)]);
  assert.equal(JSON.stringify(rows),snap);
});
