export const AUTOMATION_STATES=['DISABLED','SHADOW','ASSISTED','AUTOMATIC_LOW_RISK','AUTOMATIC'] as const;
export type AutomationState=typeof AUTOMATION_STATES[number];

export const AGENT_TOOLS=[
  'queryRaceStatus','queryNextRace','queryLastResult','querySchedule','queryScratches','queryRunners','queryOdds',
  'queryScheduledTime','queryOfficiality','queryMeetingStatus','proposeRaceCommand'
] as const;
export type AgentTool=typeof AGENT_TOOLS[number];
export const AUTO_EXECUTABLE_AGENT_TOOLS=[
  'queryRaceStatus','queryNextRace','queryLastResult','querySchedule','queryScratches','queryRunners','queryOdds',
  'queryScheduledTime','queryOfficiality','queryMeetingStatus'
] as const satisfies readonly AgentTool[];

export type AutomationMetrics={
  reviewed:number;
  matched:number;
  highRiskFalsePositive:number;
  unauthorizedAction:number;
  conflicts:number;
};

export type PromotionDecision={allowed:boolean;reason:string;metrics:{accuracy:number;conflictRate:number}};

function rates(metrics:AutomationMetrics){
  const reviewed=Math.max(0,metrics.reviewed);const accuracy=reviewed?metrics.matched/reviewed:0;const conflictRate=reviewed?metrics.conflicts/reviewed:1;
  return{accuracy,conflictRate};
}

export function canPromoteAutomation(current:AutomationState,target:AutomationState,metrics:AutomationMetrics,ownerApproved=false):PromotionDecision{
  const calculated=rates(metrics);
  const order:AutomationState[]=['DISABLED','SHADOW','ASSISTED','AUTOMATIC_LOW_RISK','AUTOMATIC'];
  const currentIndex=order.indexOf(current),targetIndex=order.indexOf(target);
  if(targetIndex<=currentIndex)return{allowed:true,reason:'DOWNGRADE_OR_SAME_STATE',metrics:calculated};
  if(targetIndex!==currentIndex+1)return{allowed:false,reason:'INVALID_PROMOTION_PATH',metrics:calculated};
  if(current==='DISABLED'&&target==='SHADOW')return{allowed:true,reason:'SHADOW_SAFE_DEFAULT',metrics:calculated};
  if(target==='ASSISTED'){
    const allowed=metrics.reviewed>=200&&calculated.accuracy>=.98&&metrics.highRiskFalsePositive===0&&metrics.unauthorizedAction===0;
    return{allowed,reason:allowed?'SHADOW_GATE_PASSED':'SHADOW_METRICS_INSUFFICIENT',metrics:calculated};
  }
  if(target==='AUTOMATIC_LOW_RISK'){
    const allowed=metrics.reviewed>=500&&calculated.accuracy>=.99&&calculated.conflictRate<=.005&&metrics.highRiskFalsePositive===0&&metrics.unauthorizedAction===0;
    return{allowed,reason:allowed?'LOW_RISK_GATE_PASSED':'LOW_RISK_METRICS_INSUFFICIENT',metrics:calculated};
  }
  if(target==='AUTOMATIC'){
    const allowed=ownerApproved&&metrics.reviewed>=1000&&calculated.accuracy>=.995&&calculated.conflictRate<=.002&&metrics.highRiskFalsePositive===0&&metrics.unauthorizedAction===0;
    return{allowed,reason:allowed?'AUTOMATIC_GATE_PASSED':ownerApproved?'AUTOMATIC_METRICS_INSUFFICIENT':'OWNER_APPROVAL_REQUIRED',metrics:calculated};
  }
  return{allowed:false,reason:'INVALID_PROMOTION_PATH',metrics:calculated};
}

export type AgentCandidate={
  intent:string;
  confidence:number;
  tool:AgentTool|null;
  arguments:Record<string,unknown>;
  risk:'safe'|'review'|'monetary';
  source:'deterministic'|'model';
  modelVersion:string|null;
};

export interface DeterministicAgentParser { parse(text:string):Omit<AgentCandidate,'source'|'modelVersion'>; }
export interface StructuredCandidateGenerator { id:string; generate(input:{text:string;deterministic:AgentCandidate}):Promise<unknown>; }

function boundedString(value:unknown,max:number){return String(value??'').trim().slice(0,max);}
function isAgentTool(value:unknown):value is AgentTool{return (AGENT_TOOLS as readonly unknown[]).includes(value);}
function isAutoExecutableTool(value:AgentTool|null){return value!==null&&(AUTO_EXECUTABLE_AGENT_TOOLS as readonly AgentTool[]).includes(value);}

export function validateModelCandidate(value:unknown):AgentCandidate{
  const row=(value&&typeof value==='object'?value:{}) as Record<string,unknown>;
  const intent=boundedString(row.intent,120);const confidence=Number(row.confidence);const tool=row.tool==null?null:row.tool;
  if(!intent||!Number.isFinite(confidence)||confidence<0||confidence>1||!isAgentTool(tool)&&tool!==null)throw new Error('AGENT_CANDIDATE_SCHEMA_INVALID');
  const risk=row.risk;
  if(risk!=='safe'&&risk!=='review'&&risk!=='monetary')throw new Error('AGENT_CANDIDATE_SCHEMA_INVALID');
  const args=row.arguments&&typeof row.arguments==='object'&&!Array.isArray(row.arguments)?row.arguments as Record<string,unknown>:{};
  return{intent,confidence,tool,arguments:args,risk,source:'model',modelVersion:boundedString(row.modelVersion,120)||null};
}

export function agentCanAct(mode:AutomationState,candidate:AgentCandidate){
  if(mode==='DISABLED'||mode==='SHADOW'||mode==='ASSISTED')return false;
  if(candidate.risk!=='safe'||!isAutoExecutableTool(candidate.tool))return false;
  return mode==='AUTOMATIC_LOW_RISK'||mode==='AUTOMATIC';
}

export function safeToolRequest(candidate:AgentCandidate){
  if(!candidate.tool)return null;
  const args=JSON.parse(JSON.stringify(candidate.arguments||{}));
  const encoded=JSON.stringify(args);
  if(encoded.length>4000)throw new Error('AGENT_TOOL_ARGUMENTS_TOO_LARGE');
  if(/(?:sql|shell|command|child_process|exec|spawn|password|token|secret|__proto__|prototype|constructor)/i.test(encoded))throw new Error('AGENT_TOOL_ARGUMENTS_REJECTED');
  return{tool:candidate.tool,arguments:args};
}

export class HipicoAgentEngine {
  constructor(private readonly parser:DeterministicAgentParser,private readonly generator:StructuredCandidateGenerator|null=null){}
  async evaluate(text:string,mode:AutomationState){
    const normalized=boundedString(text,4000);
    if(!normalized)throw new Error('AGENT_MESSAGE_REQUIRED');
    const deterministicBase=this.parser.parse(normalized);
    const deterministic:AgentCandidate={...deterministicBase,source:'deterministic',modelVersion:null};
    let candidate=deterministic;
    if(this.generator&&deterministic.confidence<.8){
      const generated=validateModelCandidate(await this.generator.generate({text:normalized,deterministic}));
      candidate={...generated,modelVersion:generated.modelVersion||this.generator.id};
    }
    const request=safeToolRequest(candidate);
    return{candidate,toolRequest:request,canAct:agentCanAct(mode,candidate),mode};
  }
}
