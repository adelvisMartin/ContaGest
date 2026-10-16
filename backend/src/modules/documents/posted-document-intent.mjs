/** #769 Non-persistent, fail-closed lifecycle intent. #762 owns numbering; #637 owns money. */
const ID=/^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,119}$/;
const EDGES=Object.freeze({
  draft:Object.freeze(['issue','cancel']),
  issued:Object.freeze(['post','cancel']),
  posted:Object.freeze(['reverse']),
  cancelled:Object.freeze([]),
  reversed:Object.freeze([])
});
const RESULT=Object.freeze({issue:'issued',post:'posted',cancel:'cancelled',reverse:'reversed'});
export function prepareDocumentTransition({document,action,actorId,reason,expectedRevision,tenantId}={}) {
  if(!document || typeof document!=='object'||Array.isArray(document)||!ID.test(tenantId||'')||
     document.tenantId!==tenantId||!ID.test(document.id||'')||!ID.test(actorId||'')||
     !Number.isSafeInteger(expectedRevision)||expectedRevision<0||document.revision!==expectedRevision){
    throw new Error('DOCUMENT_SCOPE_OR_REVISION_CONFLICT');
  }
  if(!Object.hasOwn(RESULT,action)||!Object.hasOwn(EDGES,document.status)||
     !EDGES[document.status].includes(action))throw new Error('DOCUMENT_TRANSITION_FORBIDDEN');
  if(['cancel','reverse'].includes(action)&& (typeof reason!=='string'||reason.trim().length<10||reason.length>300)){
    throw new Error('DOCUMENT_REASON_REQUIRED');
  }
  if(['issue','post','reverse'].includes(action)&&!ID.test(document.sequenceId||'')){
    throw new Error('DOCUMENT_SEQUENCE_AUTHORITY_REQUIRED');
  }
  if(['issue','post'].includes(action)&& (typeof document.snapshotHash!=='string'||
     !/^[a-f0-9]{64}$/.test(document.snapshotHash)))throw new Error('DOCUMENT_SNAPSHOT_REQUIRED');
  if(action==='reverse'&&!document.postedLedgerEntryId)throw new Error('LEDGER_REVERSAL_AUTHORITY_REQUIRED');
  return Object.freeze({documentId:document.id,tenantId,expectedRevision,actorId,action,
    nextStatus:RESULT[action],reason:['cancel','reverse'].includes(action)?reason.trim():null,
    snapshotHash:document.snapshotHash||null,sequenceId:document.sequenceId||null,
    ledgerPostingPerformed:false,originalDocumentMutated:false,requiresTransaction:true});
}
