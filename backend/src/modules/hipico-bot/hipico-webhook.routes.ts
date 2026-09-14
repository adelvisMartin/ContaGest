import { Router } from 'express';
import { extractMessages, HipicoBotStore } from './hipico-bot.service.js';
import { dispatchCanonicalOutbound } from './hipico-outbound-worker.js';
import { configuredOutboxOwnerId, recordCanonicalReceipt } from './hipico-outbox.store.js';
import { extractMetaReceipts } from './hipico-meta-receipts.js';
import { processIncomingCanonical } from './hipico-webhook-outbound.js';
import { webhookPhoneNumberId, webhookSecurityReady, webhookSignatureValid, webhookVerifyTokenValid } from './hipico-webhook-security.js';
import { assertPersistedWebhookReplay } from './hipico-webhook-replay.js';
import { metaTimestampValid } from './hipico-meta-timestamp-policy.js';

const router=Router();
const WEBHOOK_BATCH_CONCURRENCY=25;
const WEBHOOK_REPLAY_MISMATCH='HIPICO_WEBHOOK_REPLAY_MISMATCH';

type ExtractedMessage={phoneNumberId?:string;providerMessageId?:string;payload?:any};
type RuntimeEnv=Record<string,string|undefined>;

function rawMessageCount(payload:any){
  let count=0;
  for(const entry of payload?.entry||[])for(const change of entry?.changes||[]){
    const messages=change?.value?.messages;
    if(Array.isArray(messages))count+=messages.length;
  }
  return count;
}

function rawStatusCount(payload:any){
  let count=0;
  for(const entry of payload?.entry||[])for(const change of entry?.changes||[]){
    const statuses=change?.value?.statuses;
    if(Array.isArray(statuses))count+=statuses.length;
  }
  return count;
}

function rawEnvelopeIdentityError(payload:any,env:RuntimeEnv=process.env){
  const expected=webhookPhoneNumberId(env);
  if(!expected)return 'WEBHOOK_PHONE_NUMBER_NOT_CONFIGURED';
  for(const entry of payload?.entry||[])for(const change of entry?.changes||[]){
    const value=change?.value||{};
    const hasMessages=Array.isArray(value.messages)&&value.messages.length>0;
    const hasStatuses=Array.isArray(value.statuses)&&value.statuses.length>0;
    if(!hasMessages&&!hasStatuses)continue;
    const actual=String(value?.metadata?.phone_number_id||'').trim();
    if(actual!==expected)return 'WEBHOOK_PHONE_NUMBER_MISMATCH';
  }
  return null;
}

function webhookIdentityError(messages:ExtractedMessage[],env:RuntimeEnv=process.env){
  const expected=webhookPhoneNumberId(env);
  if(!expected)return 'WEBHOOK_PHONE_NUMBER_NOT_CONFIGURED';
  return messages.some((message)=>String(message?.phoneNumberId||'').trim()!==expected)
    ?'WEBHOOK_PHONE_NUMBER_MISMATCH'
    :null;
}

function webhookTimestampValid(message:ExtractedMessage){
  return metaTimestampValid(message?.payload?.timestamp);
}

async function processMessageWithReplayGuard(message:any){
  const alreadyPersisted=await assertPersistedWebhookReplay(message);
  const result=await processIncomingCanonical(message,{requirePersistent:true});
  if(result?.duplicate&&!alreadyPersisted)await assertPersistedWebhookReplay(message);
  if(result.dispatchRequested&&result.outbox?.id){
    const ownerId=configuredOutboxOwnerId();
    if(!ownerId)throw Object.assign(new Error('Canonical outbox owner is not configured.'),{code:'HIPICO_OWNER_NOT_CONFIGURED'});
    const dispatch=await dispatchCanonicalOutbound({ownerId,id:String(result.outbox.id)});
    if(dispatch.status==='retry'||dispatch.status==='not_claimed'){
      throw Object.assign(new Error('Canonical outbound retry is pending and the inbound webhook must be retried.'),{
        code:dispatch.status==='retry'?'HIPICO_OUTBOX_RETRY_SCHEDULED':'HIPICO_OUTBOX_RETRY_NOT_DUE'
      });
    }
    return{...result,dispatch};
  }
  return result;
}

async function processMessagesBounded(messages:any[]){
  let processed=0;
  let failed=0;
  let mismatched=0;
  for(let offset=0;offset<messages.length;offset+=WEBHOOK_BATCH_CONCURRENCY){
    const batch=messages.slice(offset,offset+WEBHOOK_BATCH_CONCURRENCY);
    const settled=await Promise.allSettled(batch.map(processMessageWithReplayGuard));
    for(const item of settled){
      if(item.status==='fulfilled')processed+=1;
      else if((item.reason as any)?.code===WEBHOOK_REPLAY_MISMATCH)mismatched+=1;
      else failed+=1;
    }
  }
  return{processed,failed,mismatched};
}

async function processReceiptsBounded(receipts:ReturnType<typeof extractMetaReceipts>){
  const ownerId=configuredOutboxOwnerId();
  if(!ownerId)throw Object.assign(new Error('Canonical outbox owner is not configured.'),{code:'HIPICO_OWNER_NOT_CONFIGURED'});
  let matched=0;
  let unmatched=0;
  let inserted=0;
  for(let offset=0;offset<receipts.length;offset+=WEBHOOK_BATCH_CONCURRENCY){
    const batch=receipts.slice(offset,offset+WEBHOOK_BATCH_CONCURRENCY);
    const settled=await Promise.allSettled(batch.map((receipt)=>recordCanonicalReceipt({
      ownerId,
      provider:'meta_cloud',
      providerMessageId:receipt.providerMessageId,
      status:receipt.status,
      timestamp:receipt.timestamp,
      errorCode:receipt.errorCode,
      metadata:receipt.metadata
    })));
    for(const item of settled){
      if(item.status==='rejected')throw item.reason;
      if(item.value.matched)matched+=1;else unmatched+=1;
      if(item.value.inserted)inserted+=1;
    }
  }
  return{matched,unmatched,inserted};
}

router.use((_req,res,next)=>{
  res.setHeader('Cache-Control','no-store, max-age=0');
  next();
});

router.get('/webhook',(req,res)=>{
  const mode=String(req.query['hub.mode']||'');
  const token=String(req.query['hub.verify_token']||'');
  const challenge=String(req.query['hub.challenge']||'');
  if(!webhookSecurityReady())return res.status(503).json({ok:false,error:'Webhook Hípico no configurado de forma segura.'});
  if(mode==='subscribe'&&webhookVerifyTokenValid(token))return res.status(200).send(challenge);
  return res.sendStatus(403);
});

router.post('/webhook',async(req,res)=>{
  if(!webhookSecurityReady())return res.status(503).json({ok:false,retryable:true,error:'Webhook Hípico no configurado de forma segura.'});
  const raw=(req as any).rawBody as Buffer|undefined;
  if(!webhookSignatureValid(raw,req.header('x-hub-signature-256')||undefined)){
    return res.status(401).json({ok:false,retryable:false,error:'Firma de webhook inválida.'});
  }

  const envelopeIdentityError=rawEnvelopeIdentityError(req.body);
  if(envelopeIdentityError==='WEBHOOK_PHONE_NUMBER_NOT_CONFIGURED'){
    return res.status(503).json({ok:false,retryable:true,error:'webhook_not_configured'});
  }
  if(envelopeIdentityError){
    return res.status(200).json({ok:false,acknowledged:true,accepted:false,retryable:false,error:'webhook_phone_number_mismatch',received:0});
  }

  const expectedRawMessages=rawMessageCount(req.body);
  const expectedRawReceipts=rawStatusCount(req.body);
  const extractedMessages=extractMessages(req.body).map((message)=>({...message,body:String(message.body||'').slice(0,4000)}));
  const messages=extractedMessages.filter(webhookTimestampValid);
  const receipts=extractMetaReceipts(req.body);
  const invalidMessages=Math.max(0,expectedRawMessages-messages.length);
  const invalidReceipts=Math.max(0,expectedRawReceipts-receipts.length);

  const identityError=webhookIdentityError(messages);
  if(identityError==='WEBHOOK_PHONE_NUMBER_NOT_CONFIGURED'){
    return res.status(503).json({ok:false,retryable:true,error:'webhook_not_configured'});
  }
  if(identityError){
    return res.status(200).json({ok:false,acknowledged:true,accepted:false,retryable:false,error:'webhook_phone_number_mismatch',received:expectedRawMessages,validMessages:messages.length,invalidMessages});
  }

  if(expectedRawMessages>0&&messages.length===0){
    return res.status(200).json({ok:false,acknowledged:true,accepted:false,retryable:false,error:'invalid_message_identity',received:expectedRawMessages,processed:0,invalidMessages,receiptsReceived:expectedRawReceipts,invalidReceipts});
  }

  if(messages.length>0&&!await HipicoBotStore.dbReady(true)){
    return res.status(503).json({ok:false,retryable:true,error:'webhook_persistence_unavailable',detail:'Persistencia Hípico no disponible.',received:expectedRawMessages,validMessages:messages.length,invalidMessages});
  }

  let receiptResult={matched:0,unmatched:0,inserted:0};
  if(receipts.length>0){
    try{
      receiptResult=await processReceiptsBounded(receipts);
    }catch(error:any){
      console.error('[hipico-webhook] receipt persistence failed',{error:error?.message||String(error),code:error?.code||null});
      return res.status(503).json({ok:false,retryable:true,error:'receipt_processing_failed',receiptsReceived:expectedRawReceipts,validReceipts:receipts.length,invalidReceipts});
    }
  }

  const result=messages.length>0?await processMessagesBounded(messages):{processed:0,failed:0,mismatched:0};
  if(result.failed>0){
    return res.status(503).json({ok:false,retryable:true,received:expectedRawMessages,processed:result.processed,failed:result.failed,mismatched:result.mismatched,invalidMessages,error:'webhook_processing_failed',receiptsReceived:expectedRawReceipts,receipts:receiptResult,invalidReceipts});
  }
  if(result.mismatched>0){
    return res.status(200).json({ok:false,acknowledged:true,accepted:false,retryable:false,error:'webhook_replay_mismatch',received:expectedRawMessages,processed:result.processed,failed:0,mismatched:result.mismatched,invalidMessages,receiptsReceived:expectedRawReceipts,receipts:receiptResult,invalidReceipts});
  }

  const partial=invalidMessages>0||invalidReceipts>0;
  return res.status(200).json({
    ok:!partial,
    acknowledged:true,
    accepted:true,
    partial,
    retryable:false,
    ...(partial?{error:'invalid_webhook_items_partial'}:{}),
    received:expectedRawMessages,
    processed:result.processed,
    failed:0,
    mismatched:0,
    invalidMessages,
    receiptsReceived:expectedRawReceipts,
    validReceipts:receipts.length,
    invalidReceipts,
    receipts:receiptResult
  });
});

export default router;

export const __test__={rawMessageCount,rawStatusCount,rawEnvelopeIdentityError,webhookIdentityError,webhookTimestampValid,processMessagesBounded,processReceiptsBounded,WEBHOOK_BATCH_CONCURRENCY,WEBHOOK_REPLAY_MISMATCH};
