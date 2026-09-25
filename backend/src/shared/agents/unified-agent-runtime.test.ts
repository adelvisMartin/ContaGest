import test from 'node:test';
import assert from 'node:assert/strict';
import { UnifiedAgentRuntime } from './unified-agent-runtime.js';

type Input={message:string};
type Context={tenantId:string};

const proposal=(overrides:Record<string,unknown>={})=>({
  intent:'status',
  confidence:.99,
  risk:'safe' as const,
  source:'deterministic' as const,
  tool:null,
  output:{answer:'ok'},
  ...overrides
});

function runtime(overrides:Record<string,unknown>={}){
  let executions=0;
  const audits:any[]=[];
  const metrics:any[]=[];
  const instance=new UnifiedAgentRuntime<Input,Context,{answer:string},{ok:boolean}>({
    runtimeId:'test-runtime',
    contextBuilder:()=>({tenantId:'tenant-a'}),
    decide:()=>proposal() as any,
    policy:()=>({disposition:'AUTO',reason:'TEST_POLICY',autonomousAllowed:true,humanRequired:false}),
    toolScope:(tool)=>tool,
    promotion:()=>true,
    executor:()=>{executions+=1;return{ok:true};},
    audit:(event)=>{audits.push(event);},
    metrics:(trace)=>{metrics.push(trace);},
    ...overrides
  } as any);
  return{instance,get executions(){return executions;},audits,metrics};
}

void test('disabled mode fails closed before context/provider evaluation',async()=>{
  let decided=false;
  const box=runtime({decide:()=>{decided=true;return proposal();}});
  const result=await box.instance.run({message:'hola'},'DISABLED');
  assert.equal(decided,false);
  assert.equal(result.policy.disposition,'DENY');
  assert.equal(result.trace.directEffectsApplied,false);
});

void test('shadow and assisted never execute effects',async()=>{
  for(const mode of ['SHADOW','ASSISTED'] as const){
    const box=runtime({decide:()=>proposal({tool:{name:'readStatus',arguments:{}}})});
    const result=await box.instance.run({message:'estado'},mode);
    assert.equal(box.executions,0);
    assert.equal(result.trace.directEffectsApplied,false);
    assert.equal(result.policy.disposition,mode==='SHADOW'?'SHADOW':'SUGGEST');
  }
});

void test('review and monetary proposals require a human even in automatic mode',async()=>{
  for(const risk of ['review','monetary'] as const){
    const box=runtime({decide:()=>proposal({risk})});
    const result=await box.instance.run({message:'acción'},'AUTOMATIC');
    assert.equal(result.policy.disposition,'HUMAN_REQUIRED');
    assert.equal(result.policy.humanRequired,true);
    assert.equal(box.executions,0);
  }
});

void test('automatic effects require safe proposal tool scope policy promotion and executor',async()=>{
  const box=runtime({decide:()=>proposal({tool:{name:'readStatus',arguments:{scope:'tenant'}}})});
  const result=await box.instance.run({message:'estado'},'AUTOMATIC_LOW_RISK');
  assert.equal(result.policy.disposition,'AUTO');
  assert.equal(result.trace.toolValidated,true);
  assert.equal(result.trace.promotionApproved,true);
  assert.equal(result.trace.directEffectsApplied,true);
  assert.equal(box.executions,1);
  assert.deepEqual(result.execution,{ok:true});
});

void test('tool without a scope validator is denied fail closed',async()=>{
  const box=runtime({
    decide:()=>proposal({tool:{name:'unsafe',arguments:{}}}),
    toolScope:undefined
  });
  const result=await box.instance.run({message:'estado'},'AUTOMATIC');
  assert.equal(result.policy.disposition,'DENY');
  assert.equal(result.trace.directEffectsApplied,false);
  assert.equal(box.executions,0);
});

void test('automatic mode cannot bypass the promotion gate',async()=>{
  const box=runtime({
    decide:()=>proposal({tool:{name:'readStatus',arguments:{}}}),
    promotion:()=>false
  });
  const result=await box.instance.run({message:'estado'},'AUTOMATIC');
  assert.equal(result.policy.disposition,'HUMAN_REQUIRED');
  assert.equal(result.trace.reason,'PROMOTION_GATE_REQUIRED');
  assert.equal(box.executions,0);
});

void test('audit and metrics receive bounded metadata without raw message payload',async()=>{
  const box=runtime();
  const result=await box.instance.run({message:'secreto que no debe ir al trace'},'ASSISTED');
  assert.ok(box.audits.length>=3);
  assert.equal(box.metrics.length,1);
  assert.equal(JSON.stringify(result.trace).includes('secreto que no debe ir al trace'),false);
  assert.equal(result.trace.runtimeId,'test-runtime');
});
