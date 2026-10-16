import test from 'node:test';
import assert from 'node:assert/strict';
import {preparePostedDocumentTransition as go} from '../backend/src/modules/documents/posted-document-transition.mjs';
const base={tenantId:'tenant-a',actorTenantId:'tenant-a',actorId:'staff-a',documentId:'doc-a',documentType:'sales',from:'draft',
 action:'issue',expectedRevision:2,documentNumber:'S-123',sequenceIssuedByServer:true,snapshotLocked:true,periodOpenVerified:true,
 reason:'Correccion documental comprobada',effectKey:'effect:issue:123'};
const call=(patch={})=>go({...base,...patch});
test('issued intent is immutable; no writes or ledger authorization',()=>{const x=call();assert.equal(x.to,'issued');assert.equal(x.persisted,false);assert.equal(x.numberAllocationAuthorized,false);assert.ok(Object.isFrozen(x));});
test('posting requires canonical source snapshot and fiscal verification',()=>{const x=call({from:'issued',action:'post'});assert.equal(x.to,'posted');assert.equal(x.requiresCanonicalFinancialService,true);});
test('posted document cannot be reissued/cancelled/downgraded',()=>{for(const action of ['issue','post','cancel','edit'])assert.throws(()=>call({from:'posted',action}),/NOT_ALLOWED/);});
test('posted reversal requires new document, not original overwrites',()=>{const x=call({from:'posted',action:'reverse'});assert.equal(x.createsNewReversalDocument,true);assert.equal(x.permittedMutationOfPostedSnapshot,false);});
test('cross-tenant/actor/document scopes rejected',()=>{assert.throws(()=>call({actorTenantId:'tenant-b'}),/SCOPE/);assert.throws(()=>call({documentId:' ' }),/SCOPE/);assert.throws(()=>call({documentType:'clinical'}),/SCOPE/);});
test('sequences cannot be invented by client',()=>{assert.throws(()=>call({sequenceIssuedByServer:false}),/SEQUENCE/);assert.throws(()=>call({documentNumber:''}),/SEQUENCE/);});
test('requires frozen tax/pricing snapshot to issue or post',()=>{assert.throws(()=>call({snapshotLocked:false}),/SNAPSHOT/);assert.throws(()=>call({from:'issued',action:'post',snapshotLocked:false}),/SNAPSHOT/);});
test('reject posting/reversal into unverified period',()=>{assert.throws(()=>call({from:'issued',action:'post',periodOpenVerified:false}),/PERIOD/);assert.throws(()=>call({from:'posted',action:'reverse',periodOpenVerified:false}),/PERIOD/);});
test('cancel/reverse requires reason and idempotency effect key',()=>{for(const action of ['cancel','reverse']){const from=action==='reverse'?'posted':'issued';assert.throws(()=>call({from,action,reason:'no'}),/REASON/);assert.throws(()=>call({from,action,effectKey:'x'}),/IDEMPOTENCY/);}});
test('allow cancellation of only mutable or unposted documents',()=>{for(const from of ['draft','issued']){const x=call({from,action:'cancel'});assert.equal(x.to,'cancelled');}});
test('terminal documents cannot be transitioned',()=>{for(const from of ['cancelled','reversed'])assert.throws(()=>call({from,action:'issue'}),/NOT_ALLOWED/);});
test('invalid revision or duplicate conflict preconditions rejected',()=>{for(const expectedRevision of [0,-1,1.5,Number.MAX_SAFE_INTEGER])assert.throws(()=>call({expectedRevision}),/REVISION/);});
