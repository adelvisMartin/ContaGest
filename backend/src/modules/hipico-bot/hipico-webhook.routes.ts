import { Router } from 'express';
import { extractMessages, HipicoBotStore, processIncoming } from './hipico-bot.service.js';
import { metaSignatureValid, metaVerifyTokenValid, metaWebhookRuntimeConfigured } from './hipico-meta-security.js';
import { hipicoNumericProviderIdConfigured } from './hipico-secret-security.js';

const router=Router();
const WEBHOOK_PROCESSING_CONCURRENCY=10;
const WEBHOOK_REPLAY_MISMATCH='HIPICO_WEBHOOK_REPLAY_MISMATCH';

type ExtractedMessage={phoneNumberId?:string};
type RuntimeEnv=Record<string,string|undefined>;

function configuredPhoneNumberId(env:RuntimeEnv=process.env){
  const value=String(env.WHATSAPP_PHONE_NUMBER_ID||'').trim();
  return hipicoNumericProviderIdConfigured(value)?value:'';
}

function webhookIdentityError(messages:ExtractedMessage[],env:RuntimeEnv=process.env){
  const expected=configuredPhoneNumberId(env);
  if(!expected)return 'WEBHOOK_PHONE_NUMBER_NOT_CONFIGURED';
  return messages.some((message)=>String(message?.phoneNumberId||'').trim()!==expected)
    ?'WEBHOOK_PHONE_NUMBER_MISMATCH'
    :null;
}

async function processMessagesBounded(messages:any[]){
  let processed=0;
  let failed=0;
  let mismatched=0;
  for(let offset=0;offset<messages.length;offset+=WEBHOOK_PROCESSING_CONCURRENCY){
    const batch=messages.slice(offset,offset+WEBHOOK_PROCESSING_CONCURRENCY);
    const settled=await Promise.allSettled(batch.map(processIncoming));
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
  if(!metaWebhookRuntimeConfigured())return res.status(503).json({ok:false,error:'webhook_not_configured'});
  const mode=String(req.query['hub.mode']||'');
  const token=String(req.query['hub.verify_token']||'');
  const challenge=String(req.query['hub.challenge']||'');
  if(mode==='subscribe'&&metaVerifyTokenValid(token))return res.status(200).send(challenge);
  return res.sendStatus(403);
});

router.post('/webhook',async(req,res)=>{
  if(!metaWebhookRuntimeConfigured())return res.status(503).json({ok:false,retryable:true,error:'webhook_not_configured'});
  const raw=(req as any).rawBody as Buffer|undefined;
  if(!metaSignatureValid(raw,req.header('x-hub-signature-256')||undefined)){
    return res.status(401).json({ok:false,retryable:false,error:'Firma de webhook inválida.'});
  }

  const messages=extractMessages(req.body);
  const identityError=webhookIdentityError(messages);
  if(identityError==='WEBHOOK_PHONE_NUMBER_NOT_CONFIGURED'){
    return res.status(503).json({ok:false,retryable:true,error:'webhook_not_configured'});
  }
  if(identityError){
    return res.status(400).json({ok:false,retryable:false,error:'webhook_phone_number_mismatch'});
  }
  if(messages.length===0){
    return res.status(200).json({ok:true,received:0,processed:0,failed:0,mismatched:0});
  }

  // Production webhook acknowledgements require durable PostgreSQL evidence.
  // The in-memory store remains useful for local/manual development paths, but
  // must never cause Meta to stop retrying a real inbound message batch.
  if(!await HipicoBotStore.dbReady(true)){
    return res.status(503).json({ok:false,retryable:true,error:'webhook_persistence_unavailable'});
  }

  const result=await processMessagesBounded(messages);
  if(result.failed>0){
    // A 2xx here would acknowledge messages that were not durably processed and
    // Meta would stop retrying them. Dedupe makes the successful subset safe to
    // see again when Meta retries the same signed webhook batch.
    return res.status(503).json({
      ok:false,
      retryable:true,
      error:'webhook_processing_failed',
      received:messages.length,
      processed:result.processed,
      failed:result.failed,
      mismatched:result.mismatched
    });
  }
  if(result.mismatched>0){
    // Reusing an immutable Meta provider id with different source content is an
    // integrity violation, not a transient delivery failure. Retrying the same
    // altered event cannot make it valid and must never overwrite the original.
    return res.status(409).json({
      ok:false,
      retryable:false,
      error:'webhook_replay_mismatch',
      received:messages.length,
      processed:result.processed,
      failed:0,
      mismatched:result.mismatched
    });
  }
  return res.status(200).json({ok:true,received:messages.length,processed:result.processed,failed:0,mismatched:0});
});

export default router;

export const __test__={configuredPhoneNumberId,webhookIdentityError,processMessagesBounded,WEBHOOK_PROCESSING_CONCURRENCY,WEBHOOK_REPLAY_MISMATCH};
