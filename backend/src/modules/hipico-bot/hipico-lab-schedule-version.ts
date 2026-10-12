import crypto from 'node:crypto';

/** Entire tenant-scoped meeting read-set, not merely the displayed race.
 * A new/removed race, schedule change or state transition invalidates replay.
 * This fingerprint is an internal witness, NOT external officiality evidence.
 */
export function versionLabScheduleSnapshot(meetingId:string,rows:unknown[]){
  if(typeof meetingId!=='string'||!meetingId.trim()||!Array.isArray(rows)||
     rows.length<1||rows.length>200)return null;
  const seen=new Set<string>();
  const facts:Array<{id:string;meetingId:string;number:number;state:string;version:number;scheduledAt:string|null;updatedAt:string}>=[];
  for(const raw of rows){
    if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
    const row=raw as Record<string,unknown>;
    const id=String(row.id||'');
    const scope=String(row.meetingId||'');
    const num=Number(row.number);
    const version=Number(row.stateVersion);
    const state=String(row.state||'');
    const stamp=row.updatedAt instanceof Date?row.updatedAt:
      typeof row.updatedAt==='string'?new Date(row.updatedAt):null;
    const time=row.scheduledAt===null||row.scheduledAt===undefined?null:
      row.scheduledAt instanceof Date?row.scheduledAt:
        typeof row.scheduledAt==='string'?new Date(row.scheduledAt):null;
    if(!id||id.length>100||seen.has(id)||scope!==meetingId||
       !Number.isInteger(num)||num<1||num>99||
       !Number.isSafeInteger(version)||version<0||
       !/^[A-Z_]{3,40}$/.test(state)||
       !stamp||!Number.isFinite(stamp.getTime())||
       (row.scheduledAt!==null&&row.scheduledAt!==undefined&&(!time||!Number.isFinite(time.getTime()))))return null;
    seen.add(id);
    facts.push({id,meetingId:scope,number:num,state,version,
      scheduledAt:time?time.toISOString():null,updatedAt:stamp.toISOString()});
  }
  facts.sort((a,b)=>a.id.localeCompare(b.id));
  const digest=crypto.createHash('sha256')
    .update(JSON.stringify({policy:'hipico-lab-schedule-snapshot-v1',meetingId,facts}))
    .digest('hex');
  const highestVersion=Math.max(...facts.map(row=>row.version));
  const updatedAt=facts.map(row=>row.updatedAt).sort().at(-1)!;
  return{revisionToken:digest,version:highestVersion+1,updatedAt};
}
