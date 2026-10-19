/** #769: non-mutating lifecycle preflight. Ledger, periods and sequence remain sole external authorities. */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY=/^[A-Za-z0-9][A-Za-z0-9_:-]{7,127}$/;
export function prepareDocumentCorrection(input:{tenantId:string;actorTenantId:string;documentTenantId:string;documentId:string;
 state:'draft'|'issued'|'posted'|'cancelled'|'reversed'; action:'cancel'|'reverse';expectedRevision:number;reason:string;
 idempotencyKey:string;reversalPeriodOpen:boolean;}){
 if(!input||![input.tenantId,input.actorTenantId,input.documentTenantId,input.documentId].every(v=>typeof v==='string'&&UUID.test(v))||input.tenantId!==input.actorTenantId||input.tenantId!==input.documentTenantId)throw new TypeError('DOCUMENT_CORRECTION_SCOPE_INVALID');
 if(!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<1||input.expectedRevision>=Number.MAX_SAFE_INTEGER)throw new TypeError('DOCUMENT_CORRECTION_REVISION_INVALID');
 if(typeof input.idempotencyKey!=='string'||!KEY.test(input.idempotencyKey))throw new TypeError('DOCUMENT_CORRECTION_IDEMPOTENCY_INVALID');
 if(typeof input.reason!=='string'||input.reason.trim().length<12||input.reason.length>1000)throw new TypeError('DOCUMENT_CORRECTION_REASON_REQUIRED');
 if(input.state==='posted'&&input.action==='reverse'){
  if(input.reversalPeriodOpen!==true)throw new TypeError('DOCUMENT_CORRECTION_PERIOD_CLOSED');
 } else if(input.state==='issued'&&input.action==='cancel'){
  // Issued but not posted: administrative cancellation; no reversal ledger effect.
 } else throw new TypeError('DOCUMENT_CORRECTION_NOT_ALLOWED');
 const nextState=input.action==='reverse'?'reversed':'cancelled';
 return Object.freeze({tenantId:input.tenantId,documentId:input.documentId,previousState:input.state,
  requestedState:nextState,action:input.action,reason:input.reason.trim(),expectedRevision:input.expectedRevision,proposedRevision:input.expectedRevision+1,
  idempotencyKey:input.idempotencyKey,requiresServerPeriodVerification:input.action==='reverse',
  requiresDomainTransaction:true as const,requiresImmutableOriginal:true as const,
  persisted:false as const,ledgerAuthorized:false as const,sequenceAuthorized:false as const,noteAuthorized:false as const});
}
