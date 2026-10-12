import { loadHandoff } from './hipico-handoff.store.js';
import { recoverExpiredHandoff, type HandoffState } from './hipico-response-safety.js';
import { operationalRaceContextKey } from './hipico-race-context-key.js';

type Loader=(groupKey:string,participantId:string,raceId:string|null)=>Promise<HandoffState>;
export type LabHandoffCheck={allowed:boolean;reason:'LAB_HANDOFF_CLEAR'|'LAB_HANDOFF_HELD'|'LAB_HANDOFF_SCOPE_INVALID'};
type Race={raceNumber:number;racetrack:string;raceDate:string};

/**
 * LAB-only, read-only human ownership authority. Never trusts a WhatsApp
 * nickname, caller-provided tenant or operator ID. The route supplies only
 * pinned group keys and the normalized authenticated Bridge sender.
 *
 * Global takeover applies to every race. A race-specific takeover also
 * applies when that exact, validated race scope is supplied.
 * Any malformed state or DB failure must prevent an autonomous send.
 */
export async function checkLabHandoff(input:{
  sender:string;sourceGroupKey:string;labGroupKey:string;race?:Race|null;at?:Date
},read:Loader=loadHandoff):Promise<LabHandoffCheck>{
  const sender=String(input.sender||'').trim();
  const keys=[...new Set([input.sourceGroupKey,input.labGroupKey]
    .map(value=>String(value||'').trim()).filter(Boolean))];
  if(!sender||!keys.length)return{allowed:false,reason:'LAB_HANDOFF_SCOPE_INVALID'};
  const race=input.race??null;
  const date=String(race?.raceDate||'');
  const validDate=!race||(/^\d{4}-\d{2}-\d{2}$/.test(date)&&
    !Number.isNaN(Date.parse(date+'T00:00:00.000Z'))&&
    new Date(date+'T00:00:00.000Z').toISOString().slice(0,10)===date);
  const raceId=race&&validDate?operationalRaceContextKey(race):null;
  if(race&&(!validDate||!raceId))return{allowed:false,reason:'LAB_HANDOFF_SCOPE_INVALID'};
  const now=input.at??new Date();
  for(const groupKey of keys){
    for(const context of raceId?[null,raceId]:[null]){
      const state=recoverExpiredHandoff(await read(groupKey,sender,context),now);
      if(state.ownership!=='bot')return{allowed:false,reason:'LAB_HANDOFF_HELD'};
    }
  }
  return{allowed:true,reason:'LAB_HANDOFF_CLEAR'};
}
