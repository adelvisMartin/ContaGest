/** #755 – FEFO proposal only. Stock availability and reservation must be rechecked transactionally. */
export type FefoLot = {id:string;tenantId:string;productId:string;locationId:string;
 availableExact:string;expiresOn:string|null;receivedAtUtc:string;active:boolean};
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const TIME=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const DEC=/^(?:0|[1-9]\d{0,14})(?:\.(\d{1,6}))?$/;
const ID=/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
function units(x:string){if(typeof x!=='string'||!DEC.test(x))throw new TypeError('FEFO_DECIMAL_INVALID');const [integer,fraction='']=x.split('.');return BigInt(integer)*1000000n+BigInt(fraction.padEnd(6,'0'));}
function exact(u:bigint){const whole=u/1000000n,rest=(u%1000000n).toString().padStart(6,'0').replace(/0+$/,'');return `${whole}${rest?'.'+rest:''}`;}
function isoDate(s:string){if(!DATE.test(s)||Number.isNaN(Date.parse(s+'T00:00:00.000Z'))||new Date(s+'T00:00:00.000Z').toISOString().slice(0,10)!==s)throw new TypeError('FEFO_DATE_INVALID');}
export function prepareFefoAllocation(input:{tenantId:string;productId:string;locationId:string;requestedExact:string;asOfDate:string;lots:ReadonlyArray<FefoLot>}) {
 if(!input||!Array.isArray(input.lots)||input.lots.length>5000)throw new TypeError('FEFO_INPUT_INVALID');
 for(const v of [input.tenantId,input.productId,input.locationId])if(typeof v!=='string'||!ID.test(v))throw new TypeError('FEFO_SCOPE_INVALID');
 isoDate(input.asOfDate);const quantity=units(input.requestedExact);
 if(quantity===0n)throw new TypeError('FEFO_REQUEST_ZERO');
 const seen=new Set<string>();const eligible:{lot:FefoLot;available:bigint}[]=[];
 for(const lot of input.lots){
  if(!lot||typeof lot.id!=='string'||!ID.test(lot.id)||seen.has(lot.id)||lot.tenantId!==input.tenantId||lot.productId!==input.productId||lot.locationId!==input.locationId)throw new TypeError('FEFO_LOT_SCOPE_INVALID');
  seen.add(lot.id);
  if(typeof lot.active!=='boolean'||typeof lot.receivedAtUtc!=='string'||!TIME.test(lot.receivedAtUtc)||!Number.isFinite(Date.parse(lot.receivedAtUtc))||new Date(lot.receivedAtUtc).toISOString()!==lot.receivedAtUtc)throw new TypeError('FEFO_LOT_METADATA_INVALID');
  if(lot.expiresOn!==null)isoDate(lot.expiresOn);
  const available=units(lot.availableExact);
  // A proposal as-of a UTC day cannot select inventory received on a later day.
  if(lot.active&&available>0n&&lot.receivedAtUtc.slice(0,10)<=input.asOfDate&&
     (lot.expiresOn===null||lot.expiresOn>=input.asOfDate))eligible.push({lot,available});
 }
 eligible.sort((a,b)=>(a.lot.expiresOn??'9999-12-31').localeCompare(b.lot.expiresOn??'9999-12-31')||a.lot.receivedAtUtc.localeCompare(b.lot.receivedAtUtc)||a.lot.id.localeCompare(b.lot.id));
 let remaining=quantity;const selections=[] as {lotId:string;quantityExact:string}[];
 for(const item of eligible){if(remaining===0n)break;const take=item.available<remaining?item.available:remaining;selections.push(Object.freeze({lotId:item.lot.id,quantityExact:exact(take)}));remaining-=take;}
 return Object.freeze({tenantId:input.tenantId,productId:input.productId,locationId:input.locationId,
  requestedExact:exact(quantity),allocatedExact:exact(quantity-remaining),backorderExact:exact(remaining),
  lots:Object.freeze(selections),persisted:false as const,stockMovementAuthorized:false as const});
}
