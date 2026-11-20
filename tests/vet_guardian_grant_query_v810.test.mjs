import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync('backend/src/modules/verticals/veterinary-guardian-query.ts','utf8');
const functionCode=source
  .replace('export function vetGuardianGrantsPatientId(query: unknown): string',
    'function vetGuardianGrantsPatientId(query)')
  .replace(' as Record<string, unknown>','');
const parse=new Function(functionCode+'; return vetGuardianGrantsPatientId;')();
const uuid='52f70c13-3c42-46c3-b202-381200906d10';

test('#810 accepts only exact scalar UUID',()=>{
 assert.equal(parse({patientId:uuid}),uuid);
 assert.equal(parse({patientId:uuid.toUpperCase()}),uuid.toUpperCase());
});
test('#810 rejects empty or malformed patient ID before tenant query',()=>{
 for(const value of ['',null,0,{},'not-uuid',' '.repeat(36),'../../tenant-B'])
  assert.throws(()=>parse({patientId:value}),/VET_GUARDIAN_QUERY_INVALID/);
});
test('#810 rejects Express array/object query parser coercion',()=>{
 for(const value of [[uuid],[uuid,uuid],{0:uuid},{toString(){return uuid}}])
  assert.throws(()=>parse({patientId:value}),/VET_GUARDIAN_QUERY_INVALID/);
});
test('#810 rejects query-parameter tenant override and mass assignment',()=>{
 for(const query of [{patientId:uuid,tenantId:'tenant-B'},{patientId:uuid,limit:500},[],{}])
  assert.throws(()=>parse(query),/VET_GUARDIAN_QUERY_INVALID/);
});
test('#810 grant query uses protected permission and tenant predicate',()=>{
 const route=fs.readFileSync('backend/src/modules/verticals/veterinary-guardian.routes.ts','utf8');
 const get=route.slice(route.indexOf("router.get('/guardian-portal/grants'"),
    route.indexOf("router.post('/guardian-portal/grants'"));
 assert.match(get,/requirePermission\('communications.manage'\)/);
 assert.match(get,/vetGuardianGrantsPatientId\(req\.query\)/);
 assert.match(get,/new HttpError\(422/);
 assert.match(get,/p?\"tenantId\"=\$1/);
 assert.match(get,/\"kind\"='animal'/);
 assert.doesNotMatch(get,/req\.query\.tenantId/);
});
test('#810 existing bearer token remains excluded from grant list response',()=>{
 const route=fs.readFileSync('backend/src/modules/verticals/veterinary-guardian.routes.ts','utf8');
 const get=route.slice(route.indexOf("router.get('/guardian-portal/grants'"),
    route.indexOf("router.post('/guardian-portal/grants'"));
 assert.doesNotMatch(get,/tokenSha256|rawToken|authorization|portalToken/i);
});

test('#711 reject accessor, inherited, hidden and symbol query keys without evaluating accessors',()=>{
 const getter=Object.defineProperty({},'patientId',{
   enumerable:true,get(){throw new Error('UNTRUSTED_GETTER_EXECUTED');}
 });
 assert.throws(()=>parse(getter),/VET_GUARDIAN_QUERY_INVALID/);
 const prototype=Object.create({tenantId:'foreign'});
 prototype.patientId=uuid;
 assert.throws(()=>parse(prototype),/VET_GUARDIAN_QUERY_INVALID/);
 const inheritedPatient=Object.create({patientId:uuid});
 assert.throws(()=>parse(inheritedPatient),/VET_GUARDIAN_QUERY_INVALID/);
 const hidden=Object.defineProperty({patientId:uuid},'tenantId',{value:'foreign'});
 assert.throws(()=>parse(hidden),/VET_GUARDIAN_QUERY_INVALID/);
 const symbol=Object.defineProperty({patientId:uuid},Symbol('tenant'),{value:'foreign'});
 assert.throws(()=>parse(symbol),/VET_GUARDIAN_QUERY_INVALID/);
});

test('#711 allow legitimate null-prototype query without broadening filter scope',()=>{
 const query=Object.create(null);
 query.patientId=uuid;
 assert.equal(parse(query),uuid);
 assert.throws(()=>parse(new Date()),/VET_GUARDIAN_QUERY_INVALID/);
 assert.throws(()=>parse(new Map([['patientId',uuid]])),/VET_GUARDIAN_QUERY_INVALID/);
});
