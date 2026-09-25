export const UNIFIED_AGENT_MODES = ['DISABLED','SHADOW','ASSISTED','AUTOMATIC_LOW_RISK','AUTOMATIC'] as const;
export type UnifiedAgentMode = typeof UNIFIED_AGENT_MODES[number];

export const UNIFIED_AGENT_RISKS = ['safe','review','monetary'] as const;
export type UnifiedAgentRisk = typeof UNIFIED_AGENT_RISKS[number];

export const UNIFIED_AGENT_DISPOSITIONS = ['DENY','SHADOW','SUGGEST','HUMAN_REQUIRED','AUTO'] as const;
export type UnifiedAgentDisposition = typeof UNIFIED_AGENT_DISPOSITIONS[number];

export type UnifiedAgentSource = 'rules'|'deterministic'|'model';

export type UnifiedAgentToolRequest = {
  name: string;
  arguments: Record<string, unknown>;
};

export type UnifiedAgentProposal<TOutput=unknown> = {
  intent: string;
  confidence: number;
  risk: UnifiedAgentRisk;
  source: UnifiedAgentSource;
  modelVersion?: string|null;
  tool?: UnifiedAgentToolRequest|null;
  output: TOutput;
};

export type UnifiedAgentPolicyDecision = {
  disposition: UnifiedAgentDisposition;
  reason: string;
  autonomousAllowed: boolean;
  humanRequired: boolean;
};

export type UnifiedAgentRuntimeTrace = {
  runtimeId: string;
  mode: UnifiedAgentMode;
  disposition: UnifiedAgentDisposition;
  reason: string;
  intent: string|null;
  risk: UnifiedAgentRisk|null;
  source: UnifiedAgentSource|null;
  toolName: string|null;
  toolValidated: boolean;
  promotionApproved: boolean;
  humanRequired: boolean;
  directEffectsApplied: boolean;
  durationMs: number;
};

export type UnifiedAgentAuditEvent = {
  stage: 'CONTEXT'|'POLICY'|'EXECUTION'|'COMPLETE';
  outcome: 'SUCCESS'|'HELD'|'DENIED'|'FAILED';
  trace: Omit<UnifiedAgentRuntimeTrace,'durationMs'> & { durationMs?: number };
};

export type UnifiedAgentRuntimeDependencies<TInput,TContext,TOutput,TExecution=unknown> = {
  runtimeId: string;
  contextBuilder(input:TInput): Promise<TContext>|TContext;
  decide(args:{input:TInput;context:TContext}): Promise<UnifiedAgentProposal<TOutput>>|UnifiedAgentProposal<TOutput>;
  policy(args:{
    input:TInput;
    context:TContext;
    proposal:UnifiedAgentProposal<TOutput>;
    mode:UnifiedAgentMode;
    toolValidated:boolean;
  }): Promise<UnifiedAgentPolicyDecision>|UnifiedAgentPolicyDecision;
  toolScope?: (request:UnifiedAgentToolRequest)=>Promise<UnifiedAgentToolRequest>|UnifiedAgentToolRequest;
  promotion?: (args:{
    input:TInput;
    context:TContext;
    proposal:UnifiedAgentProposal<TOutput>;
    policy:UnifiedAgentPolicyDecision;
    mode:UnifiedAgentMode;
  })=>Promise<boolean>|boolean;
  executor?: (args:{
    input:TInput;
    context:TContext;
    proposal:UnifiedAgentProposal<TOutput>;
    tool:UnifiedAgentToolRequest;
  })=>Promise<TExecution>|TExecution;
  audit?: (event:UnifiedAgentAuditEvent)=>Promise<void>|void;
  metrics?: (trace:UnifiedAgentRuntimeTrace)=>Promise<void>|void;
};

export type UnifiedAgentRuntimeResult<TContext,TOutput,TExecution=unknown> = {
  context:TContext|null;
  proposal:UnifiedAgentProposal<TOutput>|null;
  policy:UnifiedAgentPolicyDecision;
  toolRequest:UnifiedAgentToolRequest|null;
  execution:TExecution|null;
  trace:UnifiedAgentRuntimeTrace;
};

const bounded=(value:unknown,max:number)=>String(value??'').trim().slice(0,max);

function assertMode(mode:UnifiedAgentMode){
  if(!(UNIFIED_AGENT_MODES as readonly string[]).includes(mode)) throw new Error('AGENT_RUNTIME_MODE_INVALID');
}

function validateProposal<TOutput>(proposal:UnifiedAgentProposal<TOutput>){
  const intent=bounded(proposal?.intent,120);
  const confidence=Number(proposal?.confidence);
  if(!intent) throw new Error('AGENT_RUNTIME_INTENT_REQUIRED');
  if(!Number.isFinite(confidence)||confidence<0||confidence>1) throw new Error('AGENT_RUNTIME_CONFIDENCE_INVALID');
  if(!(UNIFIED_AGENT_RISKS as readonly string[]).includes(proposal?.risk)) throw new Error('AGENT_RUNTIME_RISK_INVALID');
  if(!['rules','deterministic','model'].includes(proposal?.source)) throw new Error('AGENT_RUNTIME_SOURCE_INVALID');
  if(proposal.tool){
    const name=bounded(proposal.tool.name,120);
    if(!name) throw new Error('AGENT_RUNTIME_TOOL_INVALID');
    if(!proposal.tool.arguments||typeof proposal.tool.arguments!=='object'||Array.isArray(proposal.tool.arguments)) throw new Error('AGENT_RUNTIME_TOOL_ARGUMENTS_INVALID');
  }
  return {...proposal,intent,confidence};
}

function hardGate<TOutput>(
  mode:UnifiedAgentMode,
  proposal:UnifiedAgentProposal<TOutput>,
  policy:UnifiedAgentPolicyDecision,
  toolValidated:boolean,
  promotionApproved:boolean
):UnifiedAgentPolicyDecision{
  if(policy.disposition==='DENY') return {...policy,disposition:'DENY',autonomousAllowed:false,humanRequired:false};
  if(mode==='DISABLED') return {disposition:'DENY',reason:'RUNTIME_DISABLED',autonomousAllowed:false,humanRequired:false};
  if(mode==='SHADOW') return {disposition:'SHADOW',reason:'SHADOW_MODE',autonomousAllowed:false,humanRequired:false};
  if(mode==='ASSISTED'){
    if(policy.humanRequired||proposal.risk!=='safe') return {disposition:'HUMAN_REQUIRED',reason:policy.reason||'ASSISTED_HUMAN_GATE',autonomousAllowed:false,humanRequired:true};
    return {disposition:'SUGGEST',reason:policy.reason||'ASSISTED_MODE',autonomousAllowed:false,humanRequired:false};
  }
  if(proposal.risk!=='safe') return {disposition:'HUMAN_REQUIRED',reason:'RISK_REQUIRES_HUMAN',autonomousAllowed:false,humanRequired:true};
  if(proposal.tool&&!toolValidated) return {disposition:'DENY',reason:'TOOL_SCOPE_REJECTED',autonomousAllowed:false,humanRequired:false};
  if(policy.disposition!=='AUTO'||!policy.autonomousAllowed) return {disposition:'HUMAN_REQUIRED',reason:policy.reason||'POLICY_REQUIRES_HUMAN',autonomousAllowed:false,humanRequired:true};
  if(!promotionApproved) return {disposition:'HUMAN_REQUIRED',reason:'PROMOTION_GATE_REQUIRED',autonomousAllowed:false,humanRequired:true};
  return {disposition:'AUTO',reason:policy.reason||'AUTO_ALLOWED',autonomousAllowed:true,humanRequired:false};
}

export class UnifiedAgentRuntime<TInput,TContext,TOutput,TExecution=unknown>{
  constructor(private readonly deps:UnifiedAgentRuntimeDependencies<TInput,TContext,TOutput,TExecution>){
    if(!bounded(deps.runtimeId,80)) throw new Error('AGENT_RUNTIME_ID_REQUIRED');
  }

  async run(input:TInput,mode:UnifiedAgentMode='ASSISTED'):Promise<UnifiedAgentRuntimeResult<TContext,TOutput,TExecution>>{
    assertMode(mode);
    const started=Date.now();
    const baseTrace=()=>({
      runtimeId:bounded(this.deps.runtimeId,80),
      mode,
      disposition:'DENY' as UnifiedAgentDisposition,
      reason:'UNRESOLVED',
      intent:null,
      risk:null,
      source:null,
      toolName:null,
      toolValidated:false,
      promotionApproved:false,
      humanRequired:false,
      directEffectsApplied:false
    });

    if(mode==='DISABLED'){
      const policy:UnifiedAgentPolicyDecision={disposition:'DENY',reason:'RUNTIME_DISABLED',autonomousAllowed:false,humanRequired:false};
      const trace:UnifiedAgentRuntimeTrace={...baseTrace(),...policy,durationMs:Date.now()-started};
      await this.deps.audit?.({stage:'COMPLETE',outcome:'DENIED',trace});
      await this.deps.metrics?.(trace);
      return {context:null,proposal:null,policy,toolRequest:null,execution:null,trace};
    }

    const context=await this.deps.contextBuilder(input);
    await this.deps.audit?.({stage:'CONTEXT',outcome:'SUCCESS',trace:baseTrace()});

    const proposal=validateProposal(await this.deps.decide({input,context}));
    let toolRequest:UnifiedAgentToolRequest|null=null;
    let toolValidated=!proposal.tool;
    if(proposal.tool&&this.deps.toolScope){
      try{
        toolRequest=await this.deps.toolScope(proposal.tool);
        toolValidated=Boolean(toolRequest);
      }catch{
        toolValidated=false;
      }
    }

    const requestedPolicy=await this.deps.policy({input,context,proposal,mode,toolValidated});
    let promotionApproved=mode==='SHADOW'||mode==='ASSISTED'
      ? false
      : Boolean(await this.deps.promotion?.({input,context,proposal,policy:requestedPolicy,mode}));
    if((mode==='AUTOMATIC'||mode==='AUTOMATIC_LOW_RISK')&&!this.deps.promotion) promotionApproved=false;

    const policy=hardGate(mode,proposal,requestedPolicy,toolValidated,promotionApproved);
    const common={
      runtimeId:bounded(this.deps.runtimeId,80),
      mode,
      disposition:policy.disposition,
      reason:bounded(policy.reason,160),
      intent:proposal.intent,
      risk:proposal.risk,
      source:proposal.source,
      toolName:proposal.tool?.name||null,
      toolValidated,
      promotionApproved,
      humanRequired:policy.humanRequired,
      directEffectsApplied:false
    };
    await this.deps.audit?.({
      stage:'POLICY',
      outcome:policy.disposition==='DENY'?'DENIED':policy.disposition==='AUTO'?'SUCCESS':'HELD',
      trace:common
    });

    let execution:TExecution|null=null;
    let directEffectsApplied=false;
    if(policy.disposition==='AUTO'&&toolRequest){
      if(!this.deps.executor){
        const denied:UnifiedAgentPolicyDecision={disposition:'DENY',reason:'EXECUTOR_NOT_CONFIGURED',autonomousAllowed:false,humanRequired:false};
        const trace:UnifiedAgentRuntimeTrace={...common,...denied,directEffectsApplied:false,durationMs:Date.now()-started};
        await this.deps.audit?.({stage:'EXECUTION',outcome:'DENIED',trace});
        await this.deps.audit?.({stage:'COMPLETE',outcome:'DENIED',trace});
        await this.deps.metrics?.(trace);
        return {context,proposal,policy:denied,toolRequest,execution:null,trace};
      }
      try{
        execution=await this.deps.executor({input,context,proposal,tool:toolRequest});
        directEffectsApplied=true;
        await this.deps.audit?.({stage:'EXECUTION',outcome:'SUCCESS',trace:{...common,directEffectsApplied:true}});
      }catch(error){
        const trace:UnifiedAgentRuntimeTrace={...common,disposition:'DENY',reason:'EXECUTION_FAILED',directEffectsApplied:false,durationMs:Date.now()-started};
        await this.deps.audit?.({stage:'EXECUTION',outcome:'FAILED',trace});
        await this.deps.audit?.({stage:'COMPLETE',outcome:'FAILED',trace});
        await this.deps.metrics?.(trace);
        throw error;
      }
    }

    const trace:UnifiedAgentRuntimeTrace={...common,directEffectsApplied,durationMs:Date.now()-started};
    await this.deps.audit?.({
      stage:'COMPLETE',
      outcome:trace.disposition==='DENY'?'DENIED':trace.disposition==='AUTO'?'SUCCESS':'HELD',
      trace
    });
    await this.deps.metrics?.(trace);
    return {context,proposal,policy,toolRequest,execution,trace};
  }
}

export const __test__={bounded,validateProposal,hardGate};
