import { Router } from 'express';
import { z } from 'zod';
import { HipicoBotStore, promotion, sendCloudText } from './hipico-bot.service.js';
import { classify } from './hipico-operational-classifier.js';
import { operatorTokenValid } from './hipico-operator-security.js';
import { cloudDestinationAllowed, cloudOutboundPolicy, cloudTransportConfiguration } from './hipico-outbound-policy.js';
import { createHorseRaceProvider, HorseRaceProviderError } from './hipico-race-provider.js';
import { buildShadowProjection } from './hipico-shadow-projection.js';
import { metaWebhookRuntimeConfigured } from './hipico-meta-security.js';

const router=Router();
const idSchema=z.string().min(3).max(120).regex(/^[A-Za-z0-9_-]+$/);
const requestIdSchema=z.string().trim().min(8).max(120).regex(/^[A-Za-z0-9._:-]+$/);
const e164Schema=z.string().regex(/^\+?[1-9]\d{6,14}$/);
const limit=(value:unknown)=>Math.min(100,Math.max(1,Number(value)||50));
const raceProvider=createHorseRaceProvider();

router.use((req,res,next)=>{
  res.setHeader('Cache-Control','no-store, max-age=0');
  if(!operatorTokenValid(req.header('x-hipico-operator-token')||undefined)){
    return res.status(401).json({ok:false,error:'Token de operador Hipico invalido.'});
  }
  next();
});

router.get('/status',async(_req,res)=>{
  const transport=cloudTransportConfiguration();
  return res.json({ok:true,data:{
    promotion:promotion(),
    dbReady:await HipicoBotStore.dbReady(),
    cloudConfigured:transport.configured,
    cloudTransportReasons:transport.reasons,
    cloudOutboundPolicy:cloudOutboundPolicy(),
    webhookConfigured:metaWebhookRuntimeConfigured(),
    targetSupport:['individual'],
    groupAutomation:'bridge-required',
    groupQaMode:'shadow-only',
    raceProvider:raceProvider.status()
  }});
});

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
  if(code==='HIPICO_CLOUD_DELIVERY_AMBIGUOUS'){
    return res.status(202).json({ok:false,retryable:false,error:'reconciliation_required',code});
  }
  if(code==='HIPICO_CLOUD_SEND_DISABLED'||code==='HIPICO_DESTINATION_NOT_ALLOWLISTED'){
    return res.status(409).json({ok:false,retryable:false,error:'Envío cloud bloqueado por la política de producción.',code});
  }
  if(code==='HIPICO_CLOUD_TRANSPORT_NOT_CONFIGURED'){
    return res.status(503).json({ok:false,retryable:true,error:'cloud_transport_not_configured',code});
  }
  if(code==='HIPICO_CLOUD_MESSAGE_INVALID'){
    return res.status(400).json({ok:false,retryable:false,error:'Mensaje cloud inválido.',code});
  }
  return res.status(502).json({ok:false,retryable:true,error:'No se pudo enviar el mensaje.',code:code||undefined});
}

function outboundPreflight(to:string){
  const policy=cloudOutboundPolicy();
  if(!policy.enabled)return{ok:false as const,status:409,error:'outbound_disabled',reasons:policy.reasons};
  if(!cloudDestinationAllowed(to))return{ok:false as const,status:409,error:'destination_not_allowlisted',reasons:['DESTINATION_NOT_ALLOWLISTED']};
  const transport=cloudTransportConfiguration();
  if(!transport.configured)return{ok:false as const,status:503,error:'cloud_transport_not_configured',reasons:transport.reasons};
  return{ok:true as const};
}

async function persistSendFailure(id:string,error:any){
  const ambiguous=error?.code==='HIPICO_CLOUD_DELIVERY_AMBIGUOUS';
  const persisted=ambiguous
    ?await HipicoBotStore.markReconciliationRequired(id,error?.message||String(error))
    :await HipicoBotStore.markFailed(id,error?.message||String(error));
  return{ambiguous,persisted};
}

router.post('/test-message',async(req,res)=>{
  const parsed=z.object({requestId:requestIdSchema,to:e164Schema,message:z.string().trim().min(1).max(4000)}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({ok:false,error:'requestId, destino o mensaje invalido.'});
  const preflight=outboundPreflight(parsed.data.to);
  if(!preflight.ok)return res.status(preflight.status).json({ok:false,retryable:preflight.status>=500,error:preflight.error,reasons:preflight.reasons});
  if(!await HipicoBotStore.dbReady(true))return res.status(503).json({ok:false,retryable:true,error:'outbox_persistence_unavailable'});
  try{
    const queued=await HipicoBotStore.queueIdempotent({
      eventId:null,
      recipient:parsed.data.to.replace(/^\+/,''),
      targetType:'individual',
      message:parsed.data.message,
      intent:'operator_test_message',
      risk:'review',
      status:'pending_approval'
    },'operator-test',parsed.data.requestId);
    const item=queued.row;
    if(item.status==='sent')return res.json({ok:true,duplicate:true,data:{id:item.id,status:'sent',providerMessageId:item.providerMessageId||null}});
    if(item.status==='sending'||item.status==='reconciliation_required')return res.status(409).json({ok:false,retryable:false,error:'reconciliation_required',id:item.id});
    if(item.status==='failed')return res.status(409).json({ok:false,error:'previous_attempt_failed_use_new_request_id_after_review',id:item.id});
    if(item.status!=='pending_approval')return res.status(409).json({ok:false,error:'outbox_state_not_sendable',id:item.id,status:item.status});
    const claimed=await HipicoBotStore.claimForSend(item.id,'pending_approval');
    if(!claimed)return res.status(409).json({ok:false,error:'outbox_claim_lost',id:item.id});
    try{
      const sent=await sendCloudText(String(claimed.recipient),String(claimed.message));
      const persisted=await HipicoBotStore.markSent(claimed.id,sent.providerMessageId,'operator-test');
      if(!persisted)return res.status(202).json({ok:false,retryable:false,error:'reconciliation_required',id:claimed.id,providerMessageId:sent.providerMessageId});
      return res.json({ok:true,duplicate:false,data:{id:claimed.id,status:'sent',providerMessageId:sent.providerMessageId}});
    }catch(error:any){
      const state=await persistSendFailure(claimed.id,error);
      if(!state.persisted)return res.status(503).json({ok:false,retryable:false,error:'reconciliation_required',id:claimed.id});
      if(state.ambiguous)return res.status(202).json({ok:false,retryable:false,error:'reconciliation_required',id:claimed.id,code:error.code});
      return outboundError(res,error);
    }
  }catch(error:any){
    if(error?.code==='HIPICO_OUTBOX_IDEMPOTENCY_MISMATCH')return res.status(409).json({ok:false,retryable:false,error:'request_id_reused_with_different_content'});
    if(String(error?.code||'').startsWith('HIPICO_OUTBOX_'))return res.status(503).json({ok:false,retryable:true,error:'outbox_persistence_unavailable'});
    return res.status(503).json({ok:false,retryable:true,error:'test_message_unavailable'});
  }
});

router.post('/approve/:id',async(req,res)=>{
  const parsedId=idSchema.safeParse(req.params.id);
  if(!parsedId.success)return res.status(400).json({ok:false,error:'ID de salida invalido.'});
  if(!await HipicoBotStore.dbReady(true))return res.status(503).json({ok:false,retryable:true,error:'outbox_persistence_unavailable'});
  const item=await HipicoBotStore.getOutbox(parsedId.data);
  if(!item)return res.status(404).json({ok:false,error:'Salida no encontrada.'});
  if(item.status==='sent')return res.json({ok:true,data:item});
  if(item.status==='sending'||item.status==='reconciliation_required')return res.status(409).json({ok:false,retryable:false,error:'La salida ya está en envío o conciliación; no se reenviará automáticamente.'});
  if(item.status!=='pending_approval')return res.status(409).json({ok:false,error:'La salida no está pendiente de aprobación y no puede enviarse.'});
  if(item.targetType!=='individual')return res.status(409).json({ok:false,error:'Este adaptador solo envia destinatarios individuales. El grupo requiere un bridge soportado.'});
  const preflight=outboundPreflight(String(item.recipient||''));
  if(!preflight.ok)return res.status(preflight.status).json({ok:false,retryable:preflight.status>=500,error:preflight.error,reasons:preflight.reasons});
  const claimed=await HipicoBotStore.claimForSend(item.id,'pending_approval');
  if(!claimed)return res.status(409).json({ok:false,error:'La salida cambió de estado antes del envío; requiere conciliación.'});
  try{
    const sent=await sendCloudText(String(claimed.recipient).replace(/^\+/,''),String(claimed.message));
    const persisted=await HipicoBotStore.markSent(claimed.id,sent.providerMessageId,'operator');
    if(!persisted)return res.status(202).json({ok:false,retryable:false,error:'reconciliation_required',id:claimed.id,providerMessageId:sent.providerMessageId});
    return res.json({ok:true,data:{...claimed,status:'sent',providerMessageId:sent.providerMessageId}});
  }catch(error:any){
    const state=await persistSendFailure(claimed.id,error);
    if(!state.persisted)return res.status(503).json({ok:false,retryable:false,error:'reconciliation_required',id:claimed.id});
    if(state.ambiguous)return res.status(202).json({ok:false,retryable:false,error:'reconciliation_required',id:claimed.id,code:error.code});
    return outboundError(res,error);
  }
});

export default router;
