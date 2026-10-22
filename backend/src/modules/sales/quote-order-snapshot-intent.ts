/** #753: exact immutable commercial snapshot proposal; NOT order conversion. */
export type QuoteLineSnapshot=Readonly<{
  id:string;tenantId:string;productId:string;quantityExact:string;
  unitPriceExact:string;taxAmountExact:string;lineTotalExact:string;currency:string;
}>;
export type AcceptedQuoteSnapshot=Readonly<{
  id:string;tenantId:string;clientId:string;status:'accepted';revision:number;
  currency:string;totalExact:string;lines:readonly QuoteLineSnapshot[];
}>;
const ID=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const MONEY=/^(?:0|[1-9]\d{0,14})(?:\.\d{1,2})?$/;
const QTY=/^(?:0|[1-9]\d{0,14})(?:\.\d{1,3})?$/;
const CURRENCY=/^[A-Z]{3}$/;
const fail=():never=>{throw new Error('QUOTE_SNAPSHOT_CONVERSION_PRECONDITION_FAILED');};
const validId=(value:unknown):value is string=>typeof value==='string'&&ID.test(value);
function cents(value:string):bigint {
  if(typeof value!=='string'||!MONEY.test(value))fail();
  const [a,b='']=value.split('.');
  return BigInt(a)*100n+BigInt(b.padEnd(2,'0'));
}
function positiveQty(value:string):boolean {
  if(typeof value!=='string'||!QTY.test(value))return false;
  const [a,b='']=value.split('.');return BigInt(a)*1000n+BigInt(b.padEnd(3,'0'))>0n;
}
export function prepareAcceptedQuoteSnapshot(input:{
  quote:AcceptedQuoteSnapshot;actorTenantId:string;expectedRevision:number;
}) {
  const quote=input?.quote;
  if(!input||!quote||!validId(input.actorTenantId)||quote.tenantId!==input.actorTenantId||
     !validId(quote.id)||!validId(quote.clientId)||
     quote.status!=='accepted'||!Number.isSafeInteger(quote.revision)||quote.revision<1||
     quote.revision!==input.expectedRevision||
     !CURRENCY.test(quote.currency)||
     !Array.isArray(quote.lines)||quote.lines.length<1||quote.lines.length>100)fail();
  const seen=new Set<string>();let sum=0n;
  const lines=quote.lines.map(line=>{
    if(!line||!validId(line.id)||seen.has(line.id)||
       line.tenantId!==quote.tenantId||!validId(line.productId)||
       line.currency!==quote.currency||!positiveQty(line.quantityExact))fail();
    seen.add(line.id);
    cents(line.unitPriceExact);cents(line.taxAmountExact);
    sum+=cents(line.lineTotalExact);
    return Object.freeze({
      sourceLineId:line.id,productId:line.productId,
      quantityExact:line.quantityExact,unitPriceExact:line.unitPriceExact,
      taxAmountExact:line.taxAmountExact,lineTotalExact:line.lineTotalExact,
      currency:line.currency,
    });
  });
  if(sum!==cents(quote.totalExact))fail();
  return Object.freeze({
    tenantId:quote.tenantId,sourceQuoteId:quote.id,clientId:quote.clientId,
    sourceRevision:quote.revision,currency:quote.currency,totalExact:quote.totalExact,
    lines:Object.freeze(lines),requiresTenantScopedConversionKey:true as const,
    priceRecalculated:false as const,taxRecalculated:false as const,
    converted:false as const,orderCreated:false as const,inventoryReserved:false as const,
  });
}
