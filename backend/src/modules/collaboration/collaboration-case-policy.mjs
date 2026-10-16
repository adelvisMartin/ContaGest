// @ts-check
// #745: authorized collaboration-case transition intent, not a portal, chat, upload or notification sender.
const ID=/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/;
const FLOW=Object.freeze({
  open:Object.freeze({request_document:{role:'accountant',to:'waiting_client'},start_review:{role:'accountant',to:'in_review'},cancel:{role:'either',to:'cancelled'}}),
  waiting_client:Object.freeze({submit_evidence:{role:'client',to:'in_review'},cancel:{role:'either',to:'cancelled'}}),
  in_review:Object.freeze({request_document:{role:'accountant',to:'waiting_client'},resolve:{role:'accountant',to:'resolved'},cancel:{role:'accountant',to:'cancelled'}}),
  resolved:Object.freeze({}),cancelled:Object.freeze({})
});
export class CollaborationCaseError extends Error {/** @param {string} code */constructor(code){super('COLLABORATION_'+code);this.name='CollaborationCaseError';this.code=code;}}
/** @param {unknown} v */
function id(v){if(typeof v!=='string'||!ID.test(v))throw new CollaborationCaseError('IDENTITY_INVALID');return v;}
/**
 * @param {{tenantId:unknown,actorTenantId:unknown,caseId:unknown,clientUserId:unknown,
 * assignedAccountantId:unknown,actorUserId:unknown,sourceVerified:unknown,status:unknown,action:unknown,
 * expectedRevision:unknown,effectKey:unknown,verifiedDocumentCount:unknown,reason:unknown}} input
 */
export function prepareCollaborationCaseTransition(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new CollaborationCaseError('INPUT_INVALID');
  const tenantId=id(input.tenantId);
  if(id(input.actorTenantId)!==tenantId||input.sourceVerified!==true)throw new CollaborationCaseError('SCOPE_OR_SOURCE_UNVERIFIED');
  const caseId=id(input.caseId),clientUserId=id(input.clientUserId),assignedAccountantId=id(input.assignedAccountantId),actorUserId=id(input.actorUserId),effectKey=id(input.effectKey);
  if(clientUserId===assignedAccountantId)throw new CollaborationCaseError('ROLE_SEPARATION_REQUIRED');
  const role=actorUserId===clientUserId?'client':actorUserId===assignedAccountantId?'accountant':null;
  if(!role)throw new CollaborationCaseError('ACTOR_NOT_AUTHORIZED');
  if(!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<1||input.expectedRevision>=Number.MAX_SAFE_INTEGER)throw new CollaborationCaseError('REVISION_INVALID');
  const state=Object.hasOwn(FLOW,String(input.status)) ? FLOW[input.status] : null;
  const rule=state && Object.hasOwn(state,String(input.action)) ? state[input.action] : null;
  if(!rule)throw new CollaborationCaseError('TRANSITION_FORBIDDEN');
  if(rule.role!=='either'&&rule.role!==role)throw new CollaborationCaseError('ACTOR_NOT_AUTHORIZED');
  if(input.action==='submit_evidence'&&(!Number.isSafeInteger(input.verifiedDocumentCount)||input.verifiedDocumentCount<1||input.verifiedDocumentCount>100))
    throw new CollaborationCaseError('EVIDENCE_REQUIRED');
  if(['resolve','cancel'].includes(input.action)&&(typeof input.reason!=='string'||input.reason.trim().length<8||input.reason.trim().length>500))
    throw new CollaborationCaseError('REASON_REQUIRED');
  return Object.freeze({tenantId,caseId,actorUserId,actorRole:role,effectKey,from:input.status,to:rule.to,
    expectedRevision:input.expectedRevision,proposedRevision:input.expectedRevision+1,
    requiresTenantScopedCAS:true,requiresIdempotentEvent:true,requiresAppendOnlyAudit:true,
    clientCanSeeOnlyOwnCase:true,persisted:false,notificationQueued:false,uploadAccepted:false,financialEffect:false});
}
