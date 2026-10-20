import test from 'node:test';
import assert from 'node:assert/strict';
import {preparePostedDocumentTransition as check} from '../backend/src/modules/documents/posted-document-transition.mjs';

const base=Object.freeze({
  tenantId:'tenant-a',actorTenantId:'tenant-a',actorId:'staff-a',
  documentId:'doc-a',documentType:'sales',from:'draft',action:'issue',
  expectedRevision:2,documentNumber:'S-123',sequenceIssuedByServer:true,
  snapshotLocked:true,periodOpenVerified:true,
  reason:'Corrección documental comprobada',effectKey:'effect:issue:123'
});
const call=(changes={})=>check({...base,...changes});
const fail=fn=>assert.throws(fn,{message:'DOCUMENT_TRANSITION_NOT_ALLOWED'});
test('#769 inherited constructor/toString actions are never document transitions',()=>{
  for(const action of ['constructor','toString','valueOf','__proto__','hasOwnProperty'])
    fail(()=>call({action}));
});
test('#769 prototype and inherited state names are never lifecycle states',()=>{
  for(const from of ['__proto__','constructor','toString','valueOf','hasOwnProperty'])
    fail(()=>call({from,action:'constructor'}));
});
test('#769 malformed action and null/array object access cannot authorize lifecycle',()=>{
  for(const action of [null,{},[],42])fail(()=>call({action}));
});
test('#769 valid issued, posted, reverse state path still exists',()=>{
  assert.equal(call({action:'issue'}).to,'issued');
  assert.equal(call({from:'issued',action:'post'}).to,'posted');
  assert.equal(call({from:'posted',action:'reverse'}).to,'reversed');
});
test('#769 posted document still cannot be cancelled or edited',()=>{
  for(const action of ['cancel','edit','issue','post'])fail(()=>call({from:'posted',action}));
});
test('#769 authorization continues to deny cross-tenant and false sequence',()=>{
  assert.throws(()=>call({actorTenantId:'other'}),/SCOPE/);
  assert.throws(()=>call({sequenceIssuedByServer:false}),/SEQUENCE/);
});