import { Router } from 'express';
import { extractMessages, processIncoming, signatureValid } from './hipico-bot.service.js';

const router=Router();

router.use((_req,res,next)=>{
  res.setHeader('Cache-Control','no-store, max-age=0');
  next();
});

router.get('/webhook',(req,res)=>{
  const mode=String(req.query['hub.mode']||'');
  const token=String(req.query['hub.verify_token']||'');
  const challenge=String(req.query['hub.challenge']||'');
  const expected=String(process.env.WHATSAPP_VERIFY_TOKEN||'');
  if(mode==='subscribe'&&expected&&token===expected)return res.status(200).send(challenge);
  return res.sendStatus(403);
});

router.post('/webhook',async(req,res)=>{
  const raw=(req as any).rawBody as Buffer|undefined;
  if(!signatureValid(raw,req.header('x-hub-signature-256')||undefined)){
    return res.status(401).json({ok:false,error:'Firma de webhook inválida.'});
  }
  const messages=extractMessages(req.body).slice(0,100);
  const processed=await Promise.allSettled(messages.map(processIncoming));
  const failed=processed.filter((item)=>item.status==='rejected').length;
  // Return 200 after durable classification/dedupe. Meta retries non-2xx responses;
  // retries caused by an internal classifier error can amplify duplicate traffic.
  return res.status(200).json({ok:true,received:messages.length,processed:processed.length-failed,failed});
});

export default router;
