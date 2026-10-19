/** #759: straight-line financial preview ONLY, not a legally approved depreciation or GL posting. */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEC=/^(0|[1-9]\d{0,11})\.\d{2}$/;
const MONTH=/^(20\d\d|21\d\d)-(0[1-9]|1[0-2])$/;
function cents(v:string){if(typeof v!=='string'||!DEC.test(v))throw new TypeError('ASSET_PREVIEW_MONEY_INVALID');return BigInt(v.replace('.',''));}
function money(v:bigint){return String(v/100n)+'.'+String(v%100n).padStart(2,'0');}
export function previewStraightLineDepreciation(input:{tenantId:string;actorTenantId:string;assetTenantId:string;assetId:string;costExact:string;residualExact:string;firstMonth:string;lifeMonths:number}){
 if(!input||![input.tenantId,input.actorTenantId,input.assetTenantId,input.assetId].every(x=>typeof x==='string'&&UUID.test(x))||input.actorTenantId!==input.tenantId||input.assetTenantId!==input.tenantId)throw new TypeError('ASSET_PREVIEW_SCOPE_INVALID');
 if(typeof input.firstMonth!=='string'||!MONTH.test(input.firstMonth)||!Number.isSafeInteger(input.lifeMonths)||input.lifeMonths<1||input.lifeMonths>600)throw new TypeError('ASSET_PREVIEW_PERIOD_INVALID');
 const cost=cents(input.costExact),residual=cents(input.residualExact);
 if(cost===0n||residual>cost)throw new TypeError('ASSET_PREVIEW_COST_RESIDUAL_INVALID');
 const depreciation=cost-residual,monthly=depreciation/BigInt(input.lifeMonths),remainder=depreciation%BigInt(input.lifeMonths);
 const [year,month]=input.firstMonth.split('-').map(Number);
 let accum=0n;
 const rows=Array.from({length:input.lifeMonths},(_,i)=>{
  const part=monthly+(BigInt(i)<remainder?1n:0n);
  accum+=part;
  const d=new Date(Date.UTC(year,month-1+i,1)).toISOString().slice(0,7);
  return Object.freeze({month:d,chargeExact:money(part),accumulatedExact:money(accum),bookValueAfterExact:money(cost-accum)});
 });
 if(accum!==depreciation||cost-accum!==residual)throw new TypeError('ASSET_PREVIEW_RECONCILIATION_FAILED');
 return Object.freeze({tenantId:input.tenantId,assetId:input.assetId,method:'STRAIGHT_LINE_PREVIEW' as const,
  costExact:money(cost),residualExact:money(residual),totalDepreciationExact:money(depreciation),rows:Object.freeze(rows),
  persisted:false as const,accountingAuthorized:false as const,taxAuthorized:false as const});
}
