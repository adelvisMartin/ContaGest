import test from 'node:test';
import assert from 'node:assert/strict';
import {assertBackendStartupConfig,checkBackendStartupConfig} from './startupContract.js';

const production={NODE_ENV:'production',API_MODE:'prisma',PORT:'3030',ALLOW_DEV_TENANT_HEADER:'false'};

test('#665 backend startup accepts valid production, local dev and test',()=>{
  assert.deepEqual(checkBackendStartupConfig(production),{ok:true,failures:[]});
  assert.deepEqual(checkBackendStartupConfig({
    NODE_ENV:'development',API_MODE:'mock',PORT:'3030',ALLOW_DEV_TENANT_HEADER:'true'
  }),{ok:true,failures:[]});
  assert.deepEqual(checkBackendStartupConfig({NODE_ENV:'test'}),{ok:true,failures:[]});
});

test('#665 mock API and dev tenant bypass cannot start commercial production',()=>{
  for(const [field,value,code] of [
    ['API_MODE','mock','PRODUCTION_MOCK_API_FORBIDDEN'],
    ['ALLOW_DEV_TENANT_HEADER','true','PRODUCTION_DEV_TENANT_HEADER_FORBIDDEN']
  ]){
    const env={...production,[field]:value};
    const result=checkBackendStartupConfig(env);
    assert.equal(result.ok,false);
    assert.ok(result.failures.includes(code));
    assert.throws(()=>assertBackendStartupConfig(env),/BACKEND_STARTUP_CONFIG_INVALID/);
  }
});

test('#665 Vercel production uses production safety gates even with NODE_ENV development',()=>{
  const result=checkBackendStartupConfig({
    NODE_ENV:'development',VERCEL_ENV:'production',API_MODE:'mock',ALLOW_DEV_TENANT_HEADER:'true'
  });
  assert.equal(result.ok,false);
  assert.deepEqual(result.failures,[
    'PRODUCTION_MOCK_API_FORBIDDEN',
    'PRODUCTION_DEV_TENANT_HEADER_FORBIDDEN'
  ]);
  assert.equal(checkBackendStartupConfig({VERCEL_ENV:'preview',API_MODE:'mock'}).ok,true);
});

test('#665 invalid environment labels cannot accidentally opt out of production gates',()=>{
  for(const [key,value,code] of [
    ['NODE_ENV','prod','NODE_ENV_UNRECOGNIZED'],
    ['NODE_ENV','staging','NODE_ENV_UNRECOGNIZED'],
    ['VERCEL_ENV','prod','VERCEL_ENV_UNRECOGNIZED'],
    ['VERCEL_ENV','staging','VERCEL_ENV_UNRECOGNIZED']
  ]){
    const env={...production,[key]:value};
    assert.ok(checkBackendStartupConfig(env).failures.includes(code));
  }
});

test('#665 port validation rejects invalid and out-of-range values before listen',()=>{
  for(const PORT of ['','0','-1','65536','3030.5','abc','Infinity','  ']){
    assert.ok(checkBackendStartupConfig({...production,PORT}).failures.includes('PORT_OUT_OF_RANGE'));
  }
  for(const PORT of ['1','3030','65535']){
    assert.equal(checkBackendStartupConfig({...production,PORT}).ok,true,PORT);
  }
  assert.equal(checkBackendStartupConfig({NODE_ENV:'test',PORT:'0'}).ok,true,
    'OS-assigned ephemeral port remains available to test harnesses');
  assert.equal(checkBackendStartupConfig({NODE_ENV:'development',PORT:'0'}).ok,true);
});

test('#665 startup errors do not disclose environment variable values',()=>{
  const secret='do-not-print-credential-X83';
  const unsafe={...production,API_MODE:'mock',DATABASE_RUNTIME_URL:'postgresql://user:'+secret+'@private.test/db'};
  const result=checkBackendStartupConfig(unsafe);
  assert.equal(JSON.stringify(result).includes(secret),false);
  assert.throws(()=>assertBackendStartupConfig(unsafe),(error:unknown)=>{
    assert.ok(error instanceof Error);
    assert.match(error.message,/BACKEND_STARTUP_CONFIG_INVALID/);
    assert.equal(error.message.includes(secret),false);
    return true;
  });
});
