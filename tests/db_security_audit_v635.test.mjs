import test from 'node:test';
import assert from 'node:assert/strict';
import { classifySecurityManifest } from '../backend/scripts/db-security-hardening-v635.mjs';

const base=()=>({
  roles:[{role:'contagest_runtime',superuser:false,createDb:false,createRole:false,bypassRls:false,canLogin:true}],
  tables:[{schema:'public',name:'Client',owner:'postgres',rlsEnabled:true,rlsForced:false,hasTenantId:true,classification:'PRISMA_APPLICATION',anonAnyDml:false,authenticatedAnyDml:false}],
  policies:[{schema:'public',table:'Client',name:'client_tenant_all',command:'ALL',roles:['authenticated'],qual:'("tenantId" = private.current_tenant_id())',withCheck:'("tenantId" = private.current_tenant_id())'}],
  functions:[{schema:'private',name:'current_tenant_id',identityArguments:'',owner:'postgres',securityDefiner:true,searchPath:'pg_catalog, private, public',publicExecute:false,anonExecute:false,extensionOwned:false}],
  views:[],
  roleMemberships:[],
  runtimeSchemaCreate:false,
});

function codes(input){return classifySecurityManifest(input).findings.map((item)=>item.code);}

test('safe tenant fixture has no P0/P1 findings',()=>{
  const result=classifySecurityManifest(base());
  assert.equal(result.verdict,'PASS');
  assert.deepEqual(result.findings,[]);
  assert.deepEqual(result.outOfScope,[]);
});

test('missing dedicated runtime role is rejected',()=>{
  const fixture=base();
  fixture.roles=[];
  assert.ok(codes(fixture).includes('RUNTIME_ROLE_MISSING'));
});

test('tenant table without RLS is rejected',()=>{
  const fixture=base();
  fixture.tables[0].rlsEnabled=false;
  assert.ok(codes(fixture).includes('TENANT_RLS_DISABLED'));
});

test('backend-only Prisma tenant table cannot keep anon/authenticated DML',()=>{
  const fixture=base();
  fixture.tables[0].authenticatedAnyDml=true;
  assert.ok(codes(fixture).includes('DIRECT_BROWSER_DML_GRANT'));
});

test('permissive authenticated tenant policy is rejected',()=>{
  const fixture=base();
  fixture.policies=[{schema:'public',table:'Client',name:'authenticated_all',command:'ALL',roles:['authenticated'],qual:'true',withCheck:'true'}];
  assert.ok(codes(fixture).includes('PERMISSIVE_TENANT_POLICY'));
});

test('contagest_runtime all-tenant policy on tenant-owned table is release-blocking',()=>{
  const fixture=base();
  fixture.policies=[{schema:'public',table:'Client',name:'contagest_runtime_backend_all',command:'ALL',roles:['contagest_runtime'],qual:'true',withCheck:'true'}];
  const result=classifySecurityManifest(fixture);
  assert.equal(result.verdict,'FAIL');
  assert.ok(result.findings.some((item)=>item.code==='RUNTIME_ALL_TENANT_POLICY'&&item.severity==='P0'));
});

test('global/shared table without tenant ownership is not a runtime all-tenant false positive',()=>{
  const fixture=base();
  fixture.tables=[{schema:'public',name:'GlobalTaxCatalog',owner:'postgres',rlsEnabled:true,rlsForced:false,hasTenantId:false,classification:'PRISMA_APPLICATION',anonAnyDml:false,authenticatedAnyDml:false}];
  fixture.policies=[{schema:'public',table:'GlobalTaxCatalog',name:'contagest_runtime_backend_all',command:'ALL',roles:['contagest_runtime'],qual:'true',withCheck:'true'}];
  assert.ok(!codes(fixture).includes('RUNTIME_ALL_TENANT_POLICY'));
});

test('unsafe ContaGest SECURITY DEFINER search_path and execution grants are rejected',()=>{
  const fixture=base();
  fixture.functions[0]={...fixture.functions[0],searchPath:'public',publicExecute:true,anonExecute:true};
  const found=codes(fixture);
  assert.ok(found.includes('UNSAFE_DEFINER_SEARCH_PATH'));
  assert.ok(found.includes('PUBLIC_DEFINER_EXECUTE'));
  assert.ok(found.includes('ANON_DEFINER_EXECUTE'));
});

test('shared product definers are surfaced but do not mutate the #635 verdict',()=>{
  const fixture=base();
  fixture.functions.push({schema:'public',name:'hipico_get_workspace',identityArguments:'',owner:'postgres',securityDefiner:true,searchPath:'public, pg_temp',publicExecute:true,anonExecute:true,extensionOwned:false});
  const result=classifySecurityManifest(fixture);
  assert.equal(result.verdict,'PASS');
  assert.equal(result.findings.length,0);
  assert.ok(result.outOfScope.some((item)=>item.object==='public.hipico_get_workspace()'));
});

test('exposed non-security-invoker ContaGest view is rejected',()=>{
  const fixture=base();
  fixture.views=[{schema:'public',name:'contagest_financial_summary',owner:'postgres',kind:'view',securityInvoker:false,anonSelect:false,authenticatedSelect:true}];
  assert.ok(codes(fixture).includes('EXPOSED_DEFINER_VIEW'));
});

test('shared product exposed view is surfaced as out of scope',()=>{
  const fixture=base();
  fixture.views=[{schema:'public',name:'hipico_operator_summary',owner:'postgres',kind:'view',securityInvoker:false,anonSelect:true,authenticatedSelect:true}];
  const result=classifySecurityManifest(fixture);
  assert.equal(result.verdict,'PASS');
  assert.ok(result.outOfScope.some((item)=>item.object==='public.hipico_operator_summary'));
});

test('runtime escalation and DDL ownership are rejected',()=>{
  const fixture=base();
  fixture.roles[0]={...fixture.roles[0],bypassRls:true,createRole:true};
  fixture.runtimeSchemaCreate=true;
  fixture.tables[0].owner='contagest_runtime';
  fixture.roleMemberships=[{member:'contagest_runtime',role:'service_role'}];
  const found=codes(fixture);
  assert.ok(found.includes('RUNTIME_ROLE_ESCALATION'));
  assert.ok(found.includes('RUNTIME_DDL_PRIVILEGE'));
  assert.ok(found.includes('RUNTIME_OBJECT_OWNERSHIP'));
  assert.ok(found.includes('RUNTIME_PRIVILEGED_MEMBERSHIP'));
});
