type EventRow={
  id?:string;
  sender?:string;
  intent?:string;
  body?:string;
  receivedAt?:string|Date;
  payload?:any;
};

type Offer={
  id:string;
  eventId:string;
  sender:string;
  role:'player'|'receiver';
  play:string;
  horse:string;
  amount:number;
  segmentId:number;
  receivedAt:string;
  body:string;
};

type Match={
  id:string;
  segmentId:number;
  play:string;
  horse:string;
  amount:number;
  player:string;
  receiver:string;
  playerEventId:string;
  receiverEventId:string;
};

const dateValue=(value:any)=>{
  const date=new Date(value||0);
  return Number.isFinite(date.getTime())?date.getTime():0;
};

const eventEntities=(row:EventRow)=>row?.payload?.operational||{};

function offerFromEvent(row:EventRow,segmentId:number):Offer|null{
  if(!['offer_player','offer_receiver'].includes(String(row.intent||'')))return null;
  const entities=eventEntities(row);
  const source=entities?.offers?.[0]||entities;
  const amount=Number(source?.amount);
  const play=String(source?.play||'').trim().toUpperCase();
  const horse=String(source?.horse||'').trim().toUpperCase();
  if(!Number.isFinite(amount)||amount<=0||!play||!horse)return null;
  return{
    id:`offer:${String(row.id||'unknown')}`,
    eventId:String(row.id||''),
    sender:String(row.sender||'unknown'),
    role:String(row.intent)==='offer_receiver'?'receiver':'player',
    play,
    horse,
    amount,
    segmentId,
    receivedAt:new Date(dateValue(row.receivedAt)).toISOString(),
    body:String(row.body||'')
  };
}

function compatible(left:Offer,right:Offer){
  return left.play===right.play&&left.horse===right.horse&&left.sender!==right.sender&&left.segmentId===right.segmentId;
}

function matchOffers(offers:Offer[]){
  const players=offers.filter((offer)=>offer.role==='player').map((offer)=>({offer,remaining:offer.amount}));
  const receivers=offers.filter((offer)=>offer.role==='receiver').map((offer)=>({offer,remaining:offer.amount}));
  const matches:Match[]=[];

  for(const player of players){
    for(const receiver of receivers){
      if(player.remaining<=0||receiver.remaining<=0||!compatible(player.offer,receiver.offer))continue;
      const amount=Math.min(player.remaining,receiver.remaining);
      matches.push({
        id:`match:${player.offer.eventId}:${receiver.offer.eventId}:${matches.length+1}`,
        segmentId:player.offer.segmentId,
        play:player.offer.play,
        horse:player.offer.horse,
        amount,
        player:player.offer.sender,
        receiver:receiver.offer.sender,
        playerEventId:player.offer.eventId,
        receiverEventId:receiver.offer.eventId
      });
      player.remaining-=amount;
      receiver.remaining-=amount;
    }
  }

  const remainingByEvent=new Map<string,number>();
  for(const item of [...players,...receivers])remainingByEvent.set(item.offer.eventId,item.remaining);
  const unmatched=offers
    .map((offer)=>({...offer,remaining:remainingByEvent.get(offer.eventId)??offer.amount}))
    .filter((offer)=>offer.remaining>0);
  return{matches,unmatched};
}

/**
 * Read-only projection of recent group events. It mirrors the RC1 matching
 * contract without writing bets, balances, races or results.
 *
 * A race_close freezes the current segment. A reviewed/structured race_open or
 * a new plan_snapshot starts the following segment when the prior race was
 * closed. Offers received while closed remain late and are excluded from
 * matching. This projection never authorizes state or monetary effects.
 */
export function buildShadowProjection(rows:EventRow[]=[]){
  const ordered=[...rows].sort((a,b)=>dateValue(a.receivedAt)-dateValue(b.receivedAt));
  let segmentId=1;
  let closed=false;
  const offers:Offer[]=[];
  const lateOffers:Offer[]=[];
  const openings:any[]=[];
  const closures:any[]=[];
  const results:any[]=[];
  const confirmations:any[]=[];
  const corrections:any[]=[];
  const settlements:any[]=[];
  const balances:any[]=[];

  for(const row of ordered){
    const intent=String(row.intent||'');
    const entities=eventEntities(row);

    if(intent==='race_open'){
      if(closed){segmentId+=1;closed=false;}
      openings.push({
        eventId:row.id,
        segmentId,
        raceNumber:entities?.raceNumber??null,
        racetrack:entities?.racetrack??null,
        raceContextComplete:Boolean(entities?.raceContextComplete),
        receivedAt:row.receivedAt
      });
      continue;
    }

    if(intent==='plan_snapshot'){
      if(closed){segmentId+=1;closed=false;}
      continue;
    }

    if(intent==='race_close'){
      closed=true;
      closures.push({eventId:row.id,segmentId,raceNumber:entities?.raceNumber??null,receivedAt:row.receivedAt});
      continue;
    }

    if(intent==='day_close'){
      closed=true;
      closures.push({eventId:row.id,segmentId,dayClose:true,receivedAt:row.receivedAt});
      continue;
    }

    if(intent==='race_result'){
      results.push({eventId:row.id,segmentId,board:entities?.board||[],receivedAt:row.receivedAt});
      continue;
    }

    if(intent==='offer_confirmation'||intent==='pending_confirmation'){
      confirmations.push({eventId:row.id,segmentId,intent,sender:row.sender,confirmation:entities?.confirmation||row.body||'',receivedAt:row.receivedAt});
      continue;
    }

    if(intent==='cancel_or_correction'){
      corrections.push({eventId:row.id,segmentId,sender:row.sender,body:row.body||'',receivedAt:row.receivedAt});
      continue;
    }

    if(intent==='settlement_snapshot'){
      settlements.push({eventId:row.id,segmentId,rows:entities?.settlementRows||[],receivedAt:row.receivedAt});
      continue;
    }

    if(intent==='balance_snapshot'){
      balances.push({eventId:row.id,segmentId,rows:entities?.balances||[],receivedAt:row.receivedAt});
      continue;
    }

    const offer=offerFromEvent(row,segmentId);
    if(!offer)continue;
    if(closed)lateOffers.push(offer);
    else offers.push(offer);
  }

  const matched=matchOffers(offers);
  return{
    mode:'shadow',
    segments:segmentId,
    closed,
    stats:{
      events:ordered.length,
      offers:offers.length,
      matches:matched.matches.length,
      unmatched:matched.unmatched.length,
      lateOffers:lateOffers.length,
      openings:openings.length,
      closures:closures.length,
      results:results.length,
      confirmations:confirmations.length,
      corrections:corrections.length,
      settlements:settlements.length,
      balances:balances.length
    },
    matches:matched.matches,
    unmatched:matched.unmatched,
    lateOffers,
    openings,
    closures,
    results,
    confirmations,
    corrections,
    settlements,
    balances
  };
}