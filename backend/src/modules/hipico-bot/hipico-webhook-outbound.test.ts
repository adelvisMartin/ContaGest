import assert from 'node:assert/strict';
import test from 'node:test';
import { automaticOutboundEligible, processIncomingCanonical } from './hipico-webhook-outbound.js';

const message={providerMessageId:'wamid.in.1',phoneNumberId:'1234567890',sender:'584121234567',messageType:'text',body:'hola',payload:{}};
const ownerId='11111111-1111-4111-8111-111111111111';

function fakeDeps(mode:'shadow'|'approved'|'automatic',result:any){
  const calls:any[]=[];
  return{
    calls,
    deps:{
      classify:()=>result,
      saveEvent:async(row:any)=>({id:'hwe_1',inserted:true,...row}),
      promotion:()=>mode,
      owner:()=>ownerId,
      readiness:async()=>({ready:true}),
      enqueue:async(input:any)=>{calls.push(['enqueue',input]);return{row:{id:'22222222-2222-4222-8222-222222222222',status:'queued',payload:input.payload},inserted:true};},
      queueShadow:async(input:any)=>{calls.push(['shadow',input]);return{id:'legacy-shadow'};}
    }
  };
}

test('webhook outbound: only safe read-only intents are automatic eligible',()=>{
  assert.equal(automaticOutboundEligible({intent:'greeting',autoEligible:true}),true);
  assert.equal(automaticOutboundEligible({intent:'help',autoEligible:true}),true);
  assert.equal(automaticOutboundEligible({intent:'status_non_monetary',autoEligible:true}),true);
  assert.equal(automaticOutboundEligible({intent:'bet',autoEligible:true}),false);
  assert.equal(automaticOutboundEligible({intent:'greeting',autoEligible:false}),false);
});

test('webhook outbound: shadow mode never creates a production send',async()=>{
  const fake=fakeDeps('shadow',{intent:'greeting',risk:'safe',confidence:.99,suggestion:'Hola',autoEligible:true});
  const result=await processIncomingCanonical(message,{requirePersistent:true},fake.deps as any);
  assert.equal(result.dispatchRequested,false);
  assert.equal(result.outbox,null);
  assert.deepEqual(fake.calls.map((call)=>call[0]),['shadow']);
});

test('webhook outbound: approved mode queues canonical row requiring approval',async()=>{
  const fake=fakeDeps('approved',{intent:'greeting',risk:'safe',confidence:.99,suggestion:'Hola',autoEligible:true});
  const result=await processIncomingCanonical(message,{requirePersistent:true},fake.deps as any);
  assert.equal(result.dispatchRequested,false);
  assert.equal(fake.calls[0][0],'enqueue');
  assert.equal(fake.calls[0][1].payload.approvalRequired,true);
  assert.match(fake.calls[0][1].idempotencyKey,/^meta-webhook:[a-f0-9]{64}$/);
});

test('webhook outbound: automatic safe intent queues canonical row and requests leased dispatch',async()=>{
  const fake=fakeDeps('automatic',{intent:'status_non_monetary',risk:'safe',confidence:.99,suggestion:'Estado OK',autoEligible:true});
  const result=await processIncomingCanonical(message,{requirePersistent:true},fake.deps as any);
  assert.equal(result.dispatchRequested,true);
  assert.equal(fake.calls[0][1].payload.approvalRequired,false);
});

test('webhook outbound: automatic mode still requires approval for non-safe intent',async()=>{
  const fake=fakeDeps('automatic',{intent:'bet',risk:'monetary',confidence:.99,suggestion:'Revisar',autoEligible:true});
  const result=await processIncomingCanonical(message,{requirePersistent:true},fake.deps as any);
  assert.equal(result.dispatchRequested,false);
  assert.equal(fake.calls[0][1].payload.approvalRequired,true);
});
