import assert from 'node:assert/strict';
import test from 'node:test';
import { dispatchCanonicalOutbound } from './hipico-outbound-worker.js';

function claimed(overrides:Record<string,unknown>={}){
  return{
    id:'22222222-2222-4222-8222-222222222222',owner_id:'11111111-1111-4111-8111-111111111111',
    destination:'584121234567',status:'sending',lease_token:'33333333-3333-4333-8333-333333333333',
    attempts:1,max_attempts:4,payload:{text:'Respuesta segura'},...overrides
  };
}

function deps(sendImpl:(to:string,text:string)=>Promise<any>,row=claimed()){
  const calls:any[]=[];
  return{
    calls,
    api:{
      claim:async()=>row,
      send:sendImpl,
      accepted:async(input:any)=>{calls.push(['accepted',input]);return{...row,status:'accepted'};},
      retry:async(input:any)=>{calls.push(['retry',input]);return{...row,status:'retry'};},
      failed:async(input:any)=>{calls.push(['failed',input]);return{...row,status:'failed'};},
      reconciliation:async(input:any)=>{calls.push(['reconciliation',input]);return{...row,status:'reconciliation_required'};}
    }
  };
}

test('outbound worker: provider acceptance persists accepted, not sent',async()=>{
  const fake=deps(async()=>({providerMessageId:'wamid.accepted'}));
  const result=await dispatchCanonicalOutbound({ownerId:claimed().owner_id,id:claimed().id,jitterUnit:0},fake.api as any);
  assert.equal(result.status,'accepted');
  assert.equal(fake.calls.length,1);
  assert.equal(fake.calls[0][0],'accepted');
  assert.equal(fake.calls[0][1].providerMessageId,'wamid.accepted');
  assert.equal(fake.calls[0][1].leaseToken,claimed().lease_token);
});

test('outbound worker: ambiguous delivery is parked in reconciliation and never retried',async()=>{
  const error=Object.assign(new Error('timeout'),{code:'HIPICO_CLOUD_DELIVERY_AMBIGUOUS'});
  const fake=deps(async()=>{throw error;});
  const result=await dispatchCanonicalOutbound({ownerId:claimed().owner_id,id:claimed().id,jitterUnit:0},fake.api as any);
  assert.equal(result.status,'reconciliation_required');
  assert.deepEqual(fake.calls.map((call)=>call[0]),['reconciliation']);
});

test('outbound worker: HTTP 429 retries with bounded backoff while attempts remain',async()=>{
  const error=Object.assign(new Error('rate limited'),{code:'HIPICO_CLOUD_HTTP_ERROR',status:429});
  const fake=deps(async()=>{throw error;});
  const before=Date.now();
  const result=await dispatchCanonicalOutbound({ownerId:claimed().owner_id,id:claimed().id,jitterUnit:0},fake.api as any);
  assert.equal(result.status,'retry');
  assert.equal(fake.calls[0][0],'retry');
  assert.ok(new Date(fake.calls[0][1].nextAttemptAt).getTime()>=before+900);
});

test('outbound worker: retryable failure at max attempts becomes terminal failed',async()=>{
  const error=Object.assign(new Error('rate limited'),{code:'HIPICO_CLOUD_HTTP_ERROR',status:429});
  const fake=deps(async()=>{throw error;},claimed({attempts:4,max_attempts:4}));
  const result=await dispatchCanonicalOutbound({ownerId:claimed().owner_id,id:claimed().id,jitterUnit:0},fake.api as any);
  assert.equal(result.status,'failed');
  assert.deepEqual(fake.calls.map((call)=>call[0]),['failed']);
});

test('outbound worker: no lease claim means no provider call',async()=>{
  let sent=false;
  const fake=deps(async()=>{sent=true;return{providerMessageId:'wamid.never'};},null as any);
  const result=await dispatchCanonicalOutbound({ownerId:claimed().owner_id,id:claimed().id,jitterUnit:0},fake.api as any);
  assert.equal(result.status,'not_claimed');
  assert.equal(sent,false);
});
