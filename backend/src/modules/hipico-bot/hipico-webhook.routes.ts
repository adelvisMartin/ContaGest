import { Router } from 'express';
import { extractMessages, HipicoBotStore, processIncoming } from './hipico-bot.service.js';
import { webhookPhoneNumberId, webhookSecurityReady, webhookSignatureValid, webhookVerifyTokenValid } from './hipico-webhook-security.js';
import { assertPersistedWebhookReplay } from './hipico-webhook-replay.js';

const router=Router();
const WEBHOOK_BATCH_CONCURRENCY=25;
const WEBHOOK_REPLAY_MISMATCH='HIPICO_WEBHOOK_REPLAY_MISMATCH';

type ExtractedMessage={phoneNumberId?:string;providerMessageId?:string};
type RuntimeEnv=Record<string,string|undefined>;

function rawMessageCount(payload:any){
  let count=0;
  for(const entry of payload?.entry||[])for(const change of entry?.changes||[]){
    const messages=change?.value?.messages;
    if(Array.isArray(messages))count+=messages.length;
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

async function processMessageWithReplayGuard(message:any){
  const alreadyPersisted=await assertPersistedWebhookReplay(message);
  if(alreadyPersisted)return{duplicate:true};
  const result=await processIncoming(message);
  if(result?.duplicate)await assertPersistedWebhookReplay(message);
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
  const messages=extractMessages(req.body).map((message)=>({...message,body:String(message.body||'').slice(0,4000)}));
  const invalidMessages=Math.max(0,expectedRawMessages-messages.length);

  const identityError=webhookIdentityError(messages);
  if(identityError==='WEBHOOK_PHONE_NUMBER_NOT_CONFIGURED'){
    return res.status(503).json({ok:false,retryable:true,error:'webhook_not_configured'});
  }
  if(identityError){
    return res.status(200).json({ok:false,acknowledged:true,accepted:false,retryable:false,error:'webhook_phone_number_mismatch',received:expectedRawMessages,validMessages:messages.length,invalidMessages});
  }

  if(messages.length===0){
    if(invalidMessages>0){
      return res.status(200).json({ok:false,acknowledged:true,accepted:false,retryable:false,error:'invalid_message_identity',received:expectedRawMessages,processed:0,invalidMessages});
    }
    return res.status(200).json({ok:true,received:0,processed:0,failed:0,mismatched:0,invalidMessages:0});
  }

  if(!await HipicoBotStore.dbReady(true)){
    return res.status(503).json({ok:false,retryable:true,error:'Persistencia Hípico no disponible.',received:expectedRawMessages,validMessages:messages.length,invalidMessages});
  }

  const result=await processMessagesBounded(messages);
  if(result.failed>0){
    return res.status(503).json({ok:false,retryable:true,received:expectedRawMessages,processed:result.processed,failed:result.failed,mismatched:result.mismatched,invalidMessages,error:'Uno o más mensajes válidos no se pudieron persistir.'});
  }
  if(result.mismatched>0){
    return res.status(200).json({ok:false,acknowledged:true,accepted:false,retryable:false,error:'webhook_replay_mismatch',received:expectedRawMessages,processed:result.processed,failed:0,mismatched:result.mismatched,invalidMessages});
  }
  if(invalidMessages>0){
    return res.status(200).json({
      ok:false,
      acknowledged:true,
      accepted:true,
      partial:true,
      retryable:false,
      error:'invalid_message_identity_partial',
      received:expectedRawMessages,
      processed:result.processed,
      failed:0,
      mismatched:0,
      invalidMessages
    });
  }
  return res.status(200).json({ok:true,received:expectedRawMessages,processed:result.processed,failed:0,mismatched:0,invalidMessages:0});
});

export default router;

export const __test__={rawMessageCount,rawEnvelopeIdentityError,webhookIdentityError,processMessagesBounded,WEBHOOK_BATCH_CONCURRENCY,WEBHOOK_REPLAY_MISMATCH};
