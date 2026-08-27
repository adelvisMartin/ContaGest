export type ShadowMatchStatus='exact'|'partial'|'mismatch'|'unresolved';
export type ShadowComparable={intent?:string;entities?:Record<string,unknown>;amount?:number|string|null;participant?:string|null;board?:string[]};
export type ShadowDiff={field:string;predicted:unknown;actual:unknown;equal:boolean};

export const SHADOW_PROMOTION_THRESHOLDS=Object.freeze({
  minResolved:200,
  maxCriticalMismatchRate:0,
  minExactRate:.98,
  minIntentRecall:.995,
  requireZeroUnreviewedMonetaryMismatch:true
});

function stable(value:unknown):string{
  if(Array.isArray(value))return`[${value.map(stable).join(',')}]`;
  if(value&&typeof value==='object')return`{${Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
function same(left:unknown,right:unknown){return stable(left)===stable(right);}

export function compareShadowPrediction(predicted:ShadowComparable,actual:ShadowComparable|null|undefined){
  if(!actual)return{status:'unresolved' as const,score:null,diffs:[] as ShadowDiff[]};
  const fields=['intent','amount','participant','board','entities'] as const;
  const diffs=fields.map((field)=>({field,predicted:predicted?.[field],actual:actual?.[field],equal:same(predicted?.[field],actual?.[field])}));
  const meaningful=diffs.filter((diff)=>diff.predicted!==undefined||diff.actual!==undefined);
  const equal=meaningful.filter((diff)=>diff.equal).length;
  const score=meaningful.length?equal/meaningful.length:1;
  const status:ShadowMatchStatus=score===1?'exact':score===0?'mismatch':'partial';
  return{status,score,diffs:meaningful};
}

export function summarizeShadowEvaluations(rows:Array<{status:ShadowMatchStatus;intent?:string;critical?:boolean}>){
  const total=rows.length;const resolved=rows.filter((row)=>row.status!=='unresolved');
  const count=(status:ShadowMatchStatus)=>rows.filter((row)=>row.status===status).length;
  const exact=count('exact');const mismatch=count('mismatch');const partial=count('partial');const unresolved=count('unresolved');
  const criticalMismatch=rows.filter((row)=>row.critical&&(row.status==='mismatch'||row.status==='partial')).length;
  return{
    total,resolved:resolved.length,exact,partial,mismatch,unresolved,
    exactRate:resolved.length?exact/resolved.length:0,
    mismatchRate:resolved.length?mismatch/resolved.length:0,
    criticalMismatchRate:resolved.length?criticalMismatch/resolved.length:0
  };
}

export function assessShadowPromotion(summary:ReturnType<typeof summarizeShadowEvaluations>){
  const blockers:string[]=[];
  if(summary.resolved<SHADOW_PROMOTION_THRESHOLDS.minResolved)blockers.push('INSUFFICIENT_RESOLVED_SAMPLE');
  if(summary.exactRate<SHADOW_PROMOTION_THRESHOLDS.minExactRate)blockers.push('EXACT_RATE_BELOW_THRESHOLD');
  if(summary.criticalMismatchRate>SHADOW_PROMOTION_THRESHOLDS.maxCriticalMismatchRate)blockers.push('CRITICAL_MISMATCH_PRESENT');
  return{eligibleForReview:blockers.length===0,autoPromote:false,blockers,thresholds:SHADOW_PROMOTION_THRESHOLDS};
}
