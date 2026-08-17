import { Router } from 'express';
import { z } from 'zod';
import { HipicoBotStore, operatorTokenValid, promotion, sendCloudText } from './hipico-bot.service.js';
import { classify } from './hipico-operational-classifier.js';
import { buildShadowProjection } from './hipico-shadow-projection.js';

const router=Router();
const idSchema=z.string().min(3).max(120).regex(/^[A-Za-z0-9_-]+$/);
const limit=(value:unknown)=>Math.min(100,Math.max(1,Number(value)||50));

router.use((req,res,next)=>{
  res.setHeader('Cache-Control','no-store, max-age=0');
  if(!operatorTokenValid(req.header('x-hipico-operator-token')||undefined)){
    return res.status(401).json({ok:false,error:'Token de operador Hipico invalido.'});
  }
  next();
});

router.get('/status',async(_req,res)=>res.json({ok:true,data:{
  promotion:promotion(),
  dbReady:await HipicoBotStore.dbReady(),
  cloudConfigured:Boolean(process.env.WHATSAPP_CLOUD_TOKEN&&process.env.WHATSAPP_PHONE_NUMBER_ID),
  webhookConfigured:Boolean(process.env.WHATSAPP_VERIFY_TOKEN&&process.env.WHATSAPP_APP_SECRET),
  targetSupport:['individual'],
  groupAutomation:'bridge-required',
  groupQaMode:'shadow-only'
}}));

router.get('/events',async(req,res)=>res.json({ok:true,data:await HipicoBotStore.events(limit(req.query.limit))}));
router.get('/outbox',async(req,res)=>res.json({ok:true,data:await HipicoBotStore.outbox(limit(req.query.limit))}));
router.get('/shadow-projection',async(req,res)=>{
  const events=await HipicoBotStore.events(limit(req.query.limit||100));
  return res.json({ok:true,data:buildShadowProjection(events as any[])});
});

router.post('/classify',(req,res)=>{
  const parsed=z.object({text:z.string().min(1).max(4000)}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({ok:false,error:'Texto invalido.'});
  return res.json({ok:true,data:classify(parsed.data.text)});
});

router.post('/test-message',async(req,res)=>{
  const parsed=z.object({to:z.string().regex(/^\+?\d{7,18}$/),message:z.string().min(1).max(4000)}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({ok:false,error:'Destino o mensaje invalido.'});
  try{
    const sent=await sendCloudText(parsed.data.to.replace(/^\+/,''),parsed.data.message);
    return res.json({ok:true,data:sent});
  }catch(error:any){
    return res.status(502).json({ok:false,error:error?.message||'No se pudo enviar el mensaje.'});
  }
});

router.post('/approve/:id',async(req,res)=>{
  const parsedId=idSchema.safeParse(req.params.id);
  if(!parsedId.success)return res.status(400).json({ok:false,error:'ID de salida invalido.'});
  const item=await HipicoBotStore.getOutbox(parsedId.data);
  if(!item)return res.status(404).json({ok:false,error:'Salida no encontrada.'});
  if(item.status==='sent')return res.json({ok:true,data:item});
  if(item.targetType!=='individual')return res.status(409).json({ok:false,error:'Este adaptador solo envia destinatarios individuales. El grupo requiere un bridge soportado.'});
  try{
    const sent=await sendCloudText(String(item.recipient).replace(/^\+/,''),String(item.message));
    await HipicoBotStore.markSent(item.id,sent.providerMessageId,'operator');
    return res.json({ok:true,data:{...item,status:'sent',providerMessageId:sent.providerMessageId}});
  }catch(error:any){
    await HipicoBotStore.markFailed(item.id,error?.message||String(error));
    return res.status(502).json({ok:false,error:error?.message||'No se pudo enviar la salida aprobada.'});
  }
});

export default router;
