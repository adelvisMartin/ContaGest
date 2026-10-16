// @ts-check
// #759: read-only straight-line depreciation proposal; #637 alone can post balanced ledger entries.
const MONEY=/^(?:0|[1-9][0-9]{0,15})\.[0-9]{2}$/;
const IDENT=/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/;
const MAX=999999999999999999n;
export class AssetScheduleError extends Error { /** @param {string} code */constructor(code){super('ASSET_'+code);this.name='AssetScheduleError';this.code=code;} }
/** @param {unknown} v */
function ident(v){if(typeof v!=='string'||!IDENT.test(v))throw new AssetScheduleError('IDENTITY_INVALID');return v;}
/** @param {unknown} v */
function cents(v){if(typeof v!=='string'||!MONEY.test(v))throw new AssetScheduleError('MONEY_INVALID');const n=BigInt(v.replace('.',''));if(n>MAX)throw new AssetScheduleError('MONEY_OVERFLOW');return n;}
/** @param {bigint} v */function fmt(v){return (v/100n)+'.'+(v%100n).toString().padStart(2,'0');}
/**
 * Preview policy: start on first day of a calendar month, no prorata guess. Period posting, FX,
 * useful-life amendment, acquisition/disposal and tax policy are separate domain authorities.
 * @param {{tenantId:unknown,actorTenantId:unknown,assetId:unknown,sourceVerified:unknown,currency:unknown,
 * acquisitionCost:unknown,residualValue:unknown,inServiceMonth:unknown,usefulLifeMonths:unknown,method:unknown}} input
 */
export function proposeAssetStraightLine(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new AssetScheduleError('INPUT_INVALID');
  const tenantId=ident(input.tenantId),assetId=ident(input.assetId);
  if(ident(input.actorTenantId)!==tenantId||input.sourceVerified!==true)throw new AssetScheduleError('SCOPE_OR_SOURCE_UNVERIFIED');
  if(input.method!=='straight-line'||typeof input.currency!=='string'||!/^[A-Z]{3}$/.test(input.currency))throw new AssetScheduleError('POLICY_INVALID');
  if(!Number.isSafeInteger(input.usefulLifeMonths)||input.usefulLifeMonths<1||input.usefulLifeMonths>360)throw new AssetScheduleError('LIFE_INVALID');
  if(typeof input.inServiceMonth!=='string'||!/^\d{4}-(?:0[1-9]|1[0-2])-01$/.test(input.inServiceMonth))throw new AssetScheduleError('SERVICE_MONTH_INVALID');
  const start=new Date(input.inServiceMonth+'T00:00:00.000Z');
  if(!Number.isFinite(start.getTime())||start.toISOString().slice(0,10)!==input.inServiceMonth)throw new AssetScheduleError('SERVICE_MONTH_INVALID');
  const firstYear=start.getUTCFullYear(),firstMonth=start.getUTCMonth();
  if(firstYear<1900||firstYear+Math.ceil(input.usefulLifeMonths/12)>9999)throw new AssetScheduleError('SERVICE_MONTH_INVALID');
  const cost=cents(input.acquisitionCost),residual=cents(input.residualValue);
  if(cost===0n||residual>cost)throw new AssetScheduleError('RESIDUAL_INVALID');
  const depreciation=cost-residual,monthCount=BigInt(input.usefulLifeMonths);
  const base=depreciation/monthCount,remainder=depreciation%monthCount;
  let accumulated=0n;
  const entries=[];
  for(let i=0;i<input.usefulLifeMonths;i++){
    const offset=firstMonth+i, year=firstYear+Math.floor(offset/12),month=(offset%12)+1;
    const amount=base+(BigInt(i)<remainder?1n:0n);
    accumulated+=amount;
    entries.push(Object.freeze({period:String(year)+'-'+String(month).padStart(2,'0'),amount:fmt(amount),
      accumulated:fmt(accumulated),bookValue:fmt(cost-accumulated)}));
  }
  if(accumulated!==depreciation||cost-accumulated!==residual)throw new AssetScheduleError('RECONCILIATION_FAILED');
  return Object.freeze({tenantId,assetId,currency:input.currency,method:'straight-line',
    acquisitionCost:fmt(cost),residualValue:fmt(residual),totalDepreciation:fmt(depreciation),
    entries:Object.freeze(entries),asPreview:true,persisted:false,ledgerPosted:false,
    requiresTenantScopedPeriodCheck:true,requiresBalancedDomainPosting:true});
}
