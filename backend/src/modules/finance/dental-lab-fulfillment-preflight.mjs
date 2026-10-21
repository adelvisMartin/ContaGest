// @ts-check
// #804: pure fulfillment intent on a #805-owned, server-verified Dental Lab Order.
// Never constructs lab orders, invoices, suppliers or clinical records.
const ID=/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/;
const HASH=/^[a-f0-9]{64}$/i;
const TRANSITIONS=Object.freeze({
 sent:Object.freeze({start_production:'in_production',cancel:'cancelled'}),
 in_production:Object.freeze({receive:'received',cancel:'cancelled'}),
 received:Object.freeze({begin_fit_check:'fit_check',cancel:'cancelled'}),
 fit_check:Object.freeze({accept:'accepted',request_rework:'rework_requested',cancel:'cancelled'}),
 rework_requested:Object.freeze({redeliver:'redelivered',cancel:'cancelled'}),
 redelivered:Object.freeze({begin_fit_check:'fit_check',cancel:'cancelled'}),
 accepted:Object.freeze({deliver:'delivered'}),
 delivered:Object.freeze({}),cancelled:Object.freeze({})
});
export class DentalLabFulfillmentError extends Error {
 /** @param {string} code */ constructor(code){super('DENTAL_LAB_'+code);this.name='DentalLabFulfillmentError';this.code=code;}
}
/** @param {unknown} value */
function id(value){if(typeof value!=='string'||!ID.test(value))throw new DentalLabFulfillmentError('IDENTITY_INVALID');return value;}
/**
 * @param {{tenantId:unknown,actorTenantId:unknown,actorId:unknown,patientId:unknown,labOrderId:unknown,
 * supplierId:unknown,sourceVerified:unknown,sourceSnapshotSha256:unknown,status:unknown,action:unknown,
 * expectedRevision:unknown,effectKey:unknown,previousEffectKeys:unknown,reason:unknown}} input
 */
export function prepareDentalLabFulfillment(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw new DentalLabFulfillmentError('INPUT_INVALID');
 const tenantId=id(input.tenantId);
 if(id(input.actorTenantId)!==tenantId||input.sourceVerified!==true)throw new DentalLabFulfillmentError('SOURCE_OR_TENANT_INVALID');
 const actorId=id(input.actorId),patientId=id(input.patientId),labOrderId=id(input.labOrderId),supplierId=id(input.supplierId),effectKey=id(input.effectKey);
 if(typeof input.sourceSnapshotSha256!=='string'||!HASH.test(input.sourceSnapshotSha256))throw new DentalLabFulfillmentError('SNAPSHOT_INVALID');
 if(!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<1||input.expectedRevision>=Number.MAX_SAFE_INTEGER)throw new DentalLabFulfillmentError('REVISION_INVALID');
 const domain=Object.hasOwn(TRANSITIONS,String(input.status))?TRANSITIONS[input.status]:null;
 const to=domain&&Object.hasOwn(domain,String(input.action))?domain[input.action]:null;
 if(!to)throw new DentalLabFulfillmentError('TRANSITION_FORBIDDEN');
 if(!Array.isArray(input.previousEffectKeys)||input.previousEffectKeys.length>500||input.previousEffectKeys.some(v=>typeof v!=='string'))
   throw new DentalLabFulfillmentError('EFFECT_HISTORY_INVALID');
 if(new Set(input.previousEffectKeys).size!==input.previousEffectKeys.length)throw new DentalLabFulfillmentError('EFFECT_HISTORY_INVALID');
 if(input.previousEffectKeys.includes(effectKey))throw new DentalLabFulfillmentError('EFFECT_REPLAY');
 const correction=['request_rework','cancel'].includes(input.action);
 if(correction&&(typeof input.reason!=='string'||input.reason.trim().length<8||input.reason.trim().length>500))
   throw new DentalLabFulfillmentError('REASON_REQUIRED');
 return Object.freeze({tenantId,actorId,patientId,labOrderId,supplierId,effectKey,
  from:input.status,to,action:input.action,sourceSnapshotSha256:input.sourceSnapshotSha256,
  expectedRevision:input.expectedRevision,proposedRevision:input.expectedRevision+1,
  requiresSameTenantOrderSupplierPatient:true,requiresVersionedAppendOnlyEvidence:true,
  requiresEffectKeyUniqueness:true,requiresTenantScopedCAS:true,
  clinicalEvidenceModified:false,persisted:false,inventoryModified:false,invoiceCreated:false,
  notificationSent:false});
}
