// @ts-check
// #852: deterministic *read-only* eligibility decision. Requires authoritative
// tenant-owned snapshots loaded by the server; caller-supplied payload is NOT proof.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const QUANTITY=/^(?:0|[1-9][0-9]{0,14})(?:\.[0-9]{1,3})?$/;
const SNAPSHOT_FIELDS=new Set(['id','tenantId','beneficiaryId','version','status','unlimited',
  'remaining','lastSequence','scope','scopeId','locationId','validFrom','validUntil','priority']);
const REQUEST_FIELDS=new Set(['tenantId','beneficiaryId','serviceId','categoryId','locationId',
  'quantity','instant','entitlements']);

export class EntitlementEligibilityError extends Error {
  constructor(code){super('ENTITLEMENT_ELIGIBILITY_'+code);this.code=code;}
}
function fail(code){throw new EntitlementEligibilityError(code);}
function plain(obj){return obj!==null&&typeof obj==='object'&&!Array.isArray(obj)&&Object.getPrototypeOf(obj)===Object.prototype;}
function onlyKeys(obj,keys){return Object.keys(obj).every(k=>keys.has(k));}
function id(value){return typeof value==='string'&&UUID.test(value);}
function decimalMilli(value){
  if(typeof value!=='string'||!QUANTITY.test(value))fail('INVALID_QUANTITY');
  const [whole,part='']=value.split('.');
  return BigInt(whole)*1000n+BigInt(part.padEnd(3,'0')||'0');
}
function utc(value){
  if(typeof value!=='string'||!/^(?:[0-9]{4})-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])T(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](?:\.[0-9]{1,3})?Z$/.test(value))
    fail('INVALID_INSTANT');
  const date=new Date(value);
  if(!Number.isFinite(date.valueOf())||date.toISOString().slice(0,19)!==value.slice(0,19))fail('INVALID_INSTANT');
  return date.getTime();
}
/**
 * @param {{tenantId:string,beneficiaryId:string,serviceId?:string|null,categoryId?:string|null,
 * locationId?:string|null,quantity:string,instant:string,entitlements:unknown[]}} input
 */
export function resolveEntitlementEligibility(input){
  if(!plain(input)||!onlyKeys(input,REQUEST_FIELDS)||!id(input.tenantId)||
    !id(input.beneficiaryId)||!Array.isArray(input.entitlements)||
    input.entitlements.length>500||
    ![input.serviceId,input.categoryId,input.locationId].every(x=>x==null||id(x)))
    fail('INVALID_REQUEST');
  const at=utc(input.instant);
  const requested=decimalMilli(input.quantity);
  if(requested<=0n)fail('INVALID_QUANTITY');
  const ids=new Set();
  const candidates=[];
  for(let i=0;i<input.entitlements.length;i++){
    if(!Object.hasOwn(input.entitlements,i))fail('PARTIAL_HISTORY');
    const row=input.entitlements[i];
    if(!plain(row)||!onlyKeys(row,SNAPSHOT_FIELDS)||!id(row.id)||
      !id(row.tenantId)||!id(row.beneficiaryId)||
      row.tenantId!==input.tenantId||row.beneficiaryId!==input.beneficiaryId)
      fail('SCOPE_MISMATCH');
    if(ids.has(row.id))fail('DUPLICATE_RIGHT');
    ids.add(row.id);
    if(!Number.isSafeInteger(row.version)||row.version<1||
      !Number.isSafeInteger(row.priority)||row.priority<-100||row.priority>100||
      !['active','suspended','expired','revoked'].includes(row.status)||
      !['ALL','SERVICE','CATEGORY'].includes(row.scope)||
      (row.scope==='ALL'?row.scopeId!==null:!id(row.scopeId))||
      (row.locationId!==null&&!id(row.locationId))||
      typeof row.unlimited!=='boolean')
      fail('INVALID_SNAPSHOT');
    const from=utc(row.validFrom),until=utc(row.validUntil);
    if(from>=until)fail('INVALID_WINDOW');
    if(row.unlimited){
      if(row.remaining!==null||row.lastSequence!==null)fail('INVALID_SNAPSHOT');
    }else if(!Number.isSafeInteger(row.lastSequence)||row.lastSequence<1||
      decimalMilli(row.remaining)<0n)fail('INVALID_SNAPSHOT');
    if(row.status!=='active'||at<from||at>=until)continue;
    if(row.locationId!==null&&row.locationId!==input.locationId)continue;
    if(row.scope==='SERVICE'&&row.scopeId!==input.serviceId)continue;
    if(row.scope==='CATEGORY'&&row.scopeId!==input.categoryId)continue;
    if(!row.unlimited&&decimalMilli(row.remaining)<requested)continue;
    candidates.push({id:row.id,version:row.version,priority:row.priority,until});
  }
  candidates.sort((a,b)=>b.priority-a.priority||a.until-b.until||a.id.localeCompare(b.id));
  const selected=candidates[0];
  if(!selected)return Object.freeze({
    decision:'NO_MATCHING_RIGHT',entitlementId:null,requestedQuantity:input.quantity,
    writeAuthorized:false,consumed:false,requiresWriteTransaction:true
  });
  return Object.freeze({
    decision:'ELIGIBLE_PREVIEW',entitlementId:selected.id,version:selected.version,
    requestedQuantity:input.quantity,writeAuthorized:false,consumed:false,requiresWriteTransaction:true
  });
}
