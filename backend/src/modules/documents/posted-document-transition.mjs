// @ts-check
/**
 * #769 Read-only document lifecycle intent. Only the canonical #762 sequence,
 * #637 financial domain and tenant-scoped DB transaction may perform writes.
 */
const ID=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const EFFECT=/^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$/;
const transitions=Object.freeze({
 draft:Object.freeze({issue:'issued',cancel:'cancelled'}),
 issued:Object.freeze({post:'posted',cancel:'cancelled'}),
 posted:Object.freeze({reverse:'reversed'})
});
/**
 * @param {{tenantId:unknown,actorTenantId:unknown,actorId:unknown,documentId:unknown,
 * documentType:unknown,from:unknown,action:unknown,expectedRevision:unknown,
 * documentNumber:unknown,sequenceIssuedByServer:unknown,snapshotLocked:unknown,
 * periodOpenVerified:unknown,reason?:unknown,effectKey?:unknown}} input
 */
export function preparePostedDocumentTransition(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw new TypeError('DOCUMENT_TRANSITION_INPUT_INVALID');
 for(const name of ['tenantId','actorTenantId','actorId','documentId']){
   if(typeof input[name]!=='string'||!ID.test(input[name]))throw new TypeError('DOCUMENT_TRANSITION_SCOPE_INVALID');
 }
 if(input.tenantId!==input.actorTenantId||!['sales','purchase'].includes(input.documentType))
   throw new TypeError('DOCUMENT_TRANSITION_SCOPE_INVALID');
 if(!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<1||input.expectedRevision>=Number.MAX_SAFE_INTEGER)
   throw new TypeError('DOCUMENT_TRANSITION_REVISION_INVALID');
 const target=transitions[/** @type {keyof typeof transitions} */ (input.from)]?.[/** @type {'issue'|'cancel'|'post'|'reverse'} */ (input.action)];
 if(!target)throw new TypeError('DOCUMENT_TRANSITION_NOT_ALLOWED');
 if(input.action==='issue'||input.action==='post'||input.action==='reverse'){
   if(typeof input.documentNumber!=='string'||!ID.test(input.documentNumber)||input.sequenceIssuedByServer!==true)
     throw new TypeError('DOCUMENT_SEQUENCE_AUTHORITY_REQUIRED');
   if(input.snapshotLocked!==true)throw new TypeError('DOCUMENT_SNAPSHOT_REQUIRED');
 }
 if(input.action==='post'||input.action==='reverse'){
   if(input.periodOpenVerified!==true)throw new TypeError('DOCUMENT_FISCAL_PERIOD_NOT_VERIFIED');
 }
 if(input.action==='cancel'||input.action==='reverse'){
   if(typeof input.reason!=='string'||input.reason.trim().length<8||input.reason.length>500)
     throw new TypeError('DOCUMENT_CORRECTION_REASON_REQUIRED');
   if(typeof input.effectKey!=='string'||!EFFECT.test(input.effectKey))
     throw new TypeError('DOCUMENT_IDEMPOTENCY_KEY_REQUIRED');
 }
 return Object.freeze({tenantId:input.tenantId,documentId:input.documentId,documentType:input.documentType,
  from:input.from,to:target,action:input.action,expectedRevision:input.expectedRevision,
  proposedRevision:input.expectedRevision+1,requiresTenantScopedCAS:true,
  requiresCanonicalFinancialService:input.action==='post'||input.action==='reverse',
  createsNewReversalDocument:input.action==='reverse',
  permittedMutationOfPostedSnapshot:false,persisted:false,posted:false,
  ledgerAuthorized:false,numberAllocationAuthorized:false});
}
