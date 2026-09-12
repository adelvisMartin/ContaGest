import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import statusHandler, { __test__ as statusTest } from '../frontend/api/hipico/status.js';
import { hipicoPersistenceConfig, strongSecretConfigured } from '../frontend/api/hipico/_shared.js';

const sharedSource=await readFile(new URL('../frontend/api/hipico/_shared.js',import.meta.url),'utf8');
const statusSource=await readFile(new URL('../frontend/api/hipico/status.js',import.meta.url),'utf8');

function invokeStatus(headers={}){
  const response={statusCode:200,body:null};
  const res={
    setHeader(){},
    status(code){response.statusCode=code;return this;},
    json(body){response.body=body;return body;}
  };
  statusHandler({method:'GET',headers},res);
  return response;
}

function withEnv(patch,fn){
  const before=new Map(Object.keys(patch).map((key)=>[key,process.env[key]]));
  try{
    for(const [key,value] of Object.entries(patch)){
      if(value==null)delete process.env[key];
      else process.env[key]=String(value);
    }
    return fn();
  }finally{
    for(const [key,value] of before){
      if(value==null)delete process.env[key];
      else process.env[key]=value;
    }
  }
}

test('Supabase service-role access uses the canonical strong-secret boundary',()=>{
  assert.equal(strongSecretConfigured('s'.repeat(40)),true);
  assert.equal(strongSecretConfigured('CHANGE_ME_CHANGE_ME_CHANGE_ME_CHANGE_ME'),false);
  assert.match(sharedSource,/serverSecret\('HIPICO_SUPABASE_SERVICE_ROLE_KEY'\)/);
});

test('persistence readiness requires valid URL, strong service role and UUID owner',()=>{
  const base={HIPICO_SUPABASE_URL:'https://example.supabase.co',HIPICO_OWNER_ID:'00000000-0000-4000-8000-000000000001'};
  assert.equal(hipicoPersistenceConfig({...base,HIPICO_SUPABASE_SERVICE_ROLE_KEY:'PLACEHOLDER_PLACEHOLDER_PLACEHOLDER_PLACEHOLDER'}).ready,false);
  assert.equal(hipicoPersistenceConfig({...base,HIPICO_SUPABASE_SERVICE_ROLE_KEY:'s'.repeat(48)}).ready,true);
  assert.equal(hipicoPersistenceConfig({...base,HIPICO_SUPABASE_SERVICE_ROLE_KEY:'s'.repeat(48),HIPICO_SUPABASE_URL:'http://evil.example'}).ready,false);
  assert.equal(hipicoPersistenceConfig({...base,HIPICO_SUPABASE_SERVICE_ROLE_KEY:'s'.repeat(48),HIPICO_OWNER_ID:'not-a-uuid'}).ready,false);
});

test('status fails persistence closed but exposes detailed reasons only to authorized diagnostics',()=>{
  const internal='i'.repeat(48);
  const base={
    HIPICO_SUPABASE_URL:'https://example.supabase.co',
    HIPICO_OWNER_ID:'00000000-0000-4000-8000-000000000001',
    HIPICO_INTERNAL_API_TOKEN:internal
  };
  const weak=withEnv({...base,HIPICO_SUPABASE_SERVICE_ROLE_KEY:'PLACEHOLDER_PLACEHOLDER_PLACEHOLDER_PLACEHOLDER'},()=>invokeStatus());
  assert.equal(weak.statusCode,200);
  assert.equal(weak.body?.persistence?.ready,false);
  assert.equal('serviceRoleStrong' in (weak.body?.persistence||{}),false);

  const strong=withEnv({...base,HIPICO_SUPABASE_SERVICE_ROLE_KEY:'s'.repeat(48)},()=>invokeStatus({'x-hipico-internal-token':internal}));
  assert.equal(strong.statusCode,200);
  assert.equal(strong.body?.persistence?.ready,true);
  assert.equal(strong.body?.persistence?.serviceRoleStrong,true);
  assert.equal(strong.body?.persistence?.urlValid,true);
  assert.equal(strong.body?.persistence?.ownerIdValid,true);
  assert.equal(statusTest.internalDiagnosticsAuthorized({headers:{'x-hipico-internal-token':internal}},{HIPICO_INTERNAL_API_TOKEN:internal}),true);
  assert.match(statusSource,/const persistence = hipicoPersistenceConfig\(\)/);
});
