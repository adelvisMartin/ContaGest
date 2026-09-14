import { normalizeMetaTimestamp } from './hipico-meta-timestamp-policy.js';

const PROVIDER_MESSAGE_ID_MAX=320;
const PHONE_NUMBER_ID_MAX=120;
const E164_DIGITS=/^[1-9]\d{6,14}$/;
const RECEIPT_STATES=new Set(['sent','delivered','read','failed']);

export type MetaReceiptStatus='sent'|'delivered'|'read'|'failed';
export type MetaReceipt={
  providerMessageId:string;
  phoneNumberId:string;
  recipientId:string;
  status:MetaReceiptStatus;
  timestamp:Date;
  errorCode:string|null;
  metadata:Record<string,unknown>;
};

function text(value:unknown){return String(value??'').trim();}

export function safeReceiptMetadata(status:any){
  const recipientId=text(status?.recipient_id);
  const providerErrorCode=text(status?.errors?.[0]?.code).slice(0,120);
  return{
    ...(recipientId?{recipientId}:{}),
    ...(providerErrorCode?{providerErrorCode}:{}),
  };
}

export function extractMetaReceipts(payload:any):MetaReceipt[]{
  const rows:MetaReceipt[]=[];
  for(const entry of payload?.entry||[])for(const change of entry?.changes||[]){
    const value=change?.value||{};
    const phoneNumberId=text(value?.metadata?.phone_number_id);
    if(!phoneNumberId||phoneNumberId.length>PHONE_NUMBER_ID_MAX)continue;
    const statuses=Array.isArray(value?.statuses)?value.statuses:[];
    for(const status of statuses){
      const providerMessageId=text(status?.id);
      const state=text(status?.status).toLowerCase();
      const recipientId=text(status?.recipient_id).replace(/^\+/,'');
      const normalizedTimestamp=normalizeMetaTimestamp(status?.timestamp);
      if(!providerMessageId||providerMessageId.length>PROVIDER_MESSAGE_ID_MAX||!RECEIPT_STATES.has(state)||!E164_DIGITS.test(recipientId)||!normalizedTimestamp)continue;
      const errorCode=text(status?.errors?.[0]?.code).slice(0,120)||null;
      rows.push({
        providerMessageId,
        phoneNumberId,
        recipientId,
        status:state as MetaReceiptStatus,
        timestamp:new Date(normalizedTimestamp),
        errorCode,
        metadata:safeReceiptMetadata(status)
      });
    }
  }
  return rows;
}
