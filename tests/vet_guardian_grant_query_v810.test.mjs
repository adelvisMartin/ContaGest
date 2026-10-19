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
