import { classify } from '../hipico-bot/hipico-operational-classifier.js';
import { classifyRaceQueryIntent, type RaceQueryIntent } from './race-lifecycle.js';
import { HipicoAgentEngine, type AgentTool, type DeterministicAgentParser } from './agent-policy.js';

const QUERY_TO_TOOL:Partial<Record<RaceQueryIntent,AgentTool>>={
  NEXT_RACE:'queryNextRace',
  LAST_RESULT:'queryLastResult',
  RESULT:'queryLastResult',
  SCHEDULE:'querySchedule',
  SCRATCHES:'queryScratches',
  RUNNERS:'queryRunners',
  ODDS:'queryOdds',
  SCHEDULED_TIME:'queryScheduledTime',
  OFFICIALITY:'queryOfficiality',
  MEETING_STATUS:'queryMeetingStatus',
  ACTIVE_RACE:'queryRaceStatus',
  STATUS:'queryRaceStatus'
};

const parser:DeterministicAgentParser={
  parse(text:string){
    const query=classifyRaceQueryIntent(text);
    if(query!=='UNKNOWN'){
      const tool=QUERY_TO_TOOL[query]||'queryRaceStatus';
      return{intent:`query:${query}`,confidence:.995,tool,arguments:{text},risk:'safe'};
    }
    const result=classify(text);
    if(result.intent==='greeting'||result.intent==='help'||result.intent==='status_non_monetary'){
      return{intent:result.intent,confidence:result.confidence,tool:'queryRaceStatus',arguments:{text},risk:'safe'};
    }
    if(['race_open','race_close','race_result','result','day_close'].includes(result.intent)){
      return{intent:result.intent,confidence:result.confidence,tool:'proposeRaceCommand',arguments:{intent:result.intent,entities:result.entities||{}},risk:'review'};
    }
    return{intent:result.intent,confidence:result.confidence,tool:null,arguments:{},risk:result.risk};
  }
};

export function createDefaultHipicoAgentEngine(){return new HipicoAgentEngine(parser,null);}
export const deterministicAgentParser=parser;
