// @ts-check
// #852 Pure preview: append-only ledger projection, NOT a transactional grant/consume authority.
const MAX = 999999999999999999n;
const QUANTITY = /^(?:0|[1-9][0-9]{0,14})(?:\.[0-9]{1,3})?$/;
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export class EntitlementProjectionError extends Error {
  /** @param {string} code */
  constructor(code) { super('ENTITLEMENT_'+code); this.code=code; }
}
/** @param {unknown} x @param {string} label */
function uuid(x,label) {
  if(typeof x!=='string'||!UUID.test(x))throw new EntitlementProjectionError('INVALID_'+label);
  return x.toLowerCase();
}
/** @param {unknown} x */
function mills(x) {
  if(typeof x!=='string'||!QUANTITY.test(x))throw new EntitlementProjectionError('INVALID_QUANTITY');
  const [whole,part='']=x.split('.');
  const n=BigInt(whole)*1000n+BigInt(part.padEnd(3,'0')||'0');
  if(n===0n||n>MAX)throw new EntitlementProjectionError('INVALID_QUANTITY');
  return n;
}
/** @param {bigint} n */
function fmt(n) {return (n/1000n)+'.'+(n%1000n).toString().padStart(3,'0');}
/**
 * Rebuild a right's finite balance from append-only events in server-assigned
 * sequence order. No balance writes or provider calls. Multiple GRANT events
 * are disallowed: renewal creates a new entitlement.
 * @param {{tenantId:unknown,entitlementId:unknown,beneficiaryId:unknown,events:unknown}} input
 */
export function projectEntitlementLedger(input) {
  if(!input||typeof input!=='object'||Array.isArray(input))throw new EntitlementProjectionError('INVALID_INPUT');
  const tenantId=uuid(input.tenantId,'TENANT'), entitlementId=uuid(input.entitlementId,'ENTITLEMENT'),
    beneficiaryId=uuid(input.beneficiaryId,'BENEFICIARY');
  if(!Array.isArray(input.events)||input.events.length<1||input.events.length>10000)throw new EntitlementProjectionError('INVALID_EVENTS');
  // A RELEASE restores only a previous CONSUME. Refunded/expired rights are
  // irrevocable here; recovering those needs a distinct authorized event.
  let balance=0n,granted=0n,consumedOutstanding=0n,previous=0,grantCount=0;
  const eventIds=new Set(),effects=new Set();
  for(const row of input.events){
    if(!row||typeof row!=='object'||Array.isArray(row))throw new EntitlementProjectionError('INVALID_EVENT');
    if(uuid(row.tenantId,'TENANT')!==tenantId||uuid(row.entitlementId,'ENTITLEMENT')!==entitlementId
       ||uuid(row.beneficiaryId,'BENEFICIARY')!==beneficiaryId)throw new EntitlementProjectionError('SCOPE_MISMATCH');
    const eventId=uuid(row.id,'EVENT');
    if(eventIds.has(eventId))throw new EntitlementProjectionError('DUPLICATE_EVENT');
    eventIds.add(eventId);
    if(!Number.isSafeInteger(row.sequence)||row.sequence<=previous)throw new EntitlementProjectionError('INVALID_SEQUENCE');
    previous=row.sequence;
    if(typeof row.effectKey!=='string'||!(/^[A-Za-z0-9:_-]{8,128}$/).test(row.effectKey)||effects.has(row.effectKey))
      throw new EntitlementProjectionError('DUPLICATE_OR_INVALID_EFFECT');
    effects.add(row.effectKey);
    const amount=mills(row.quantity);
    if(row.type==='GRANT'){
      if(++grantCount!==1||previous!==1)throw new EntitlementProjectionError('INVALID_GRANT');
      granted=amount;balance=amount;
    }else if(row.type==='CONSUME'){
      if(grantCount!==1||balance<amount)throw new EntitlementProjectionError('INSUFFICIENT_BALANCE');
      balance-=amount;
      consumedOutstanding+=amount;
    }else if(row.type==='REFUND_REVOKE'||row.type==='EXPIRE'){
      if(grantCount!==1||balance<amount)throw new EntitlementProjectionError('INSUFFICIENT_BALANCE');
      balance-=amount;
    }else if(row.type==='RELEASE'){
      if(grantCount!==1||consumedOutstanding<amount||balance+amount>granted)
        throw new EntitlementProjectionError('EXCEEDS_GRANT');
      consumedOutstanding-=amount;
      balance+=amount;
    }else throw new EntitlementProjectionError('INVALID_TYPE');
  }
  if(grantCount!==1)throw new EntitlementProjectionError('MISSING_GRANT');
  return Object.freeze({tenantId,entitlementId,beneficiaryId,granted:fmt(granted),remaining:fmt(balance),
    consumedOrRevoked:fmt(granted-balance),lastSequence:previous,readOnly:true,transactionalAuthority:false});
}
