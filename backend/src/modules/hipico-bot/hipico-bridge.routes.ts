import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import type { IntentResult } from './hipico-operational-classifier.js';
import { decideConversation } from './hipico-conversation-engine.js';
import { bridgeParticipantRateLimiter, classifyUntrustedConversation, safePublicAbuseMetadata } from './hipico-conversation-appsec.js';
import { historySyncRateCheck, liveRateLimitClock, normalizeBridgeSender } from './hipico-bridge-input-policy.js';
import { operationalRaceContextKey } from './hipico-race-context-key.js';
import { applyOperatorCommand, planSafeResponse, updateHandoffAfterDecision } from './hipico-response-safety.js';
import { loadHandoff, persistResponsePlan, responseSafetyReadiness, saveHandoff } from './hipico-handoff.store.js';
import { canonicalShadowReadiness, persistCanonicalShadow } from './hipico-canonical-shadow.store.js';
import { bridgePersistenceReady, ensureGroupShadowOutbox, persistBridgeTransportEvent } from './hipico-bridge-transport.store.js';
import { bridgeTokenConfigured, bridgeTokenValid } from './hipico-bridge-security.js';
import { operatorTokenConfigured, operatorTokenValid } from './hipico-operator-security.js';

const router = Router();
const OFFICIAL_SOURCE_CHANNEL_KEY=String(process.env.HIPICO_OFFICIAL_SOURCE_CHANNEL_KEY||'club-hipico-triple-crown-official').trim();
const DEFAULT_LAB_CHANNEL_KEY=String(process.env.HIPICO_LAB_CHANNEL_KEY||'control-hipico-lab').trim();

const bridgeEventSchema=z.object({bridgeVersion:z.string().min(1).max(80),externalMessageId:z.string().min(1).max(320),groupId:z.string().min(3).max(220),groupName:z.string().trim().min(1).max(220),channelKey:z.string().trim().min(3).max(120).optional(),labChannelKey:z.string().trim().min(3).max(120).optional(),channelRole:z.enum(['source','lab']),shadowMode:z.boolean(),historySync:z.boolean().default(false),senderId:z.string().min(1).max(220),senderLabel:z.string().max(220).default(''),fromMe:z.boolean().default(false),timestamp:z.string().datetime({offset:true}),type:z.string().min(1).max(80).default('chat'),mediaKind:z.enum(['none','image','video','audio','document','unknown']).default('none'),mediaName:z.string().max(240).default(''),text:z.string().max(4000).default(''),hasMedia:z.boolean().default(false),quotedExternalMessageId:z.string().max(320).nullable().default(null),quoteDepth:z.number().int().min(0).max(20).default(0),rawMeta:z.string().max(500).default('')});
const handoffCommandSchema=z.object({groupKey:z.string().trim().min(3).max(120),participantId:z.string().trim().min(1).max(220),raceId:z.string().trim().max(120).nullable().default(null),command:z.enum(['pause','resume','escalate','resolve','reject']),operatorId:z.string().trim().min(1).max(220),reason:z.string().trim().max(500).optional(),ttlMs:z.number().int().min(0).max(24*60*60*1000).optional()});

const shadowTag=(value:string)=>`[SHADOW:${crypto.createHash('sha256').update(value).digest('hex').slice(0,10)}]`;
function buildLabSimulation(input:z.infer<typeof bridgeEventSchema>,result:IntentResult,canonical:any,responseText:string|null){
  if(input.channelRole!=='source'||input.historySync)return null;
  const entities=result.entities||{};const details:string[]=[];
  if(entities.role)details.push(`Rol: ${entities.role==='player'?'JUEGA':'CONSIGUE'}`);
  if(entities.play)details.push(`Jugada: ${entities.play}`);if(entities.horse)details.push(`Caballo: ${entities.horse}`);
  if(entities.amount!=null&&Number.isFinite(Number(entities.amount)))details.push(`Monto: ${Number(entities.amount)}`);
  if(entities.raceNumber!=null&&Number.isFinite(Number(entities.raceNumber)))details.push(`Carrera: ${Number(entities.raceNumber)}`);
  const visible=input.text.trim()||`[${input.mediaKind||'media'} sin texto extraíble]`;
  const proposal=responseText||result.suggestion||'Sin respuesta automática propuesta.';
  return{mirrorTag:shadowTag(input.externalMessageId),sourceExternalMessageId:input.externalMessageId,sourceGroupKey:canonical?.groupKey||input.channelKey||null,labGroupKey:input.labChannelKey||null,text:[shadowTag(input.externalMessageId),'🧪 CONTROL HÍPICO · SIMULACIÓN SHADOW',`Fuente: ${input.groupName}`,`Remitente: ${input.senderLabel||'participante'}`,`Mensaje: ${visible.slice(0,1200)}`,`Lectura: ${result.intent} · riesgo ${result.risk} · confianza ${(Number(result.confidence||0)*100).toFixed(1)}%`,...details,`Propuesta del bot: ${proposal}`,'⚠️ SOLO LABORATORIO: no registró jugada, cierre, resultado, saldo ni liquidación real.'].join('\n').slice(0,3900)};
}

router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store, max-age=0');next();});
router.get('/bridge/health',async(req,res)=>{
  if(!bridgeTokenValid(req.header('x-hipico-bridge-token')||undefined))return res.status(401).json({ok:false,ready:false,error:'Token del Bridge Hipico invalido.'});
  const base={mode:'shadow',sourceSendPossible:false,sourceChannelKey:OFFICIAL_SOURCE_CHANNEL_KEY,labChannelKey:DEFAULT_LAB_CHANNEL_KEY,buildCommit:String(process.env.VERCEL_GIT_COMMIT_SHA||process.env.GIT_SHA||'unknown')};
  try{const[transportReady,canonical,responseSafety]=await Promise.all([bridgePersistenceReady(),canonicalShadowReadiness(),responseSafetyReadiness()]);const reasons:string[]=[];if(!bridgeTokenConfigured())reasons.push('BRIDGE_TOKEN_NOT_CONFIGURED');if(!transportReady)reasons.push('TRANSPORT_SCHEMA_NOT_READY');if(!canonical.schemaReady)reasons.push('CANONICAL_SCHEMA_NOT_READY');if(canonical.labChannelCount!==1)reasons.push('LAB_CHANNEL_NOT_UNIQUE');const ready=reasons.length===0;return res.status(ready?200:503).json({ok:ready,ready,...base,reasons,persistence:{transportReady,canonicalSchemaReady:canonical.schemaReady,labChannelCount:canonical.labChannelCount,responseSafetyReady:responseSafety.ready},operatorControlConfigured:operatorTokenConfigured(),conversationalAppSec:{enabled:true,maxMessagesPerMinute:30,maxIdenticalPerMinute:5,clock:'server',historyReplayThrottle:'separate'}});}catch(error:any){console.error('[hipico-bridge] readiness check failed',{error:error?.message||String(error)});return res.status(503).json({ok:false,ready:false,...base,retryable:true,reasons:['PERSISTENCE_CHECK_FAILED']});}
});
router.post('/bridge/handoff',async(req,res)=>{
  if(!operatorTokenValid(req.header('x-hipico-operator-token')||undefined))return res.status(401).json({ok:false,error:'Control de operador no autenticado.'});
  const parsed=handoffCommandSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({ok:false,error:'Comando de handoff inválido.'});
  try{const input=parsed.data;const current=await loadHandoff(input.groupKey,input.participantId,input.raceId);const next=applyOperatorCommand(current,input.command,{authenticatedOperator:true,operatorId:input.operatorId,reason:input.reason,ttlMs:input.ttlMs});await saveHandoff(next,{eventType:`operator_${input.command}`,actorId:input.operatorId,payload:{reason:input.reason||null,ttlMs:input.ttlMs||null}});return res.json({ok:true,handoff:next});}catch(error:any){console.error('[hipico-handoff] operator command failed',{error:error?.message||String(error)});return res.status(503).json({ok:false,retryable:true,error:'No se pudo persistir el takeover del operador.'});}
});
router.post('/bridge/events',async(req,res)=>{
  if(!bridgeTokenValid(req.header('x-hipico-bridge-token')||undefined))return res.status(401).json({ok:false,error:'Token del Bridge Hipico invalido.'});
  const parsed=bridgeEventSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({ok:false,error:'Evento del Bridge invalido.'});const input=parsed.data;
  if(input.channelRole==='source'){if(input.channelKey!==OFFICIAL_SOURCE_CHANNEL_KEY||input.labChannelKey!==DEFAULT_LAB_CHANNEL_KEY)return res.status(400).json({ok:false,error:'Canales source/lab no autorizados para este Bridge.'});if(!input.shadowMode)return res.status(400).json({ok:false,error:'El grupo oficial solo admite ingestión shadow.'});}
  const sender=normalizeBridgeSender(input.senderId);
  if(!sender)return res.status(400).json({ok:false,error:'Identidad de remitente inválida para el Bridge.'});
  const providerMessageId=`waweb:${input.externalMessageId}`;
  const{assessment,result}=classifyUntrustedConversation({text:input.text,mediaKind:input.mediaKind,quoteDepth:input.quoteDepth,participantId:sender});
  const liveClock=liveRateLimitClock(input.historySync);
  const rate=liveClock===null?historySyncRateCheck():bridgeParticipantRateLimiter.check(`${input.channelKey||input.groupId}:${sender}`,assessment.digest,liveClock);
  const raceContextKey=operationalRaceContextKey(result.entities);
  const abuse=safePublicAbuseMetadata(assessment,rate);
  const transportPayload={source:'whatsapp-web-bridge',targetType:'group_bridge',status:'shadow',bridgeVersion:input.bridgeVersion,historySync:input.historySync,groupId:input.groupId,groupName:input.groupName,channelKey:input.channelKey||null,labChannelKey:input.labChannelKey||null,channelRole:input.channelRole,bridgeShadowMode:input.shadowMode,senderRaw:input.senderId,senderLabel:input.senderLabel,fromMe:input.fromMe,sentAt:input.timestamp,rawMeta:input.rawMeta,hasMedia:input.hasMedia,mediaKind:input.mediaKind,mediaName:input.mediaName||null,quotedExternalMessageId:input.quotedExternalMessageId,operational:result.entities||null,raceContextKey,conversationalAppSec:abuse};
  try{
    const event=await persistBridgeTransportEvent({providerMessageId,phoneNumberId:`group:${input.groupId}`,sender,messageType:input.type,body:input.text,result,payload:transportPayload});
    const canonical=await persistCanonicalShadow({groupName:input.groupName,channelKey:input.channelKey,labChannelKey:input.labChannelKey,channelRole:input.channelRole,providerMessageId,sender,senderLabel:input.senderLabel,fromMe:input.fromMe,sentAt:input.timestamp,messageType:input.type,mediaKind:input.mediaKind,mediaName:input.mediaName,historySync:input.historySync,body:input.text,quotedExternalMessageId:input.quotedExternalMessageId,bridgeVersion:input.bridgeVersion,rawMeta:input.rawMeta,transportEventId:event.id,result});
    const outbox=await ensureGroupShadowOutbox({eventId:event.id,recipient:input.groupId,result});const safetyReady=await responseSafetyReadiness();const groupKey=String(canonical?.groupKey||input.channelKey||input.groupId);let handoffState=safetyReady.ready&&!input.historySync?await loadHandoff(groupKey,sender,raceContextKey):null;
    const conversationDecision=decideConversation({sourceMessageId:input.externalMessageId,participantId:sender,participantLabel:input.senderLabel,text:assessment.sanitizedText,timestamp:input.timestamp,raceId:raceContextKey,quotedSourceMessageId:input.quotedExternalMessageId,mediaKind:input.mediaKind},{seenSourceMessageIds:event.inserted?[]:[input.externalMessageId],humanOwnedParticipantIds:handoffState?.ownership==='human'?[sender]:[]},()=>result);
    if(handoffState&&!input.historySync){const next=updateHandoffAfterDecision(handoffState,conversationDecision,input.timestamp);if(JSON.stringify(next)!==JSON.stringify(handoffState)){await saveHandoff(next,{eventType:'decision_transition',sourceMessageId:input.externalMessageId,correlationId:conversationDecision.correlationId,payload:{decision:conversationDecision.decision,reason:conversationDecision.decisionReason,appsecFlags:assessment.flags,raceContextKey}});handoffState=next;}}
    let responsePlan=planSafeResponse(conversationDecision,{handoffState,systemHealthy:safetyReady.ready});
    if(input.historySync)responsePlan={...responsePlan,intent:'NONE',text:null,canSend:false,confirmationVerified:false,evidence:null,handoffRequired:false,reason:'HISTORY_SYNC_NO_RESPONSE'};
    else if(!rate.allowed)responsePlan={...responsePlan,intent:'NONE',text:null,canSend:false,confirmationVerified:false,evidence:null,handoffRequired:false,reason:rate.reason||'RATE_LIMIT'};
    const responseReceipt=safetyReady.ready&&!input.historySync?await persistResponsePlan(responsePlan):null;
    return res.status(event.inserted?202:200).json({ok:true,duplicate:!event.inserted,mode:'shadow',historySync:input.historySync,classification:result.intent,actions:[] as never[],conversationalAppSec:abuse,conversationDecision,responsePlan,responseReceipt,labSimulation:buildLabSimulation(input,result,canonical,responsePlan.text),data:{eventId:event.id,outboxId:outbox.id,canonical,raceContextKey,intent:result.intent,risk:result.risk,entities:result.entities||null,autoEligible:false}});
  }catch(error:any){console.error('[hipico-bridge] persistent shadow ingestion failed',{providerMessageId,groupName:input.groupName,channelKey:input.channelKey||null,channelRole:input.channelRole,historySync:input.historySync,error:error?.message||String(error)});return res.status(503).json({ok:false,retryable:true,error:'Persistencia shadow de Control Hipico no disponible. El Bridge debe reintentar.'});}
});
export default router;
