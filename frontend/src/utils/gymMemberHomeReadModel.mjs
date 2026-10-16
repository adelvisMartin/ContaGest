// @ts-check
// #794 read-only Gym member projection; #797 owns offline workout mutations.
const ID=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const MAX_ROWS=250;
export class GymMemberReadError extends Error {
  /** @param {string} code */
  constructor(code){super('GYM_MEMBER_READ_'+code);this.code=code;this.name='GymMemberReadError';}
}
/** @param {unknown} v */
function id(v){if(typeof v!=='string'||!ID.test(v))throw new GymMemberReadError('SCOPE_INVALID');return v;}
/** @param {unknown} value */
function millis(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value))throw new GymMemberReadError('TIME_INVALID');
  const n=Date.parse(value);
  if(!Number.isFinite(n)||new Date(n).toISOString().slice(0,19)!==value.slice(0,19))throw new GymMemberReadError('TIME_INVALID');
  return n;
}
/**
 * Compose only an explicitly scoped server read result for UI. No cache, secret or mutation.
 * @param {{sessionTenantId:unknown,sessionUserId:unknown,memberTenantId:unknown,
 * memberUserId:unknown,memberId:unknown,serverVerified:unknown,fetchedAt:unknown,
 * now:unknown,maxAgeSeconds:unknown,membership:unknown,classes:unknown,
 * routines:unknown,progress:unknown}} input
 */
export function projectGymMemberHome(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new GymMemberReadError('INPUT_INVALID');
  const tenantId=id(input.sessionTenantId),userId=id(input.sessionUserId),memberId=id(input.memberId);
  if(id(input.memberTenantId)!==tenantId||id(input.memberUserId)!==userId||input.serverVerified!==true)
    throw new GymMemberReadError('SCOPE_OR_SOURCE_UNVERIFIED');
  const now=millis(input.now),fetched=millis(input.fetchedAt);
  if(!Number.isSafeInteger(input.maxAgeSeconds)||input.maxAgeSeconds<0||input.maxAgeSeconds>86400)throw new GymMemberReadError('AGE_POLICY_INVALID');
  if(fetched>now+60000)throw new GymMemberReadError('FUTURE_SNAPSHOT');
  const fresh=fetched<=now && (now-fetched)/1000<=input.maxAgeSeconds;
  if(!Array.isArray(input.classes)||!Array.isArray(input.routines)||!Array.isArray(input.progress)||
     input.classes.length>MAX_ROWS||input.routines.length>MAX_ROWS||input.progress.length>MAX_ROWS)
    throw new GymMemberReadError('COLLECTION_INVALID');
  const safeRows=(rows)=>{
    const seen=new Set();
    return Object.freeze(rows.map(row=>{
      if(!row||typeof row!=='object'||Array.isArray(row)||row.tenantId!==tenantId||row.memberId!==memberId)
        throw new GymMemberReadError('ROW_SCOPE_MISMATCH');
      const rid=id(row.id);
      if(seen.has(rid))throw new GymMemberReadError('DUPLICATE_ROW');
      seen.add(rid);
      // Explicit allowlist: do not copy email, phone, tokens, clinical notes or other-member data.
      return Object.freeze({id:rid,title:typeof row.title==='string'?row.title.slice(0,160):'',
        status:typeof row.status==='string'?row.status.slice(0,40):'unknown'});
    }));
  };
  const membership=input.membership;
  if(membership!=null&&(typeof membership!=='object'||Array.isArray(membership)||membership.tenantId!==tenantId||
      membership.memberId!==memberId))throw new GymMemberReadError('MEMBERSHIP_SCOPE_MISMATCH');
  const status=membership&&typeof membership.status==='string'?membership.status:'unavailable';
  return Object.freeze({
    tenantId,memberId,source:'server-verified-read-projection',fetchedAt:input.fetchedAt,
    freshness:fresh?'fresh':'stale',revalidateBeforeAccess:true,
    membership:Object.freeze({status,usableForAccessDecision:false}),
    classes:safeRows(input.classes),routines:safeRows(input.routines),progress:safeRows(input.progress),
    offlineReadOnly:true,offlineWorkoutQueueOwner:'#797',offlineWorkoutWritesEnabled:false,
    serverAuthorizationRequired:true
  });
}
