import assert from 'node:assert/strict';
import test from 'node:test';
import { runCanonicalOutboundCycle, runnerConfiguration } from './hipico-outbound-runner.js';

const owner='11111111-1111-4111-8111-111111111111';

function deps(overrides:Record<string,unknown>={}){
  const calls:any[]=[];
  return{
    calls,
    api:{
      owner:()=>owner,
      readiness:async()=>({ready:true}),
      policy:()=>({enabled:true,reasons:[]}),
      transport:()=>({configured:true,reasons:[]}),
      dispatch:async(input:any)=>{calls.push(input);return calls.length===1?{status:'accepted'}:{status:'not_claimed'};},
      ...overrides
    }
  };
}

test('outbox runner: configuration is disabled by default and bounded',()=>{
  const disabled=runnerConfiguration({});
  assert.equal(disabled.enabled,false);
  assert.equal(disabled.intervalMs,5000);
  assert.equal(disabled.maxPerCycle,10);
  const bounded=runnerConfiguration({HIPICO_OUTBOX_WORKER_ENABLED:'true',HIPICO_OUTBOX_WORKER_INTERVAL_MS:'1',HIPICO_OUTBOX_WORKER_MAX_PER_CYCLE:'999'});
  assert.equal(bounded.enabled,true);
  assert.equal(bounded.intervalMs,1000);
  assert.equal(bounded.maxPerCycle,50);
});

test('outbox runner: does not claim when cloud production policy is disabled',async()=>{
  const fake=deps({policy:()=>({enabled:false,reasons:['SEND_SWITCH_DISABLED']})});
  const result=await runCanonicalOutboundCycle({maxPerCycle:10},fake.api as any);
  assert.equal(result.reason,'outbound_policy_disabled');
  assert.equal(fake.calls.length,0);
});

test('outbox runner: does not claim when transport or persistence is unavailable',async()=>{
  const transport=deps({transport:()=>({configured:false,reasons:['CLOUD_TOKEN_NOT_CONFIGURED']})});
  assert.equal((await runCanonicalOutboundCycle({maxPerCycle:10},transport.api as any)).reason,'transport_not_configured');
  assert.equal(transport.calls.length,0);
  const persistence=deps({readiness:async()=>({ready:false})});
  assert.equal((await runCanonicalOutboundCycle({maxPerCycle:10},persistence.api as any)).reason,'outbox_not_ready');
  assert.equal(persistence.calls.length,0);
});

test('outbox runner: drains only generic auto-approved rows and stops when none are claimable',async()=>{
  const fake=deps();
  const result=await runCanonicalOutboundCycle({maxPerCycle:10},fake.api as any);
  assert.equal(result.processed,1);
  assert.equal(result.reason,'empty');
  assert.equal(fake.calls.length,2);
  assert.equal(fake.calls[0].ownerId,owner);
  assert.equal(fake.calls[0].allowApprovalRequired,false);
});

test('outbox runner: never loops indefinitely within one cycle',async()=>{
  const fake=deps({dispatch:async(input:any)=>{fake.calls.push(input);return{status:'accepted'};}});
  const result=await runCanonicalOutboundCycle({maxPerCycle:3},fake.api as any);
  assert.equal(result.processed,3);
  assert.equal(result.reason,'cycle_limit');
  assert.equal(fake.calls.length,3);
});
