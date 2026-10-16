/** #761: pure server-side effective RateCard selector. No billable or invoice authority. */
export const PROJECT_EFFECTIVE_RATE_SELECTION_VERSION = 'project-effective-rate-selection-v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MONEY = /^([0-9]{1,12})\.([0-9]{2})$/;
function uuid(v:unknown):asserts v is string {
  if(typeof v!=='string'||!UUID.test(v))throw new TypeError('PROJECT_RATE_SELECT_ID_INVALID');
}
function instant(v:unknown):asserts v is string {
  if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)||
     !Number.isFinite(Date.parse(v))||new Date(v).toISOString()!==v){
    throw new TypeError('PROJECT_RATE_SELECT_TIME_INVALID');
  }
}
export type ApprovedTimeForSelection = {
  id:string;tenantId:string;projectId:string;clientId:string;memberId:string;
  status:'approved';revision:number;startedAtUtc:string;endedAtUtc:string;
  billable:false;linkedInvoiceId:null;
};
export type ImmutableRateForSelection = {
  id:string;tenantId:string;projectId:string;clientId:string;memberId:string;
  revision:number;status:'fixed';hourlyRateExact:string;currency:string;effectiveFromUtc:string;
};
/** All arguments must be loaded by the server from tenant-filtered authority. */
export function selectEffectiveRateForApprovedTime(input:{
  entry:ApprovedTimeForSelection;cards:ReadonlyArray<ImmutableRateForSelection>;tenantId:string;
}) {
  if(!input||typeof input!=='object'||!Array.isArray(input.cards)||!input.entry){
    throw new TypeError('PROJECT_RATE_SELECT_INPUT_INVALID');
  }
  const {entry,cards,tenantId}=input;
  for(const v of [tenantId,entry.id,entry.tenantId,entry.projectId,entry.clientId,entry.memberId])uuid(v);
  if(entry.tenantId!==tenantId||entry.status!=='approved'||entry.billable!==false||
     entry.linkedInvoiceId!==null||!Number.isSafeInteger(entry.revision)||entry.revision<2){
    throw new TypeError('PROJECT_RATE_SELECT_APPROVAL_INVALID');
  }
  instant(entry.startedAtUtc);instant(entry.endedAtUtc);
  if(entry.startedAtUtc>=entry.endedAtUtc || Date.parse(entry.endedAtUtc)-Date.parse(entry.startedAtUtc)>86400000){
    throw new TypeError('PROJECT_RATE_SELECT_INTERVAL_INVALID');
  }
  if(cards.length>1024)throw new TypeError('PROJECT_RATE_SELECT_TOO_MANY_VERSIONS');
  const normalized:ImmutableRateForSelection[]=[];
  const versions=new Set<number>(),dates=new Set<string>();
  let currency:string|null=null;
  for(const card of cards){
    if(!card||typeof card!=='object')throw new TypeError('PROJECT_RATE_SELECT_CARD_INVALID');
    for(const v of [card.id,card.tenantId,card.projectId,card.clientId,card.memberId])uuid(v);
    if(card.tenantId!==tenantId||card.projectId!==entry.projectId||card.clientId!==entry.clientId||
       card.memberId!==entry.memberId||card.status!=='fixed'||
       !Number.isSafeInteger(card.revision)||card.revision<1||card.revision>1024||
       versions.has(card.revision))throw new TypeError('PROJECT_RATE_SELECT_SCOPE_OR_REVISION_INVALID');
    instant(card.effectiveFromUtc);
    if(dates.has(card.effectiveFromUtc))throw new TypeError('PROJECT_RATE_SELECT_AMBIGUOUS_EFFECTIVITY');
    if(typeof card.currency!=='string'||!/^[A-Z]{3}$/.test(card.currency)||
       (currency!==null&&currency!==card.currency))throw new TypeError('PROJECT_RATE_SELECT_CURRENCY_CHANGE_UNSUPPORTED');
    if(typeof card.hourlyRateExact!=='string'||!MONEY.test(card.hourlyRateExact)||
       BigInt(card.hourlyRateExact.replace('.',''))===0n){
       throw new TypeError('PROJECT_RATE_SELECT_MONEY_INVALID');
    }
    versions.add(card.revision);dates.add(card.effectiveFromUtc);currency=card.currency;
    normalized.push(card);
  }
  normalized.sort((a,b)=>a.revision-b.revision);
  for(let i=1;i<normalized.length;i++){
    if(normalized[i].revision!==normalized[i-1].revision+1||
       normalized[i].effectiveFromUtc<=normalized[i-1].effectiveFromUtc){
      throw new TypeError('PROJECT_RATE_SELECT_RATE_HISTORY_INVALID');
    }
  }
  if(normalized.length && normalized[0].revision!==1)throw new TypeError('PROJECT_RATE_SELECT_RATE_HISTORY_INVALID');
  let selected:ImmutableRateForSelection|null=null;
  for(const c of normalized){
    if(c.effectiveFromUtc<=entry.startedAtUtc)selected=c;
    else if(c.effectiveFromUtc<entry.endedAtUtc){
      throw new TypeError('PROJECT_RATE_SELECT_SPLIT_INTERVAL_UNSUPPORTED');
    }
  }
  if(!selected)throw new TypeError('PROJECT_RATE_SELECT_NO_EFFECTIVE_RATE');
  return Object.freeze({version:PROJECT_EFFECTIVE_RATE_SELECTION_VERSION,
    tenantId,entryId:entry.id,entryRevision:entry.revision,projectId:entry.projectId,
    clientId:entry.clientId,memberId:entry.memberId,rateCardId:selected.id,
    rateCardRevision:selected.revision,rateEffectiveFromUtc:selected.effectiveFromUtc,
    hourlyRateExact:selected.hourlyRateExact,currency:selected.currency,
    persisted:false as const,billableAuthorized:false as const,invoiceAuthorized:false as const});
}
