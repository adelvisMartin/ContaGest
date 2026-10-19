// @ts-check
// #744 Pure read-only projection over verified server-side allocations, not posting authority.
const MONEY=/^(?:0|[1-9][0-9]{0,15})\.[0-9]{2}$/;
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const MAX=999999999999999999n;
export class OpenItemAgeingError extends Error { /** @param {string} code */ constructor(code){super('OPEN_ITEM_'+code);this.code=code;} }
/** @param {unknown} input */
function cents(input){
 if(typeof input!=='string'||!MONEY.test(input))throw new OpenItemAgeingError('INVALID_MONEY');
 const n=BigInt(input.replace('.',''));
 if(n>MAX)throw new OpenItemAgeingError('MONEY_OVERFLOW');
 return n;
}
/** @param {bigint} n */function fmt(n){return (n/100n)+'.'+(n%100n).toString().padStart(2,'0');}
/** @param {unknown} value */
function day(value){
 if(typeof value!=='string'||!DATE.test(value))throw new OpenItemAgeingError('INVALID_DATE');
 const date=new Date(value+'T00:00:00.000Z');
 if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value)throw new OpenItemAgeingError('INVALID_DATE');
 return date.getTime()/86400000;
}
/**
 * Input must come from server-verified invoice and *valid allocations*.
 * A mutable invoice status or browser-supplied settled amount is not enough.
 * @param {{tenantId:unknown,partyId:unknown,side:'AR'|'AP',asOf:unknown,allocationSourceVerified:unknown,items:unknown}} input
 */
export function projectOpenItemAgeing(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw new OpenItemAgeingError('INVALID_INPUT');
 if(input.allocationSourceVerified!==true)throw new OpenItemAgeingError('UNVERIFIED_ALLOCATIONS');
 if(typeof input.tenantId!=='string'||!input.tenantId.trim()||typeof input.partyId!=='string'||!input.partyId.trim()
   || !['AR','AP'].includes(input.side))throw new OpenItemAgeingError('INVALID_SCOPE');
 const asOf=day(input.asOf);
 if(!Array.isArray(input.items)||input.items.length>500)throw new OpenItemAgeingError('INVALID_ITEMS');
 const seen=new Set(),currencies=new Map();
 /** @type {Array<{id:string,currency:string,balance:string,daysOverdue:number,bucket:string}>} */
 const lines=[];
 for(const item of input.items){
   if(!item||typeof item!=='object'||Array.isArray(item))throw new OpenItemAgeingError('INVALID_ITEM');
   if(item.tenantId!==input.tenantId||item.partyId!==input.partyId||item.side!==input.side)throw new OpenItemAgeingError('SCOPE_MISMATCH');
   if(typeof item.id!=='string'||!item.id.trim()||seen.has(item.id))throw new OpenItemAgeingError('DUPLICATE_OR_INVALID_ITEM');
   seen.add(item.id);
   if(typeof item.currency!=='string'||!(/^[A-Z]{3}$/).test(item.currency))throw new OpenItemAgeingError('INVALID_CURRENCY');
   const gross=cents(item.gross),applied=cents(item.allocated);
   if(applied>gross)throw new OpenItemAgeingError('OVERALLOCATED');
   const due=day(item.dueDate),balance=gross-applied;
   if(balance===0n)continue;
   const daysOverdue=Math.max(0,asOf-due);
   const bucket=asOf<=due?'current':daysOverdue<=30?'1-30':daysOverdue<=60?'31-60':daysOverdue<=90?'61-90':'90+';
   if(!currencies.has(item.currency))currencies.set(item.currency,new Map());
   const buckets=currencies.get(item.currency),next=(buckets.get(bucket)||0n)+balance;
   if(next>MAX)throw new OpenItemAgeingError('MONEY_OVERFLOW');
   buckets.set(bucket,next);
   lines.push(Object.freeze({id:item.id,currency:item.currency,balance:fmt(balance),daysOverdue,bucket}));
 }
 const totals=Object.freeze([...currencies.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([currency,buckets])=>Object.freeze({
   currency, current:fmt(buckets.get('current')||0n),d1_30:fmt(buckets.get('1-30')||0n),
   d31_60:fmt(buckets.get('31-60')||0n),d61_90:fmt(buckets.get('61-90')||0n),d90_plus:fmt(buckets.get('90+')||0n)
 })));
 return Object.freeze({asOf:input.asOf,side:input.side,readOnly:true,allocationSourceVerified:true,
    lines:Object.freeze(lines),totals});
}
