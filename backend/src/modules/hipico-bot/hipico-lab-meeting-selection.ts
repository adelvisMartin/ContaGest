/** Strict user-supplied meeting selector; never accepts tenant, channel or DB IDs. */
export type LabMeetingSelection =
  | {kind:'absent'}
  | {kind:'invalid'}
  | {kind:'explicit';meetingDate:string;venue:string|null};

function validISODate(value:string){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const date=new Date(value+'T00:00:00.000Z');
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}

/**
 * Supports "reunión del 2026-10-12 [en La Rinconada]".
 * A missing venue is allowed ONLY if exactly one persisted meeting matches date.
 * A malformed explicit selector must never fall back to the latest meeting.
 */
export function parseExplicitLabMeeting(text:string):LabMeetingSelection{
  const input=String(text||'');
  const marker=/\breuni[oó]n\s+(?:del?|para\s+el)\s+/iu.exec(input);
  if(!marker)return{kind:'absent'};
  const tail=input.slice(marker.index+marker[0].length).trimStart();
  const dateMatch=/^(\d{4}-\d{2}-\d{2})(.*)$/su.exec(tail);
  if(!dateMatch||!validISODate(dateMatch[1]))return{kind:'invalid'};
  const suffix=dateMatch[2].trim();
  if(!suffix||/^[?!.;,]+$/.test(suffix)){
    return{kind:'explicit',meetingDate:dateMatch[1],venue:null};
  }
  const venueMatch=/^en\s+(?:(?:el\s+)?hip[oó]dromo\s+)?([^?!.;,]+)[?!.;,]*$/iu.exec(suffix);
  if(!venueMatch)return{kind:'invalid'};
  const venue=venueMatch[1].trim().replace(/\s+/g,' ');
  if(venue.length<2||venue.length>64||/\b(?:y|o|otro|otra)\b/iu.test(venue)||
     !/^[\p{L}\d][\p{L}\d '-]*$/u.test(venue)){
    return{kind:'invalid'};
  }
  return{kind:'explicit',meetingDate:dateMatch[1],venue};
}
