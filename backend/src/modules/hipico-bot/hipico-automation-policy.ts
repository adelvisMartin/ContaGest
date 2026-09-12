export const AUTOMATION_STATES=['DISABLED','SHADOW','ASSISTED','AUTOMATIC_LOW_RISK','AUTOMATIC'] as const;
export type AutomationState=typeof AUTOMATION_STATES[number];

export const AGENT_TOOLS=[
  'queryCurrentMeeting','queryCurrentRace','queryNextRace','queryLastResult',
  'queryParticipant','queryHorse','queryProvider','queryDocument',
  'proposeResponse','requestHumanReview'
] as const;
export type AgentTool=typeof AGENT_TOOLS[number];

export const AUTOMATIC_LOW_RISK_TOOLS=[
  'queryCurrentMeeting','queryCurrentRace','queryNextRace','queryLastResult',
  'queryParticipant','queryHorse','queryProvider','queryDocument'
] as const satisfies readonly AgentTool[];

export type AutomationMetrics={
  reviewed:number;
  matched:number;
  highRiskFalsePositive:number;
  unauthorizedAction:number;
  conflicts:number;
};

export type PromotionDecision={
  allowed:boolean;
  reason:string;
  metrics:{accuracy:number;conflictRate:number};
};

export type AutomationScope={
  ownerId:string;
  groupKey:string;
  groupId:string;
};

export type AgentCandidate={
  intent:string;
  confidence:number;
  tool:AgentTool|null;
  arguments:Record<string,unknown>;
  risk:'safe'|'review'|'monetary';
  source:'deterministic'|'model';
  modelVersion:string|null;
};

export interface DeterministicAutomationParser {
  parse(text:string):Omit<AgentCandidate,'source'|'modelVersion'>;
}
export interface StructuredAutomationCandidateGenerator {
  id:string;
  generate(input:{text:string;deterministic:AgentCandidate}):Promise<unknown>;
}

const CANDIDATE_KEYS=new Set(['intent','confidence','tool','arguments','risk','modelVersion']);
const FORBIDDEN_ARGUMENT_KEY=/(?:^|_)(?:sql|rawsql|shell|command|child_process|exec|spawn|password|token|secret|api_key|apikey|admin|role|permission|policy|ownerid|owner_id|groupid|group_id|groupkey|group_key|__proto__|prototype|constructor)(?:$|_)/i;
const TOOL_SET=new Set<string>(AGENT_TOOLS);
const LOW_RISK_TOOL_SET=new Set<string>(AUTOMATIC_LOW_RISK_TOOLS);

function boundedString(value:unknown,max:number){
  return String(value??'').trim().slice(0,max);
}

function plainObject(value:unknown):value is Record<string,unknown>{
  return Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
}

function assertSafeArgumentTree(value:unknown,depth=0):void{
  if(depth>6)throw new Error('AGENT_TOOL_ARGUMENTS_TOO_DEEP');
  if(value===null||value===undefined||typeof value==='string'||typeof value==='number'||typeof value==='boolean')return;
  if(Array.isArray(value)){
    if(value.length>50)throw new Error('AGENT_TOOL_ARGUMENTS_TOO_LARGE');
    value.forEach((item)=>assertSafeArgumentTree(item,depth+1));
    return;
  }
  if(!plainObject(value))throw new Error('AGENT_TOOL_ARGUMENTS_REJECTED');
  for(const [key,item] of Object.entries(value)){
    if(FORBIDDEN_ARGUMENT_KEY.test(key))throw new Error('AGENT_TOOL_ARGUMENTS_REJECTED');
    assertSafeArgumentTree(item,depth+1);
  }
}

function rates(metrics:AutomationMetrics){
  const reviewed=Math.max(0,Number(metrics.reviewed)||0);
  return{
    accuracy:reviewed?Math.max(0,Number(metrics.matched)||0)/reviewed:0,
    conflictRate:reviewed?Math.max(0,Number(metrics.conflicts)||0)/reviewed:1
  };
}

export function canPromoteAutomation(
  current:AutomationState,
  target:AutomationState,
  metrics:AutomationMetrics,
  ownerApproved=false
):PromotionDecision{
  const calculated=rates(metrics);
  const currentIndex=AUTOMATION_STATES.indexOf(current);
  const targetIndex=AUTOMATION_STATES.indexOf(target);
  if(currentIndex<0||targetIndex<0)return{allowed:false,reason:'AUTOMATION_STATE_INVALID',metrics:calculated};
  if(targetIndex<=currentIndex)return{allowed:true,reason:targetIndex===currentIndex?'STATE_UNCHANGED':'SAFE_DOWNGRADE',metrics:calculated};
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

export function validateModelCandidate(value:unknown):AgentCandidate{
  if(!plainObject(value))throw new Error('AGENT_CANDIDATE_SCHEMA_INVALID');
  if(Object.keys(value).some((key)=>!CANDIDATE_KEYS.has(key)))throw new Error('AGENT_CANDIDATE_SCHEMA_INVALID');
  const intent=boundedString(value.intent,120);
  const confidence=Number(value.confidence);
  const tool=value.tool==null?null:String(value.tool);
  const risk=value.risk;
  if(!intent||!Number.isFinite(confidence)||confidence<0||confidence>1)throw new Error('AGENT_CANDIDATE_SCHEMA_INVALID');
  if(tool!==null&&!TOOL_SET.has(tool))throw new Error('AGENT_CANDIDATE_SCHEMA_INVALID');
  if(risk!=='safe'&&risk!=='review'&&risk!=='monetary')throw new Error('AGENT_CANDIDATE_SCHEMA_INVALID');
  const args=value.arguments===undefined?{}:value.arguments;
  if(!plainObject(args))throw new Error('AGENT_CANDIDATE_SCHEMA_INVALID');
  assertSafeArgumentTree(args);
  const encoded=JSON.stringify(args);
  if(encoded.length>4000)throw new Error('AGENT_TOOL_ARGUMENTS_TOO_LARGE');
  return{
    intent,
    confidence,
    tool:tool as AgentTool|null,
    arguments:JSON.parse(encoded),
    risk,
    source:'model',
    modelVersion:boundedString(value.modelVersion,120)||null
  };
}

export function agentCanAct(mode:AutomationState,candidate:AgentCandidate){
  if(mode!=='AUTOMATIC_LOW_RISK'&&mode!=='AUTOMATIC')return false;
  if(candidate.risk!=='safe'||candidate.tool===null)return false;
  return LOW_RISK_TOOL_SET.has(candidate.tool);
}

export function safeToolRequest(candidate:AgentCandidate,scope:AutomationScope){
  if(!candidate.tool)return null;
  if(!TOOL_SET.has(candidate.tool))throw new Error('AGENT_TOOL_NOT_ALLOWED');
  assertSafeArgumentTree(candidate.arguments);
  const args=JSON.parse(JSON.stringify(candidate.arguments||{}));
  const encoded=JSON.stringify(args);
  if(encoded.length>4000)throw new Error('AGENT_TOOL_ARGUMENTS_TOO_LARGE');
  return{
    tool:candidate.tool,
    arguments:args,
    scope:{
      groupKey:scope.groupKey,
      groupId:scope.groupId
    }
  };
}

export const __test__={assertSafeArgumentTree};
