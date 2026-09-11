import { compact } from './normalization.js';

function canonicalTrack(value){
  return compact(String(value||''))
    .replace(/\bCHURCHILL DOWN\b/g,'CHURCHILL DOWNS')
    .replace(/\bCOLONIAL DOWN\b/g,'COLONIAL DOWNS');
}

function sameTrack(left,right){
  const a=canonicalTrack(left),b=canonicalTrack(right);
  return Boolean(a&&b&&a===b);
}

function validRaceNumber(value){
  const number=Number(value);
  return Number.isInteger(number)&&number>0?number:null;
}

function messageIndex(messages,id){
  return messages.findIndex((message)=>message.id===id);
}

function nearestOpening(analysis,offer){
  const messages=analysis?.messages||[];
  const offerIndex=messageIndex(messages,offer.messageId);
  if(offerIndex<0)return null;
  const candidates=(analysis?.raceOpenings||[])
    .filter((opening)=>Number(opening.segmentId||1)===Number(offer.segmentId||1))
    .filter((opening)=>opening.raceContext?.actionable)
    .filter((opening)=>messageIndex(messages,opening.id)<=offerIndex)
    .sort((left,right)=>messageIndex(messages,right.id)-messageIndex(messages,left.id));
  return candidates[0]?.raceContext||null;
}

function appendReason(target,reason){
  target.reviewReasons=[...new Set([...(target.reviewReasons||[]),reason])];
  target.requiresApproval=true;
  target.needsReview=true;
}

function contextualizeOffer(analysis,offer){
  const message=(analysis?.messages||[]).find((item)=>item.id===offer.messageId);
  const messageContext=message?.raceContext||{};
  const opening=nearestOpening(analysis,offer)||{};

  // parseOffer already distinguishes text written in the offer from context inherited
  // from an opening. Preserve that decision here: an inherited message context must
  // never overwrite an explicit different track written by the participant.
  const offerTrack=String(offer.track||'').trim();
  const messageTrack=messageContext?.inherited?'':String(messageContext.track||'').trim();
  const directTrack=offerTrack||messageTrack;
  const directRace=validRaceNumber(offer.raceNumber) || (messageContext?.inherited?null:validRaceNumber(messageContext.raceNumber));
  const openingTrack=String(opening.track||'').trim();
  const openingRace=validRaceNumber(opening.raceNumber);
  const trackConflict=Boolean(directTrack&&openingTrack&&!sameTrack(directTrack,openingTrack));
  const raceConflict=Boolean(directRace&&openingRace&&directRace!==openingRace);
  const track=directTrack||openingTrack||'';
  // If the offer explicitly names a different track without a race ordinal, do
  // not manufacture the active opening's race number for that different track.
  const raceNumber=directRace || (trackConflict?null:openingRace) || null;
  offer.track=track;
  offer.raceNumber=raceNumber;
  offer.raceContext={track,raceNumber,source:directTrack||directRace?'message':openingTrack||openingRace?'opening':'none',complete:Boolean(track&&raceNumber),conflict:trackConflict||raceConflict};
  if(trackConflict||raceConflict)appendReason(offer,'contexto de carrera contradictorio');
  else if(!track||!raceNumber)appendReason(offer,'contexto de carrera incompleto');
  return offer;
}

function sameRaceContext(left,right){
  return Boolean(left?.complete&&right?.complete&&sameTrack(left.track,right.track)&&Number(left.raceNumber)===Number(right.raceNumber));
}

export function enrichOperationalRaceContext(analysis){
  if(!analysis||typeof analysis!=='object')return analysis;
  const offers=(analysis.offers||[]).map((offer)=>contextualizeOffer(analysis,offer));
  analysis.offers=offers;
  analysis.activeOffers=offers.filter((offer)=>!offer.duplicate);
  const byId=new Map(offers.map((offer)=>[offer.id,offer]));
  const accepted=[];
  const rejectedIds=new Set();

  for(const match of analysis.matches||[]){
    const player=byId.get(match.playerOfferIds?.[0]);
    const receiver=byId.get(match.receiverOfferIds?.[0]);
    const playerContext=player?.raceContext||null;
    const receiverContext=receiver?.raceContext||null;
    const bothComplete=Boolean(playerContext?.complete&&receiverContext?.complete);
    if(bothComplete&&!sameRaceContext(playerContext,receiverContext)){
      rejectedIds.add(player?.id);
      rejectedIds.add(receiver?.id);
      continue;
    }
    const complete=playerContext?.complete?playerContext:receiverContext?.complete?receiverContext:null;
    match.track=complete?.track||player?.track||receiver?.track||match.track||'';
    match.raceNumber=complete?.raceNumber||player?.raceNumber||receiver?.raceNumber||null;
    match.raceContext={
      track:match.track,
      raceNumber:match.raceNumber,
      complete:Boolean(match.track&&match.raceNumber),
      source:playerContext?.complete&&receiverContext?.complete?'both':complete?'single-offer':'none'
    };
    match.reviewReasons=[...new Set([...(match.reviewReasons||[]),...(player?.reviewReasons||[]),...(receiver?.reviewReasons||[])])];
    if(!match.raceContext.complete&&!match.reviewReasons.includes('contexto de carrera incompleto'))match.reviewReasons.push('contexto de carrera incompleto');
    match.requiresApproval=match.reviewReasons.length>0;
    match.needsReview=match.requiresApproval;
    accepted.push(match);
  }

  analysis.matches=accepted;
  const matchedIds=new Set(accepted.flatMap((match)=>[...(match.playerOfferIds||[]),...(match.receiverOfferIds||[])]));
  analysis.unmatched=analysis.activeOffers.filter((offer)=>!matchedIds.has(offer.id));
  for(const offer of analysis.unmatched){
    if(rejectedIds.has(offer.id))appendReason(offer,'oferta incompatible con contraparte de otra carrera');
  }
  analysis.stats={...(analysis.stats||{}),matches:accepted.length,unmatched:analysis.unmatched.length,raceContextRejected:rejectedIds.size};
  return analysis;
}

export function compareMatchToActiveRace(match,activeRace){
  if(!activeRace)return{status:'NO_ACTIVE_RACE',reason:'No hay una carrera activa.'};
  if(!match?.raceContext?.complete)return{status:'AMBIGUOUS',reason:'La pareja no tiene hipódromo y número de carrera verificables.'};
  const trackOk=sameTrack(match.raceContext.track,activeRace.racetrack);
  const raceOk=Number(match.raceContext.raceNumber)===Number(activeRace.number);
  if(!trackOk||!raceOk)return{status:'MISMATCH',reason:`La pareja corresponde a ${match.raceContext.track} ${match.raceContext.raceNumber} y la carrera activa es ${activeRace.racetrack} ${activeRace.number}.`};
  return{status:'MATCH',reason:'La pareja coincide con la carrera activa.'};
}

export const __test__={canonicalTrack,sameTrack,validRaceNumber,nearestOpening,sameRaceContext};
