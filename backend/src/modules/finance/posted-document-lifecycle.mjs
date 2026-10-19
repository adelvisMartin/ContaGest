// @ts-check
// #769: immutable proposal for financial document state; #762 owns numbering and #637 owns posting.
const ID = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/;
const HASH = /^[a-f0-9]{64}$/i;
const ACTIONS = Object.freeze({
  draft: Object.freeze({issue:'issued',cancel:'cancelled'}),
  issued: Object.freeze({post:'posted',cancel:'cancelled'}),
  posted: Object.freeze({reverse:'reversed'}),
  cancelled: Object.freeze({}),reversed:Object.freeze({})
});
export class PostedDocumentIntentError extends Error {
  /** @param {string} code */ constructor(code){super('POSTED_DOCUMENT_'+code);this.name='PostedDocumentIntentError';this.code=code;}
}
/** @param {unknown} value */
function id(value){if(typeof value!=='string'||!ID.test(value))throw new PostedDocumentIntentError('IDENTITY_INVALID');return value;}
/**
 * @param {{kind:unknown,tenantId:unknown,actorTenantId:unknown,actorId:unknown,documentId:unknown,
 * from:unknown,action:unknown,expectedRevision:unknown,sourceVerified:unknown,
 * immutableSnapshotHash:unknown,issuedNumber:unknown,sequenceAuthorityVerified:unknown,
 * fiscalPeriodOpen:unknown,originalLedgerEntryId:unknown,reason:unknown,effectKey:unknown}} input
 */
export function preparePostedDocumentIntent(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new PostedDocumentIntentError('INPUT_INVALID');
  const tenantId=id(input.tenantId);
  if(id(input.actorTenantId)!==tenantId||input.sourceVerified!==true)throw new PostedDocumentIntentError('SCOPE_OR_SOURCE_UNVERIFIED');
  const actorId=id(input.actorId),documentId=id(input.documentId),effectKey=id(input.effectKey);
  if(!['sales','purchase'].includes(input.kind))throw new PostedDocumentIntentError('KIND_INVALID');
  if(!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<1||input.expectedRevision>=Number.MAX_SAFE_INTEGER)throw new PostedDocumentIntentError('REVISION_INVALID');
  const domain=Object.hasOwn(ACTIONS,String(input.from)) ? ACTIONS[input.from] : null;
  const next=domain && Object.hasOwn(domain,String(input.action)) ? domain[input.action] : null;
  if(!next)throw new PostedDocumentIntentError('TRANSITION_FORBIDDEN');
  if(typeof input.immutableSnapshotHash!=='string'||!HASH.test(input.immutableSnapshotHash))throw new PostedDocumentIntentError('SNAPSHOT_REQUIRED');
  if(input.action==='issue'){
    // Caller must provide number already reserved by #762; NEVER generate max+1 here.
    if(input.sequenceAuthorityVerified!==true||typeof input.issuedNumber!=='string'||!ID.test(input.issuedNumber))
      throw new PostedDocumentIntentError('SEQUENCE_AUTHORITY_REQUIRED');
  } else if(typeof input.issuedNumber!=='string'||!ID.test(input.issuedNumber)){
    // Cancellation of a draft can legitimately precede sequence allocation.
    if(!(input.action==='cancel'&&input.from==='draft'&&input.issuedNumber===null))throw new PostedDocumentIntentError('ISSUED_NUMBER_REQUIRED');
  }
  if(['post','reverse'].includes(input.action)&&input.fiscalPeriodOpen!==true)throw new PostedDocumentIntentError('PERIOD_NOT_OPEN');
  if(input.action==='reverse'){
    if(!input.originalLedgerEntryId||typeof input.originalLedgerEntryId!=='string'||!ID.test(input.originalLedgerEntryId))
      throw new PostedDocumentIntentError('LEDGER_ORIGIN_REQUIRED');
  }
  if(['cancel','reverse'].includes(input.action)){
    if(typeof input.reason!=='string'||input.reason.trim().length<8||input.reason.trim().length>500)
      throw new PostedDocumentIntentError('REASON_REQUIRED');
  }
  return Object.freeze({kind:input.kind,tenantId,actorId,documentId,effectKey,from:input.from,to:next,
    expectedRevision:input.expectedRevision,proposedRevision:input.expectedRevision+1,
    immutableSnapshotHash:input.immutableSnapshotHash,issuedNumber:input.issuedNumber,
    requiresTenantScopedCAS:true,requiresIdempotentEffect:true,requiresAppendOnlyAudit:true,
    numberAllocatedHere:false,ledgerPosted:false,reversalPosted:false,persisted:false});
}
