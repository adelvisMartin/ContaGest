import { loadHandoff } from './hipico-handoff.store.js';
import { conversationKey, recoverExpiredHandoff, type HandoffState } from './hipico-response-safety.js';
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
  const sourceKey=String(input.sourceGroupKey||'').trim();
  const labKey=String(input.labGroupKey||'').trim();
  // Both authorities are mandatory. Never downgrade to a one-channel check
  // because an env value is missing or two pins accidentally overlap.
  if(!sender||!sourceKey||!labKey||sourceKey===labKey){
    return{allowed:false,reason:'LAB_HANDOFF_SCOPE_INVALID'};
  }
  const keys=[sourceKey,labKey];
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
      const state=await read(groupKey,sender,context);
      // Do not authorize an autonomous send from an inconsistent DB row or a
      // mistaken loader key. Handoff records are scoped to the same exact
      // participant, channel and optional race as the caller.
      if(!state || state.conversationKey!==conversationKey(groupKey,sender,context) ||
          state.groupKey!==groupKey || state.participantId!==sender ||
          state.raceId!==context ||
          !['bot','human'].includes(state.ownership) ||
          !Number.isInteger(state.clarificationCount) ||
          state.clarificationCount<0){
        return{allowed:false,reason:'LAB_HANDOFF_HELD'};
      }
      const resolved=recoverExpiredHandoff(state,now);
      if(resolved.ownership!=='bot')return{allowed:false,reason:'LAB_HANDOFF_HELD'};
    }
  }
  return{allowed:true,reason:'LAB_HANDOFF_CLEAR'};
}
