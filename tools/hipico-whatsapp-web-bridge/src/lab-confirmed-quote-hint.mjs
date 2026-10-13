import {planLabConversation,stableLabSenderKey} from './lab-conversation-context.mjs';
import {explicitLabRaceScope,labReadOnlyQueryPurpose} from './lab-canonical-query.mjs';

// Hints are NON-AUTHORITATIVE. Do not create one from an ambiguous message,
// even if a delivery ACK was recorded before a process restart. Both normal
// ACK and crash-recovery must call this exact eligibility function.
export function confirmedLabQuoteHint(row,classification){
  if(!row?.id||row.fromMe||row.hasMedia||!stableLabSenderKey(row.id)||
     classification?.risk!=='safe')return null;
  const scope=explicitLabRaceScope(row.text);
  if(!scope||!labReadOnlyQueryPurpose(row.text,classification))return null;
  const plan=planLabConversation(row,classification,null,scope);
  if(plan.scopeConflict||!plan.rememberRace||!plan.raceScope||
     plan.raceNumber!==scope.raceNumber||
     plan.raceScope.racetrack!==scope.racetrack||
     plan.raceScope.raceDate!==scope.raceDate)return null;
  return scope;
}
