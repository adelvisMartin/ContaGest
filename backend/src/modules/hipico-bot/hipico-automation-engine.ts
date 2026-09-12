import { classify } from './hipico-operational-classifier.js';
import {
  type AgentCandidate,
  type AutomationScope,
  type AutomationState,
  type DeterministicAutomationParser,
  type StructuredAutomationCandidateGenerator,
  agentCanAct,
  safeToolRequest,
  validateModelCandidate
} from './hipico-automation-policy.js';

const QUERY_RULES:Array<{pattern:RegExp;intent:string;tool:AgentCandidate['tool']}>= [
  {pattern:/\b(?:proxim[ao]|siguiente)\s+(?:carrera|race)\b/i,intent:'query:NEXT_RACE',tool:'queryNextRace'},
  {pattern:/\b(?:carrera|race)\s+(?:activa|actual|abierta)\b/i,intent:'query:CURRENT_RACE',tool:'queryCurrentRace'},
  {pattern:/\b(?:ultim[oa]|last)\s+(?:resultado|llegada|pizarra|result)\b/i,intent:'query:LAST_RESULT',tool:'queryLastResult'},
  {pattern:/\b(?:reunion|meeting)\s+(?:actual|activa|de hoy)?\b/i,intent:'query:CURRENT_MEETING',tool:'queryCurrentMeeting'},
  {pattern:/\b(?:participante|participant)\s+[\p{L}\p{N}_.-]{1,80}\b/iu,intent:'query:PARTICIPANT',tool:'queryParticipant'},
  {pattern:/\b(?:caballo|horse)\s+[\p{L}\p{N}_.-]{1,80}\b/iu,intent:'query:HORSE',tool:'queryHorse'},
  {pattern:/\b(?:proveedor|provider)\s+[\p{L}\p{N}_.-]{1,80}\b/iu,intent:'query:PROVIDER',tool:'queryProvider'},
  {pattern:/\b(?:pdf|documento|document)\b/i,intent:'query:DOCUMENT',tool:'queryDocument'}
];

const INJECTION_PATTERN=/\b(?:ignora|ignore)\b[\s\S]{0,80}\b(?:reglas?|policy|system|developer)\b|\b(?:system|developer)\s*:|\b(?:drop|alter|truncate)\s+table\b|\b(?:raw\s*sql|shell|child_process|exec|spawn|token|secret|password)\b/i;

function extractReference(text:string,prefix:RegExp){
  const match=text.match(prefix);
  return match?.[1]?.slice(0,80)||'';
}

export const deterministicAutomationParser:DeterministicAutomationParser={
  parse(text:string){
    if(INJECTION_PATTERN.test(text)){
      return{intent:'malicious_input',confidence:.999,tool:'requestHumanReview',arguments:{reason:'UNTRUSTED_INSTRUCTION_ATTEMPT'},risk:'review'};
    }
    for(const rule of QUERY_RULES){
      if(!rule.pattern.test(text))continue;
      const args:Record<string,unknown>={};
      if(rule.tool==='queryParticipant')args.participantRef=extractReference(text,/\b(?:participante|participant)\s+([\p{L}\p{N}_.-]{1,80})/iu);
      if(rule.tool==='queryHorse')args.horseRef=extractReference(text,/\b(?:caballo|horse)\s+([\p{L}\p{N}_.-]{1,80})/iu);
      if(rule.tool==='queryProvider')args.providerRef=extractReference(text,/\b(?:proveedor|provider)\s+([\p{L}\p{N}_.-]{1,80})/iu);
      if(rule.tool==='queryDocument')args.documentRef=extractReference(text,/\b(?:pdf|documento|document)\s*[:#-]?\s*([\p{L}\p{N}_.-]{1,80})/iu);
      return{intent:rule.intent,confidence:.995,tool:rule.tool,arguments:args,risk:'safe'};
    }

    if(/\b(?:retirad[oa]s?|scratch(?:es)?)\b/i.test(text)){
      return{intent:'query:SCRATCHES',confidence:.99,tool:'queryCurrentRace',arguments:{view:'scratches'},risk:'safe'};
    }

    const result=classify(text);
    if(result.intent==='greeting'||result.intent==='help'||result.intent==='status_non_monetary'){
      return{intent:result.intent,confidence:result.confidence,tool:'queryCurrentRace',arguments:{view:'status'},risk:'safe'};
    }
    if(result.risk==='monetary'){
      return{intent:result.intent,confidence:result.confidence,tool:'requestHumanReview',arguments:{reason:'MONETARY_INTENT'},risk:'monetary'};
    }
    if(result.intent==='conversation'&&result.confidence<.8){
      return{intent:'conversation',confidence:result.confidence,tool:'requestHumanReview',arguments:{reason:'AMBIGUOUS_MESSAGE'},risk:'review'};
    }
    if(['race_open','race_close','race_result','result','day_close','plan_snapshot','settlement_snapshot'].includes(result.intent)){
      return{intent:result.intent,confidence:result.confidence,tool:'proposeResponse',arguments:{intent:result.intent},risk:'review'};
    }
    return{intent:result.intent,confidence:result.confidence,tool:'requestHumanReview',arguments:{reason:'REVIEW_REQUIRED'},risk:'review'};
  }
};

export class HipicoAutomationEngine {
  constructor(
    private readonly parser:DeterministicAutomationParser=deterministicAutomationParser,
    private readonly generator:StructuredAutomationCandidateGenerator|null=null
  ){}

  async evaluate(text:string,mode:AutomationState,scope:AutomationScope){
    const normalized=String(text||'').trim().slice(0,4000);
    if(!normalized)throw new Error('AGENT_MESSAGE_REQUIRED');

    const parsed=this.parser.parse(normalized);
    const deterministic:AgentCandidate={...parsed,source:'deterministic',modelVersion:null};
    let candidate=deterministic;
    let modelRejected=false;

    if(this.generator&&deterministic.confidence<.8){
      try{
        const generated=validateModelCandidate(await this.generator.generate({text:normalized,deterministic}));
        candidate={...generated,modelVersion:generated.modelVersion||this.generator.id};
      }catch{
        modelRejected=true;
        candidate={
          intent:'model_candidate_rejected',
          confidence:1,
          tool:'requestHumanReview',
          arguments:{reason:'MODEL_OUTPUT_INVALID'},
          risk:'review',
          source:'deterministic',
          modelVersion:null
        };
      }
    }

    const toolRequest=safeToolRequest(candidate,scope);
    return{
      candidate,
      toolRequest,
      canAct:agentCanAct(mode,candidate),
      mode,
      modelRejected,
      authority:{databaseWrite:false,monetaryWrite:false,settlement:false}
    };
  }
}

export function createDefaultHipicoAutomationEngine(){
  return new HipicoAutomationEngine(deterministicAutomationParser,null);
}
