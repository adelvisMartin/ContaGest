import { Router } from 'express';
import { z } from 'zod';
import { classify, HipicoBotStore, promotion } from './hipico-bot.service.js';
import { dispatchCanonicalOutbound } from './hipico-outbound-worker.js';
import {
  canonicalOutboxReadiness,
  configuredOutboxOwnerId,
  enqueueCanonicalOutbound,
  getCanonicalOutbox,
  listCanonicalOutbox,
  reconcileCanonicalOutbound
} from './hipico-outbox.store.js';
import { operatorActorRef, operatorTokenValid } from './hipico-operator-security.js';
import { cloudDestinationAllowed, cloudOutboundPolicy, cloudTransportConfiguration } from './hipico-outbound-policy.js';
import { hipicoProviderHttpStatus, hipicoProviderPublicError, hipicoProviderRegistry } from './hipico-provider-registry.js';
import { buildShadowProjection } from './hipico-shadow-projection.js';
import { webhookSecurityReady } from './hipico-webhook-security.js';

const router=Router();
const uuidSchema=z.string().uuid();
const requestIdSchema=z.string().trim().min(8).max(120).regex(/^[A-Za-z0-9._:-]+$/);
const e164Schema=z.string().regex(/^\+?[1-9]\d{6,14}$/);
const groupKeySchema=z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9._:-]+$/);
const limit=(value:unknown)=>Math.min(100,Math.max(1,Number(value)||50));
const raceProvider=hipicoProviderRegistry();

router.use((req,res,next)=>{
  res.setHeader('Cache-Control','no-store, max-age=0');
  if(!operatorTokenValid(req.header('x-hipico-operator-token')||undefined)){
    return res.status(401).json({ok:false,error:'Token de operador Hipico invalido.'});
  }
  next();
});

router.get('/status',async(_req,res)=>{
  const canonicalOutbox=await canonicalOutboxReadiness();
  return res.json({ok:true,data:{
    promotion:promotion(),
    dbReady:await HipicoBotStore.dbReady(),
    canonicalOutbox,
    cloudConfigured:cloudTransportConfiguration().configured,
    cloudOutboundPolicy:cloudOutboundPolicy(),
    webhookConfigured:webhookSecurityReady(),
    targetSupport:['individual'],
    groupAutomation:'bridge-required',
    groupQaMode:'shadow-only',
    raceProvider:raceProvider.status()
  }});
});

router.get('/race-provider/status',(_req,res)=>res.json({ok:true,data:raceProvider.status()}));
router.get('/race-provider/stages/:stageId',async(req,res)=>{
  try{
    const result=await raceProvider.getLiveStage(String(req.params.stageId||''));
    return res.json({ok:true,data:result});
  }catch(error:any){
    return res.status(hipicoProviderHttpStatus(error)).json({ok:false,...hipicoProviderPublicError(error)});
  }
});

router.get('/events',async(req,res)=>res.json({ok:true,data:await HipicoBotStore.events(limit(req.query.limit))}));
router.get('/outbox',async(req,res)=>{
  const ownerId=configuredOutboxOwnerId();
  if(!ownerId)return res.status(503).json({ok:false,error:'HIPICO_OWNER_NOT_CONFIGURED'});
  const status=String(req.query.status||'').trim();
  try{
    const data=await listCanonicalOutbox(ownerId,{limit:limit(req.query.limit),status:status||undefined});
    return res.json({ok:true,data,authority:'public.hipico_outbox'});
  }catch(error:any){
    console.error('[hipico-outbox] operator list failed',{error:error?.message||String(error)});
    return res.status(503).json({ok:false,retryable:true,error:'canonical_outbox_unavailable'});
  }
});
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

function outboundPreflight(to:string){
  const policy=cloudOutboundPolicy();
  if(!policy.enabled)return{ok:false as const,status:409,retryable:false,error:'outbound_disabled',reasons:policy.reasons};
  const transport=cloudTransportConfiguration();
  if(!transport.configured)return{ok:false as const,status:503,retryable:true,error:'sender_not_configured',reasons:transport.reasons};
  if(!cloudDestinationAllowed(to))return{ok:false as const,status:409,retryable:false,error:'destination_not_allowlisted',reasons:['DESTINATION_NOT_ALLOWLISTED']};
  return{ok:true as const};
}

function dispatchHttp(res:any,result:any){
  if(result.status==='accepted')return res.status(202).json({ok:true,retryable:false,data:{...result.row,status:'accepted'},providerMessageId:result.providerMessageId||null});
  if(result.status==='retry')return res.status(202).json({ok:false,retryable:true,error:'retry_scheduled',data:result.row});
  if(result.status==='reconciliation_required')return res.status(202).json({ok:false,retryable:false,error:'reconciliation_required',data:result.row});
  if(result.status==='failed')return res.status(502).json({ok:false,retryable:false,error:'send_failed_review_required',data:result.row});
  return res.status(409).json({ok:false,retryable:false,error:'outbox_not_claimed'});
}

router.post('/test-message',async(req,res)=>{
  const parsed=z.object({
    requestId:requestIdSchema,
    to:e164Schema,
    message:z.string().trim().min(1).max(4000),
    groupKey:groupKeySchema.default('operator-direct')
  }).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({ok:false,error:'requestId, destino, groupKey o mensaje invalido.'});
  const ownerId=configuredOutboxOwnerId();
  if(!ownerId)return res.status(503).json({ok:false,retryable:true,error:'HIPICO_OWNER_NOT_CONFIGURED'});
  const preflight=outboundPreflight(parsed.data.to);
  if(!preflight.ok)return res.status(preflight.status).json({ok:false,retryable:preflight.retryable,error:preflight.error,reasons:preflight.reasons});
  const readiness=await canonicalOutboxReadiness();
  if(!readiness.ready)return res.status(503).json({ok:false,retryable:true,error:'canonical_outbox_unavailable'});
  try{
    const queued=await enqueueCanonicalOutbound({
      ownerId,
      groupKey:parsed.data.groupKey,
      destination:parsed.data.to,
      idempotencyKey:`operator-test:${parsed.data.requestId}`,
      replyType:'operator_test_message',
      payload:{text:parsed.data.message,source:'operator-test',approvalRequired:false}
    });
    const item=queued.row;
    const status=String(item.status||'');
    if(['accepted','sent','delivered','read'].includes(status))return res.json({ok:true,duplicate:true,data:item});
    if(status==='reconciliation_required')return res.status(409).json({ok:false,retryable:false,error:'reconciliation_required',data:item});
    if(status==='failed'||status==='cancelled')return res.status(409).json({ok:false,retryable:false,error:'previous_attempt_terminal_use_new_request_id_after_review',data:item});
    const result=await dispatchCanonicalOutbound({ownerId,id:String(item.id)});
    return dispatchHttp(res,result);
  }catch(error:any){
    if(error?.code==='HIPICO_OUTBOUND_IDEMPOTENCY_MISMATCH')return res.status(409).json({ok:false,retryable:false,error:'request_id_reused_with_different_content'});
    console.error('[hipico-outbox] test message failed',{error:error?.message||String(error),code:error?.code||null});
    return res.status(503).json({ok:false,retryable:true,error:'canonical_outbox_send_unavailable'});
  }
});

router.post('/approve/:id',async(req,res)=>{
  const parsedId=uuidSchema.safeParse(req.params.id);
  if(!parsedId.success)return res.status(400).json({ok:false,error:'ID de salida invalido.'});
  const ownerId=configuredOutboxOwnerId();
  if(!ownerId)return res.status(503).json({ok:false,retryable:true,error:'HIPICO_OWNER_NOT_CONFIGURED'});
  const item=await getCanonicalOutbox(ownerId,parsedId.data).catch(()=>null);
  if(!item)return res.status(404).json({ok:false,error:'Salida no encontrada.'});
  const status=String(item.status||'');
  if(['accepted','sent','delivered','read'].includes(status))return res.json({ok:true,data:item});
  if(status==='sending'||status==='reconciliation_required')return res.status(409).json({ok:false,retryable:false,error:'La salida ya está en envío o conciliación; no se reenviará automáticamente.'});
  if(status==='failed'||status==='cancelled')return res.status(409).json({ok:false,retryable:false,error:'La salida está en estado terminal y requiere revisión.'});
  if(status!=='queued'&&status!=='retry')return res.status(409).json({ok:false,retryable:false,error:'La salida no está disponible para envío.',status});
  const preflight=outboundPreflight(String(item.destination||''));
  if(!preflight.ok)return res.status(preflight.status).json({ok:false,retryable:preflight.retryable,error:preflight.error,reasons:preflight.reasons});
  try{
    const result=await dispatchCanonicalOutbound({ownerId,id:item.id});
    return dispatchHttp(res,result);
  }catch(error:any){
    console.error('[hipico-outbox] approval dispatch failed',{id:item.id,error:error?.message||String(error),code:error?.code||null});
    return res.status(503).json({ok:false,retryable:false,error:'reconciliation_required'});
  }
});

router.post('/outbox/:id/reconcile',async(req,res)=>{
  const parsedId=uuidSchema.safeParse(req.params.id);
  const parsed=z.object({
    resolution:z.enum(['sent','failed']),
    reason:z.string().trim().min(5).max(500),
    providerMessageId:z.string().trim().min(1).max(320).nullable().optional()
  }).safeParse(req.body);
  if(!parsedId.success||!parsed.success)return res.status(400).json({ok:false,error:'Reconciliacion invalida.'});
  const ownerId=configuredOutboxOwnerId();
  const actorRef=operatorActorRef();
  if(!ownerId||!actorRef)return res.status(503).json({ok:false,error:'Identidad server-side de operador/propietario no configurada.'});
  if(parsed.data.resolution==='sent'&&!parsed.data.providerMessageId)return res.status(400).json({ok:false,error:'providerMessageId es obligatorio para confirmar envio.'});
  try{
    const row=await reconcileCanonicalOutbound({
      ownerId,id:parsedId.data,resolution:parsed.data.resolution,actorRef,reason:parsed.data.reason,providerMessageId:parsed.data.providerMessageId
    });
    if(!row)return res.status(409).json({ok:false,retryable:false,error:'La salida no está en reconciliation_required.'});
    return res.json({ok:true,data:row});
  }catch(error:any){
    console.error('[hipico-outbox] reconciliation failed',{id:parsedId.data,error:error?.message||String(error)});
    return res.status(503).json({ok:false,retryable:true,error:'No se pudo persistir la conciliacion.'});
  }
});

export default router;
export const __test__={outboundPreflight,dispatchHttp};
