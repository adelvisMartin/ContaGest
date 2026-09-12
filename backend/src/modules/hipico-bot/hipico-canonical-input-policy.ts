export const MAX_CANONICAL_PAYLOAD_BYTES=128*1024;
export const MAX_CANONICAL_PAYLOAD_DEPTH=12;
export const MAX_CANONICAL_PAYLOAD_NODES=5000;
export const MAX_CANONICAL_COLLECTION_ITEMS=1000;
export const MAX_CANONICAL_FUTURE_SKEW_MS=5*60*1000;

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
  const parsed=Date.parse(String(value||''));
  if(!Number.isFinite(parsed))return'HIPICO_EVENT_TIMESTAMP_INVALID';
  if(parsed>nowMs+MAX_CANONICAL_FUTURE_SKEW_MS)return'HIPICO_EVENT_TIMESTAMP_IN_FUTURE';
  return null;
}
