// @ts-check
/**
 * Only verifies that a provider acknowledged accepting a message ID.
 * It cannot prove recipient delivery or read status; receipts need signed
 * webhook verification under #772 before state can become delivered.
 * No raw provider body, message ID, address or secret escapes this boundary.
 * @param {boolean} httpAccepted
 * @param {unknown} data
 * @returns {Readonly<{status:'provider_accepted'|'provider_unverified',providerAccepted:boolean,deliveryConfirmed:false}>}
 */
export function classifyWhatsAppProviderAck(httpAccepted,data){
  const body=data && typeof data==='object' && !Array.isArray(data) ? data : null;
  const messages=body && /** @type {{messages?:unknown}} */ (body).messages;
  const message=Array.isArray(messages) && messages.length===1 ? messages[0] : null;
  const messageId=message && typeof message==='object' && !Array.isArray(message)
    ? /** @type {{id?:unknown}} */ (message).id : null;
  const accepted=httpAccepted===true && typeof messageId==='string'
    && /^[A-Za-z0-9._:-]{8,256}$/.test(messageId);
  return Object.freeze({
    status:accepted?'provider_accepted':'provider_unverified',
    providerAccepted:accepted,deliveryConfirmed:false
  });
}
