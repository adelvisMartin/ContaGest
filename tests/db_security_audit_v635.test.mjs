import test from 'node:test';
import assert from 'node:assert/strict';
import { classifySecurityManifest } from '../backend/scripts/db-security-hardening-v635.mjs';

const base=()=>({
  roles:[{role:'contagest_runtime',superuser:false,createDb:false,createRole:false,bypassRls:false,canLogin:true}],
  tables:[{schema:'public',name:'Client',owner:'postgres',rlsEnabled:true,rlsForced:false,hasTenantId:true,classification:'PRISMA_APPLICATION'}],
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
});

test('tenant table without RLS is rejected',()=>{
  const fixture=base();
  fixture.tables[0].rlsEnabled=false;
  assert.ok(codes(fixture).includes('TENANT_RLS_DISABLED'));
});

test('permissive authenticated tenant policy is rejected',()=>{
  const fixture=base();
  fixture.policies=[{schema:'public',table:'Client',name:'authenticated_all',command:'ALL',roles:['authenticated'],qual:'true',withCheck:'true'}];
  assert.ok(codes(fixture).includes('PERMISSIVE_TENANT_POLICY'));
});

test('trusted backend runtime policy is not mistaken for a tenant principal',()=>{
  const fixture=base();
  fixture.policies=[{schema:'public',table:'Client',name:'contagest_runtime_backend_all',command:'ALL',roles:['contagest_runtime'],qual:'true',withCheck:'true'}];
  assert.ok(!codes(fixture).includes('PERMISSIVE_TENANT_POLICY'));
});

test('unsafe SECURITY DEFINER search_path and execution grants are rejected',()=>{
  const fixture=base();
  fixture.functions[0]={...fixture.functions[0],searchPath:'public',publicExecute:true,anonExecute:true};
  const found=codes(fixture);
  assert.ok(found.includes('UNSAFE_DEFINER_SEARCH_PATH'));
  assert.ok(found.includes('PUBLIC_DEFINER_EXECUTE'));
  assert.ok(found.includes('ANON_DEFINER_EXECUTE'));
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
