import { Router } from 'express';
import { extractMessages, HipicoBotStore, processIncoming } from './hipico-bot.service.js';
import { webhookSecurityReady, webhookSignatureValid, webhookVerifyTokenValid } from './hipico-webhook-security.js';

const router=Router();
const WEBHOOK_BATCH_CONCURRENCY=25;

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

  // Never acknowledge Meta from volatile in-memory fallback. A non-2xx response
  // causes a retry, while provider message IDs make successful replays idempotent.
  if(!await HipicoBotStore.dbReady(true)){
    return res.status(503).json({ok:false,retryable:true,error:'Persistencia Hípico no disponible.'});
  }

  const messages=extractMessages(req.body).map((message)=>({...message,body:String(message.body||'').slice(0,4000)}));
  let processedCount=0;
  let failed=0;
  for(let offset=0;offset<messages.length;offset+=WEBHOOK_BATCH_CONCURRENCY){
    const batch=messages.slice(offset,offset+WEBHOOK_BATCH_CONCURRENCY);
    const settled=await Promise.allSettled(batch.map(processIncoming));
    failed+=settled.filter((item)=>item.status==='rejected').length;
    processedCount+=settled.filter((item)=>item.status==='fulfilled').length;
  }
  if(failed){
    return res.status(503).json({ok:false,retryable:true,received:messages.length,processed:processedCount,failed,error:'Uno o más mensajes no se pudieron persistir.'});
  }
  return res.status(200).json({ok:true,received:messages.length,processed:processedCount,failed:0});
});

export default router;

export const __test__={WEBHOOK_BATCH_CONCURRENCY};
