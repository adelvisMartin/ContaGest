/** #759 Exact 2-decimal straight-line plan. Preview only: never post a journal. */
const MONEY=/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/;
function cents(value){if(typeof value!=='string'||!MONEY.test(value))throw new Error('INVALID_ASSET_AMOUNT');let [w,f='']=value.split('.');return BigInt(w)*100n+BigInt(f.padEnd(2,'0'));}
function money(value){return String(value/100n)+'.'+String(value%100n).padStart(2,'0');}
const ID=/^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,119}$/;
function validDate(text){if(typeof text!=='string'|| !/^\d{4}-\d\d-\d\d$/.test(text))return false;const ms=Date.parse(text+'T00:00:00.000Z');return Number.isFinite(ms)&&new Date(ms).toISOString().slice(0,10)===text;}
function monthEnd(start,index){const [y,m]=start.split('-').map(Number);return new Date(Date.UTC(y,m+index,0)).toISOString().slice(0,10);}
export function straightLineAssetSchedule({tenantId,assetId,cost,residual,lifeMonths,inServiceDate}={}){
  if(!ID.test(tenantId||'')||!ID.test(assetId||'')||!validDate(inServiceDate)||
     !Number.isSafeInteger(lifeMonths)||lifeMonths<1||lifeMonths>600)throw new Error('INVALID_ASSET_SCHEDULE');
  const initial=cents(cost),salvage=cents(residual);
  if(initial<=0n||salvage>=initial)throw new Error('INVALID_ASSET_RESIDUAL');
  const total=initial-salvage,base=total/BigInt(lifeMonths),remainder=total%BigInt(lifeMonths);
  let accumulated=0n;
  const rows=Array.from({length:lifeMonths},(_,idx)=>{
    const charge=base+(BigInt(idx)<remainder?1n:0n);accumulated+=charge;
    return Object.freeze({period:idx+1,periodEnd:monthEnd(inServiceDate,idx),charge:money(charge),
       accumulated:money(accumulated),carryingValue:money(initial-accumulated)});
  });
  if(accumulated!==total||rows[rows.length-1].carryingValue!==money(salvage))throw new Error('SCHEDULE_RECONCILIATION_FAILED');
  return Object.freeze({tenantId,assetId,method:'straight_line_monthly_no_proration',
    cost:money(initial),residual:money(salvage),lifeMonths,inServiceDate,
    rows:Object.freeze(rows),ledgerPosted:false,requiresFinancialApproval:true});
}
