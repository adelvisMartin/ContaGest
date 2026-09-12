export const MAX_CANONICAL_PAYLOAD_BYTES=128*1024;
export const MAX_CANONICAL_PAYLOAD_DEPTH=12;
export const MAX_CANONICAL_PAYLOAD_NODES=5000;
export const MAX_CANONICAL_COLLECTION_ITEMS=1000;
export const MAX_CANONICAL_FUTURE_SKEW_MS=5*60*1000;

const ISO_TIMESTAMP_WITH_ZONE=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/;

export function canonicalPayloadIssue(value:unknown){
  if(value===undefined)return null;
  let encoded:string|undefined;
  try{encoded=JSON.stringify(value);}catch{return'HIPICO_NORMALIZED_PAYLOAD_INVALID';}
  if(encoded===undefined)return'HIPICO_NORMALIZED_PAYLOAD_INVALID';
  if(Buffer.byteLength(encoded,'utf8')>MAX_CANONICAL_PAYLOAD_BYTES)return'HIPICO_NORMALIZED_PAYLOAD_TOO_LARGE';

  const stack:Array<{value:unknown;depth:number}>=[{value,depth:0}];
  let nodes=0;
  while(stack.length){
    const current=stack.pop()!;
    nodes+=1;
    if(nodes>MAX_CANONICAL_PAYLOAD_NODES)return'HIPICO_NORMALIZED_PAYLOAD_TOO_COMPLEX';
    if(current.depth>MAX_CANONICAL_PAYLOAD_DEPTH)return'HIPICO_NORMALIZED_PAYLOAD_TOO_DEEP';
    const item=current.value;
    if(item===null||typeof item==='string'||typeof item==='boolean')continue;
    if(typeof item==='number'){
      if(!Number.isFinite(item))return'HIPICO_NORMALIZED_PAYLOAD_INVALID';
      continue;
    }
    if(Array.isArray(item)){
      if(item.length>MAX_CANONICAL_COLLECTION_ITEMS)return'HIPICO_NORMALIZED_PAYLOAD_TOO_COMPLEX';
      for(const child of item)stack.push({value:child,depth:current.depth+1});
      continue;
    }
    if(typeof item==='object'){
      const entries=Object.entries(item as Record<string,unknown>);
      if(entries.length>MAX_CANONICAL_COLLECTION_ITEMS)return'HIPICO_NORMALIZED_PAYLOAD_TOO_COMPLEX';
      for(const [key,child] of entries){
        if(!key||key.length>220)return'HIPICO_NORMALIZED_PAYLOAD_INVALID';
        stack.push({value:child,depth:current.depth+1});
      }
      continue;
    }
    return'HIPICO_NORMALIZED_PAYLOAD_INVALID';
  }
  return null;
}

export function canonicalTimestampIssue(value:string,nowMs=Date.now()){
  const raw=String(value||'');
  if(raw.length>64)return'HIPICO_EVENT_TIMESTAMP_INVALID';
  const match=raw.match(ISO_TIMESTAMP_WITH_ZONE);
  if(!match)return'HIPICO_EVENT_TIMESTAMP_INVALID';
  const [,yearRaw,monthRaw,dayRaw,hourRaw,minuteRaw,secondRaw,,zone]=match;
  const year=Number(yearRaw);
  const month=Number(monthRaw);
  const day=Number(dayRaw);
  const hour=Number(hourRaw);
  const minute=Number(minuteRaw);
  const second=Number(secondRaw);
  if(month<1||month>12||hour>23||minute>59||second>59)return'HIPICO_EVENT_TIMESTAMP_INVALID';
  const daysInMonth=new Date(Date.UTC(year,month,0)).getUTCDate();
  if(day<1||day>daysInMonth)return'HIPICO_EVENT_TIMESTAMP_INVALID';
  if(zone!=='Z'){
    const offsetHour=Number(zone.slice(1,3));
    const offsetMinute=Number(zone.slice(4,6));
    if(offsetHour>14||offsetMinute>59||(offsetHour===14&&offsetMinute!==0))return'HIPICO_EVENT_TIMESTAMP_INVALID';
  }
  const parsed=Date.parse(raw);
  if(!Number.isFinite(parsed))return'HIPICO_EVENT_TIMESTAMP_INVALID';
  if(parsed>nowMs+MAX_CANONICAL_FUTURE_SKEW_MS)return'HIPICO_EVENT_TIMESTAMP_IN_FUTURE';
  return null;
}
