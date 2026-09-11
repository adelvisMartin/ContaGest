import { Router } from 'express';
import { extractMessages, HipicoBotStore, processIncoming } from './hipico-bot.service.js';
import { metaSignatureValid, metaVerifyTokenValid, metaWebhookSecretsConfigured } from './hipico-meta-security.js';
import { hipicoNumericProviderIdConfigured } from './hipico-secret-security.js';

const router=Router();
const WEBHOOK_PROCESSING_CONCURRENCY=10;

type ExtractedMessage={phoneNumberId?:string};
type RuntimeEnv=Record<string,string|undefined>;

function configuredPhoneNumberId(env:RuntimeEnv=process.env){
  return String(env.WHATSAPP_PHONE_NUMBER_ID||'').trim();
}

function rawMessageCount(payload:any){
  let count=0;
  for(const entry of payload?.entry||[])for(const change of entry?.changes||[]){
    if(Array.isArray(change?.value?.messages))count+=change.value.messages.length;
  }
  return count;
}

function rawEnvelopeIdentityError(payload:any,env:RuntimeEnv=process.env){
  const expected=configuredPhoneNumberId(env);
  if(!hipicoNumericProviderIdConfigured(expected))return 'WEBHOOK_PHONE_NUMBER_NOT_CONFIGURED';
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
  const expected=configuredPhoneNumberId(env);
  if(!hipicoNumericProviderIdConfigured(expected))return 'WEBHOOK_PHONE_NUMBER_NOT_CONFIGURED';
  return messages.some((message)=>String(message?.phoneNumberId||'').trim()!==expected)
    ?'WEBHOOK_PHONE_NUMBER_MISMATCH'
    :null;
}

async function processMessagesBounded(messages:any[]){
  let processed=0;
  let failed=0;
  for(let offset=0;offset<messages.length;offset+=WEBHOOK_PROCESSING_CONCURRENCY){
    const batch=messages.slice(offset,offset+WEBHOOK_PROCESSING_CONCURRENCY);
    const settled=await Promise.allSettled(batch.map(processIncoming));
    processed+=settled.filter((item)=>item.status==='fulfilled').length;
    failed+=settled.filter((item)=>item.status==='rejected').length;
  }
  return{processed,failed};
}

router.use((_req,res,next)=>{
  res.setHeader('Cache-Control','no-store, max-age=0');
  next();
});

router.get('/webhook',(req,res)=>{
  const mode=String(req.query['hub.mode']||'');
  const token=String(req.query['hub.verify_token']||'');
  const challenge=String(req.query['hub.challenge']||'');
  if(!metaWebhookSecretsConfigured())return res.status(503).json({ok:false,error:'Webhook Hípico no configurado de forma segura.'});
  if(mode==='subscribe'&&metaVerifyTokenValid(token))return res.status(200).send(challenge);
  return res.sendStatus(403);
});

router.post('/webhook',async(req,res)=>{
  if(!metaWebhookSecretsConfigured())return res.status(503).json({ok:false,retryable:true,error:'webhook_not_configured'});
  const raw=(req as any).rawBody as Buffer|undefined;
  if(!metaSignatureValid(raw,req.header('x-hub-signature-256')||undefined)){
    return res.status(401).json({ok:false,retryable:false,error:'invalid_signature'});
  }

  const envelopeIdentityError=rawEnvelopeIdentityError(req.body);
  if(envelopeIdentityError==='WEBHOOK_PHONE_NUMBER_NOT_CONFIGURED'){
    return res.status(503).json({ok:false,retryable:true,error:'webhook_not_configured'});
  }
  if(envelopeIdentityError){
    return res.status(200).json({ok:false,acknowledged:true,accepted:false,retryable:false,error:'webhook_phone_number_mismatch',received:0});
  }

  const expectedRawMessages=rawMessageCount(req.body);
  const messages=extractMessages(req.body).map((message)=>({...message,body:String(message.body||'').slice(0,4000)}));
  if(messages.length!==expectedRawMessages){
    return res.status(200).json({ok:false,acknowledged:true,accepted:false,retryable:false,error:'invalid_message_identity',received:expectedRawMessages,acceptedMessages:messages.length});
  }

  const identityError=webhookIdentityError(messages);
  if(identityError==='WEBHOOK_PHONE_NUMBER_NOT_CONFIGURED'){
    return res.status(503).json({ok:false,retryable:true,error:'webhook_not_configured'});
  }
  if(identityError){
    return res.status(200).json({ok:false,acknowledged:true,accepted:false,retryable:false,error:'webhook_phone_number_mismatch',received:messages.length});
  }

  if(messages.length===0){
    return res.status(200).json({ok:true,received:0,processed:0,failed:0});
  }

  // A successful Meta transport acknowledgement is emitted only after durable
  // persistence has been proven available. Provider message IDs make retries
  // idempotent, while permanent identity rejects are acknowledged above to
  // avoid an endless redelivery loop.
  if(!await HipicoBotStore.dbReady(true)){
    return res.status(503).json({ok:false,retryable:true,error:'webhook_persistence_unavailable'});
  }

  const result=await processMessagesBounded(messages);
  if(result.failed>0){
    return res.status(503).json({ok:false,retryable:true,received:messages.length,processed:result.processed,failed:result.failed,error:'webhook_processing_failed'});
  }
  return res.status(200).json({ok:true,received:messages.length,processed:result.processed,failed:0});
});

export default router;

export const __test__={configuredPhoneNumberId,rawMessageCount,rawEnvelopeIdentityError,webhookIdentityError,processMessagesBounded,WEBHOOK_PROCESSING_CONCURRENCY};
