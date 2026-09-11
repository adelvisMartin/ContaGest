import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import statusHandler from '../frontend/api/hipico/status.js';
import { strongSecretConfigured } from '../frontend/api/hipico/_shared.js';

const sharedSource=await readFile(new URL('../frontend/api/hipico/_shared.js',import.meta.url),'utf8');
const statusSource=await readFile(new URL('../frontend/api/hipico/status.js',import.meta.url),'utf8');

function invokeStatus(){
  const response={statusCode:200,body:null};
  const res={
    setHeader(){},
    status(code){response.statusCode=code;return this;},
    json(body){response.body=body;return body;}
  };
  statusHandler({method:'GET'},res);
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

test('status fails persistence readiness closed for weak or placeholder service-role keys',()=>{
  const base={
    HIPICO_SUPABASE_URL:'https://example.supabase.co',
    HIPICO_OWNER_ID:'00000000-0000-4000-8000-000000000001'
  };
  const weak=withEnv({...base,HIPICO_SUPABASE_SERVICE_ROLE_KEY:'PLACEHOLDER_PLACEHOLDER_PLACEHOLDER_PLACEHOLDER'},()=>invokeStatus());
  assert.equal(weak.statusCode,200);
  assert.equal(weak.body?.persistence?.ready,false);
  assert.equal(weak.body?.persistence?.serviceRoleKeyStrong,false);

  const strong=withEnv({...base,HIPICO_SUPABASE_SERVICE_ROLE_KEY:'s'.repeat(48)},()=>invokeStatus());
  assert.equal(strong.statusCode,200);
  assert.equal(strong.body?.persistence?.ready,true);
  assert.equal(strong.body?.persistence?.serviceRoleKeyStrong,true);
  assert.match(statusSource,/persistenceMissing\.length === 0 && persistenceServiceKeyStrong/);
});
