// @ts-check
/**
 * #772 Post-cryptographic, post-durable-inbox acceptance gate. **Not**
 * the signature verifier, replay store or HTTP webhook handler.
 * All evidence flags and identifiers must come from trusted SERVER adapters.
 * Never expose event/body/secret/tenant identifiers in the result.
 */
const KEY=/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/;
/** @param {boolean} permitted @param {string} reason */
const result=(permitted,reason)=>Object.freeze({processingPermitted:permitted,
  reason,requiresServerSideCrypto:true,requiresDurableInbox:true});
/**
 * @param {{registeredTenantId:unknown,authenticatedTenantId:unknown,
 * registeredConnectionId:unknown,verifiedConnectionId:unknown,
 * signedEventId:unknown,inboxClaimEventId:unknown,
 * signatureVerified:unknown,receivedAtMs:unknown,signedTimestampMs:unknown,
 * durableInboxClaim:unknown,inboxClaimTenantId:unknown,inboxClaimConnectionId:unknown}} input
 */
export function gateProviderWebhookEvent(input){
 if(!input||typeof input!=='object'||Array.isArray(input))return result(false,'INVALID_INPUT');
 const keys=[input.registeredTenantId,input.authenticatedTenantId,input.registeredConnectionId,
  input.verifiedConnectionId,input.signedEventId];
 if(keys.some(x=>typeof x!=='string'||!KEY.test(x)))return result(false,'INVALID_TRUSTED_IDENTITY');
 if(input.signatureVerified!==true)return result(false,'SIGNATURE_NOT_VERIFIED');
 if(input.authenticatedTenantId!==input.registeredTenantId
   ||input.verifiedConnectionId!==input.registeredConnectionId)
   return result(false,'CONNECTION_TENANT_MISMATCH');
 if(!Number.isSafeInteger(input.receivedAtMs)||!Number.isSafeInteger(input.signedTimestampMs)
   ||input.receivedAtMs<=0||input.signedTimestampMs<=0
   ||Math.abs(input.receivedAtMs-input.signedTimestampMs)>300000)
   return result(false,'TIMESTAMP_OUT_OF_WINDOW');
 if(input.durableInboxClaim!=='inserted'&&input.durableInboxClaim!=='duplicate')
   return result(false,'INBOX_CLAIM_REQUIRED');
 if(input.inboxClaimTenantId!==input.registeredTenantId
   ||input.inboxClaimConnectionId!==input.registeredConnectionId
   ||input.inboxClaimEventId!==input.signedEventId)
   return result(false,'INBOX_CLAIM_SCOPE_MISMATCH');
 if(input.durableInboxClaim==='duplicate')return result(false,'DUPLICATE_EVENT');
 return result(true,'VERIFIED_AND_CLAIMED');
}
