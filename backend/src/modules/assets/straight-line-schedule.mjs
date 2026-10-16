// @ts-check
/**
 * #759 Straight-line schedule PROPOSAL, not a fiscal/ledger posting authority.
 * Policy: first depreciation period is month following in-service date; any
 * cents remainder is allocated to the final period (exact reconciliation).
 */
const MONEY=/^(?:0|[1-9][0-9]{0,14})\.[0-9]{2}$/;
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const KEY=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
/** @param {unknown} raw */
function cents(raw){
 if(typeof raw!=='string'||!MONEY.test(raw))throw new TypeError('ASSET_DEPRECIATION_AMOUNT_INVALID');
 return BigInt(raw.replace('.',''));
}
/** @param {bigint} n */
function money(n){return (n/100n)+'.'+(n%100n).toString().padStart(2,'0');}
/** @param {unknown} raw */
function serviceMonth(raw){
 if(typeof raw!=='string'||!DATE.test(raw))throw new TypeError('ASSET_SERVICE_DATE_INVALID');
 const date=new Date(raw+'T00:00:00.000Z');
 if(!Number.isFinite(date.valueOf())||date.toISOString().slice(0,10)!==raw)
   throw new TypeError('ASSET_SERVICE_DATE_INVALID');
 return [date.getUTCFullYear(),date.getUTCMonth()+1];
}
/**
 * @param {{tenantId:unknown,assetTenantId:unknown,assetId:unknown,
 * inServiceDate:unknown,originalCostExact:unknown,residualValueExact:unknown,
 * usefulLifeMonths:unknown,scheduleVersion:unknown}} input
 */
export function proposeStraightLineDepreciation(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw new TypeError('ASSET_INPUT_INVALID');
 for(const key of ['tenantId','assetTenantId','assetId']){
  if(typeof input[key]!=='string'||!KEY.test(input[key]))throw new TypeError('ASSET_SCOPE_INVALID');
 }
 if(input.tenantId!==input.assetTenantId)throw new TypeError('ASSET_SCOPE_INVALID');
 if(!Number.isSafeInteger(input.usefulLifeMonths)||input.usefulLifeMonths<1||input.usefulLifeMonths>600||
    !Number.isSafeInteger(input.scheduleVersion)||input.scheduleVersion<1)
   throw new TypeError('ASSET_SCHEDULE_PARAMETERS_INVALID');
 const cost=cents(input.originalCostExact),residual=cents(input.residualValueExact);
 if(residual>cost)throw new TypeError('ASSET_RESIDUAL_EXCEEDS_COST');
 const basis=cost-residual;
 const [year,month]=serviceMonth(input.inServiceDate);
 const life=input.usefulLifeMonths;
 const monthly=basis/BigInt(life);
 let carrying=cost;
 const periods=[];
 if(basis>0n)for(let i=0;i<life;i++){
  const monthIndex=year*12+(month-1)+(i+1);
  const y=Math.floor(monthIndex/12),m=monthIndex%12+1;
  if(y>9999)throw new TypeError('ASSET_SCHEDULE_DATE_OVERFLOW');
  const charge=i===life-1?basis-monthly*BigInt(life-1):monthly;
  carrying-=charge;
  periods.push(Object.freeze({period:String(y).padStart(4,'0')+'-'+String(m).padStart(2,'0'),
    depreciationExact:money(charge),carryingValueExact:money(carrying)}));
 }
 return Object.freeze({tenantId:input.tenantId,assetId:input.assetId,
  scheduleVersion:input.scheduleVersion,costExact:money(cost),residualExact:money(residual),
  depreciableExact:money(basis),totalDepreciationExact:money(basis),
  periods:Object.freeze(periods),readOnly:true,posted:false,requiresFinancialDomainPosting:true});
}
