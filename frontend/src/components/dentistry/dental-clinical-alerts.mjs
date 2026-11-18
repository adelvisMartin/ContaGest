/**
 * #800: presentation-only snapshot of reviewed CareClinicalFact records.
 * The API owns identity, tenant, clinical review and historical amendments.
 * Incomplete cursor sets must never imply that no current alert exists.
 */
const kinds=new Set(['allergy','medication','problem']);
export function projectDentalClinicalAlerts(payload) {
  if(!payload||!Array.isArray(payload.items))
    return {complete:false,alerts:[],unverified:0,reason:'INVALID_PAGE'};
  const complete=!payload.nextCursor;
  const unverified=payload.items.filter((item)=>kinds.has(item?.kind)
    && item.status!=='reviewed').length;
  if(!complete)return {complete:false,alerts:[],unverified,reason:'MORE_PAGES'};
  const alerts=payload.items.filter((item)=>kinds.has(item?.kind)
    && item.status==='reviewed' && item.isSuperseded!==true)
    .map((item)=>{
      const detail=item.detail&&typeof item.detail==='object'&&!Array.isArray(item.detail)
        ?item.detail:{};
      const raw=detail.substance??detail.name??detail.label??null;
      const descriptor=typeof raw==='string'&&raw.trim()?raw.trim().slice(0,160):'Dato estructurado sin etiqueta';
      const status=typeof detail.status==='string'&&['resolved','stopped'].includes(detail.status)
        ?'resolved':'reviewed';
      return {
        id:String(item.id),kind:item.kind,descriptor,status,
        effectiveAt:item.effectiveAt,reviewedAt:item.reviewedAt,
        reviewedByUserId:item.reviewedByUserId||null,
        sourceId:item.encounterId||null,provenance:item.provenance||'clinician'
      };
    });
  return {complete:true,alerts,unverified,reason:null};
}
