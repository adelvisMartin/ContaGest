import crypto from 'node:crypto';

type WebhookReplayRecord={
  providerMessageId?:unknown;
  phoneNumberId?:unknown;
  sender?:unknown;
  messageType?:unknown;
  body?:unknown;
  payload?:unknown;
};

function canonicalJson(value:unknown):string {
  if(value===null||typeof value!=='object')return JSON.stringify(value)??'null';
  if(Array.isArray(value))return `[${value.map(canonicalJson).join(',')}]`;
  const record=value as Record<string,unknown>;
  return `{${Object.keys(record).sort().map((key)=>`${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
}

function scalar(value:unknown,fallback=''){
  return value===null||value===undefined?fallback:String(value);
}

export function webhookReplaySignature(row:WebhookReplayRecord){
  const immutable={
    providerMessageId:scalar(row.providerMessageId),
    phoneNumberId:scalar(row.phoneNumberId),
    sender:scalar(row.sender),
    messageType:scalar(row.messageType,'unknown')||'unknown',
    body:scalar(row.body),
    payload:row.payload??{}
  };
  return crypto.createHash('sha256').update(canonicalJson(immutable)).digest('hex');
}

export function sameWebhookReplay(existing:WebhookReplayRecord,incoming:WebhookReplayRecord){
  return webhookReplaySignature(existing)===webhookReplaySignature(incoming);
}

export function replayMismatchError(){
  return Object.assign(new Error('providerMessageId was reused with different webhook content.'),{
    code:'HIPICO_WEBHOOK_REPLAY_MISMATCH'
  });
}
