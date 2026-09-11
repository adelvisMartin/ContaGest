import assert from 'node:assert/strict';
import test from 'node:test';
import { hipicoPersistenceConfig, supabase } from '../frontend/api/hipico/_shared.js';
import statusHandler from '../frontend/api/hipico/status.js';

const VALID_OWNER='550e8400-e29b-41d4-a716-446655440000';
const STRONG_KEY='s'.repeat(48);

function persistenceEnv(overrides={}){
  return{
    HIPICO_SUPABASE_URL:'https://project.supabase.co',
    HIPICO_SUPABASE_SERVICE_ROLE_KEY:STRONG_KEY,
    HIPICO_OWNER_ID:VALID_OWNER,
    ...overrides
  };
}

function withProcessEnv(values,run){
  const keys=Object.keys(values);
  const previous=new Map(keys.map((key)=>[key,process.env[key]]));
  Object.assign(process.env,values);
  const restore=()=>{
    for(const [key,value] of previous){
      if(value===undefined)delete process.env[key];
      else process.env[key]=value;
    }
  };
  try{
    const result=run();
    if(result&&typeof result.then==='function')return result.finally(restore);
    restore();
    return result;
  }catch(error){restore();throw error;}
}

test('serverless persistence readiness requires HTTPS/loopback URL, strong service key and UUID owner',()=>{
  assert.deepEqual(hipicoPersistenceConfig(persistenceEnv()),{
    url:'https://project.supabase.co',
    ownerId:VALID_OWNER,
    urlValid:true,
    serviceRoleStrong:true,
    ownerIdValid:true,
    ready:true
  });
  assert.equal(hipicoPersistenceConfig(persistenceEnv({HIPICO_SUPABASE_URL:'http://project.supabase.co'})).ready,false);
  assert.equal(hipicoPersistenceConfig(persistenceEnv({HIPICO_SUPABASE_URL:'http://127.0.0.1:54321'})).urlValid,true);
  assert.equal(hipicoPersistenceConfig(persistenceEnv({HIPICO_SUPABASE_URL:'https://user:pass@project.supabase.co'})).urlValid,false);
  assert.equal(hipicoPersistenceConfig(persistenceEnv({HIPICO_SUPABASE_URL:'https://project.supabase.co?apikey=leak'})).urlValid,false);
  assert.equal(hipicoPersistenceConfig(persistenceEnv({HIPICO_SUPABASE_URL:'https://project.supabase.co#fragment'})).urlValid,false);
  assert.equal(hipicoPersistenceConfig(persistenceEnv({HIPICO_SUPABASE_SERVICE_ROLE_KEY:'CHANGE_ME_'+'x'.repeat(40)})).serviceRoleStrong,false);
  assert.equal(hipicoPersistenceConfig(persistenceEnv({HIPICO_OWNER_ID:'owner-not-uuid'})).ownerIdValid,false);
});

test('Supabase helper rejects malformed persistence configuration before any network request',async()=>{
  await withProcessEnv(persistenceEnv({HIPICO_SUPABASE_SERVICE_ROLE_KEY:'weak'}),async()=>{
    await assert.rejects(()=>supabase('hipico_messages?limit=1'),/Weak server configuration: HIPICO_SUPABASE_SERVICE_ROLE_KEY/);
  });
  await withProcessEnv(persistenceEnv({HIPICO_SUPABASE_URL:'ftp://project.supabase.co'}),async()=>{
    await assert.rejects(()=>supabase('hipico_messages?limit=1'),/Invalid server configuration: HIPICO_SUPABASE_URL/);
  });
  await withProcessEnv(persistenceEnv({HIPICO_SUPABASE_URL:'https://project.supabase.co?apikey=leak'}),async()=>{
    await assert.rejects(()=>supabase('hipico_messages?limit=1'),/Invalid server configuration: HIPICO_SUPABASE_URL/);
  });
  await withProcessEnv(persistenceEnv({HIPICO_OWNER_ID:'not-a-uuid'}),async()=>{
    await assert.rejects(()=>supabase('hipico_messages?limit=1'),/Invalid server configuration: HIPICO_OWNER_ID/);
  });
});

test('status endpoint cannot report persistence ready for present-but-invalid credentials',()=>{
  withProcessEnv({
    ...persistenceEnv({HIPICO_OWNER_ID:'invalid-owner'}),
    HIPICO_GROUP_BRIDGE_TOKEN:'b'.repeat(48),
    HIPICO_SOURCE_GROUP_ID:'120363000000000001@g.us',
    HIPICO_LAB_GROUP_ID:'120363000000000002@g.us'
  },()=>{
    let statusCode=0;
    let payload;
    const res={
      setHeader(){},
      status(code){statusCode=code;return this;},
      json(value){payload=value;return value;}
    };
    statusHandler({method:'GET'},res);
    assert.equal(statusCode,200);
    assert.equal(payload.persistence.ready,false);
    assert.equal(payload.persistence.ownerIdValid,false);
    assert.equal(payload.linkedDeviceBridge.ready,false);
    assert.equal(payload.mode,'offline_and_manual_ready');
    assert.equal(Object.hasOwn(payload.persistence,'ownerId'),false);
  });
});
