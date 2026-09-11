import { Router } from 'express';
import { z } from 'zod';
import { HipicoBotStore, promotion, sendCloudText } from './hipico-bot.service.js';
import { classify } from './hipico-operational-classifier.js';
import { operatorTokenValid } from './hipico-operator-security.js';
import { cloudOutboundPolicy } from './hipico-outbound-policy.js';
import { createHorseRaceProvider, HorseRaceProviderError } from './hipico-race-provider.js';
import { buildShadowProjection } from './hipico-shadow-projection.js';

const router=Router();
const idSchema=z.string().min(3).max(120).regex(/^[A-Za-z0-9_-]+$/);
const limit=(value:unknown)=>Math.min(100,Math.max(1,Number(value)||50));
const raceProvider=createHorseRaceProvider();

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
  cloudOutboundPolicy:cloudOutboundPolicy(),
  webhookConfigured:Boolean(process.env.WHATSAPP_VERIFY_TOKEN&&process.env.WHATSAPP_APP_SECRET),
  targetSupport:['individual'],
  groupAutomation:'bridge-required',
  groupQaMode:'shadow-only',
  raceProvider:raceProvider.status()
}}));

router.get('/race-provider/status',(_req,res)=>res.json({ok:true,data:raceProvider.status()}));
router.get('/race-provider/stages/:stageId',async(req,res)=>{
  try{
    const result=await raceProvider.getStageSummary(String(req.params.stageId||''));
    return res.json({ok:true,data:{...result,enrichmentOnly:true,financialAuthority:false}});
  }catch(error:any){
    if(error instanceof HorseRaceProviderError){
      const status=error.code==='INVALID_STAGE_ID'?400:error.code==='NOT_CONFIGURED'?503:error.code==='UPSTREAM_TIMEOUT'?504:502;
      return res.status(status).json({ok:false,retryable:error.retryable,error:error.message,code:error.code,enrichmentOnly:true,financialAuthority:false});
    }
    return res.status(502).json({ok:false,retryable:true,error:'No se pudo consultar el proveedor hípico externo.',enrichmentOnly:true,financialAuthority:false});
  }
});

router.get('/events',async(req,res)=>res.json({ok:true,data:await HipicoBotStore.events(limit(req.query.limit))}));
router.get('/outbox',async(req,res)=>res.json({ok:true,data:await HipicoBotStore.outbox(limit(req.query.limit))}));
router.get('/shadow-projection',async(req,res)=>{
  const events=await HipicoBotStore.events(limit(req.query.limit||100)) as any[];
  const groupEvents=events.filter((event)=>String(event?.phoneNumberId||'').startsWith('group:'));
  return res.json({ok:true,data:buildShadowProjection(groupEvents)});
});

router.post('/classify',(req,res)=>{
  const parsed=z.object({text:z.string().min(1).max(4000)}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({ok:false,error:'Texto invalido.'});
  return res.json({ok:true,data:classify(parsed.data.text)});
});

function outboundError(res:any,error:any){
  const code=String(error?.code||'');
  if(code.startsWith('HIPICO_CLOUD_')||code==='HIPICO_DESTINATION_NOT_ALLOWLISTED'){
    return res.status(409).json({ok:false,error:'Envío cloud bloqueado por la política de producción.',code});
  }
  return res.status(502).json({ok:false,error:'No se pudo enviar el mensaje.'});
}

router.post('/test-message',async(req,res)=>{
  const parsed=z.object({to:z.string().regex(/^\+?\d{7,18}$/),message:z.string().trim().min(1).max(4000)}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({ok:false,error:'Destino o mensaje invalido.'});
  try{
    const sent=await sendCloudText(parsed.data.to.replace(/^\+/,''),parsed.data.message);
    return res.json({ok:true,data:sent});
  }catch(error:any){
    return outboundError(res,error);
  }
});

router.post('/approve/:id',async(req,res)=>{
  const parsedId=idSchema.safeParse(req.params.id);
  if(!parsedId.success)return res.status(400).json({ok:false,error:'ID de salida invalido.'});
  const item=await HipicoBotStore.getOutbox(parsedId.data);
  if(!item)return res.status(404).json({ok:false,error:'Salida no encontrada.'});
  if(item.status==='sent')return res.json({ok:true,data:item});
  if(item.status==='sending')return res.status(409).json({ok:false,error:'La salida ya está en envío o conciliación; no se reenviará automáticamente.'});
  if(item.status!=='pending_approval')return res.status(409).json({ok:false,error:'La salida no está pendiente de aprobación y no puede enviarse.'});
  if(item.targetType!=='individual')return res.status(409).json({ok:false,error:'Este adaptador solo envia destinatarios individuales. El grupo requiere un bridge soportado.'});
  const claimed=await HipicoBotStore.claimForSend(item.id,'pending_approval');
  if(!claimed)return res.status(409).json({ok:false,error:'La salida cambió de estado antes del envío; requiere conciliación.'});
  try{
    const sent=await sendCloudText(String(claimed.recipient).replace(/^\+/,''),String(claimed.message));
    await HipicoBotStore.markSent(claimed.id,sent.providerMessageId,'operator');
    return res.json({ok:true,data:{...claimed,status:'sent',providerMessageId:sent.providerMessageId}});
  }catch(error:any){
    await HipicoBotStore.markFailed(claimed.id,error?.message||String(error));
    return outboundError(res,error);
  }
});

export default router;
