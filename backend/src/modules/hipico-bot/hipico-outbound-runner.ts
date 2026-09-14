import { cloudOutboundPolicy, cloudTransportConfiguration } from './hipico-outbound-policy.js';
import { dispatchCanonicalOutbound } from './hipico-outbound-worker.js';
import { canonicalOutboxReadiness, configuredOutboxOwnerId } from './hipico-outbox.store.js';

type RuntimeEnv=NodeJS.ProcessEnv|Record<string,string|undefined>;
type RunnerDeps={
  owner:()=>string|null;
  readiness:()=>Promise<{ready:boolean}>;
  policy:()=>{enabled:boolean;reasons?:string[]};
  transport:()=>{configured:boolean;reasons?:string[]};
  dispatch:(input:{ownerId:string;allowApprovalRequired:boolean})=>Promise<{status:string}>;
};

const defaultDeps:RunnerDeps={
  owner:configuredOutboxOwnerId,
  readiness:canonicalOutboxReadiness,
  policy:cloudOutboundPolicy,
  transport:cloudTransportConfiguration,
  dispatch:(input)=>dispatchCanonicalOutbound(input)
};

function boundedInteger(value:unknown,fallback:number,min:number,max:number){
  const parsed=Number(value);
  if(!Number.isFinite(parsed))return fallback;
  return Math.min(max,Math.max(min,Math.trunc(parsed)));
}

export function runnerConfiguration(env:RuntimeEnv=process.env){
  return{
    enabled:String(env.HIPICO_OUTBOX_WORKER_ENABLED||'').trim().toLowerCase()==='true',
    intervalMs:boundedInteger(env.HIPICO_OUTBOX_WORKER_INTERVAL_MS,5000,1000,60_000),
    maxPerCycle:boundedInteger(env.HIPICO_OUTBOX_WORKER_MAX_PER_CYCLE,10,1,50)
  };
}

export async function runCanonicalOutboundCycle(options:{maxPerCycle?:number}={},deps:RunnerDeps=defaultDeps){
  const maxPerCycle=boundedInteger(options.maxPerCycle,10,1,50);
  const ownerId=deps.owner();
  if(!ownerId)return{processed:0,reason:'owner_not_configured' as const};
  const policy=deps.policy();
  if(!policy.enabled)return{processed:0,reason:'outbound_policy_disabled' as const,reasons:policy.reasons||[]};
  const transport=deps.transport();
  if(!transport.configured)return{processed:0,reason:'transport_not_configured' as const,reasons:transport.reasons||[]};
  const readiness=await deps.readiness();
  if(!readiness.ready)return{processed:0,reason:'outbox_not_ready' as const};

  let processed=0;
  for(let index=0;index<maxPerCycle;index+=1){
    const result=await deps.dispatch({ownerId,allowApprovalRequired:false});
    if(result.status==='not_claimed')return{processed,reason:'empty' as const};
    processed+=1;
  }
  return{processed,reason:'cycle_limit' as const};
}

export function startCanonicalOutboundRunner(env:RuntimeEnv=process.env,deps:RunnerDeps=defaultDeps){
  const config=runnerConfiguration(env);
  if(!config.enabled)return()=>{};
  let stopped=false;
  let running=false;
  let timer:NodeJS.Timeout|null=null;

  const schedule=()=>{
    if(stopped)return;
    timer=setTimeout(tick,config.intervalMs);
    timer.unref?.();
  };
  const tick=async()=>{
    if(stopped)return;
    if(running){schedule();return;}
    running=true;
    try{
      const result=await runCanonicalOutboundCycle({maxPerCycle:config.maxPerCycle},deps);
      if(result.processed>0)console.info('[hipico-outbox] runner cycle',{processed:result.processed,reason:result.reason});
    }catch(error:any){
      console.error('[hipico-outbox] runner cycle failed',{error:error?.message||String(error),code:error?.code||null});
    }finally{
      running=false;
      schedule();
    }
  };

  void tick();
  return()=>{
    stopped=true;
    if(timer)clearTimeout(timer);
  };
}

export const __test__={boundedInteger};
