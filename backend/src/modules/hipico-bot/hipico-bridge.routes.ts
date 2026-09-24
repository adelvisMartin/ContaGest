import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import type { IntentResult } from './hipico-operational-classifier.js';
import { decideConversation } from './hipico-conversation-engine.js';
import { bridgeParticipantRateLimiter, classifyUntrustedConversation, safePublicAbuseMetadata } from './hipico-conversation-appsec.js';
import { effectiveBridgeMediaKind, historySyncRateCheck, liveRateLimitClock, normalizeBridgeSender, validateBridgeGroupIdentity } from './hipico-bridge-input-policy.js';
import { operationalRaceContextKey } from './hipico-race-context-key.js';
import { applyOperatorCommand, planSafeResponse, updateHandoffAfterDecision } from './hipico-response-safety.js';
import { loadHandoff, persistResponsePlan, responseSafetyReadiness, saveHandoff } from './hipico-handoff.store.js';
import { canonicalShadowReadiness, persistCanonicalShadow } from './hipico-canonical-shadow.store.js';
import { bridgePersistenceReady, ensureGroupShadowOutbox, ensureSourceReplyOutbox, getSourceReplyOutbox, persistBridgeTransportEvent, recordSourceReplyDelivery, sourceReplyOutboxReady } from './hipico-bridge-transport.store.js';
import { bridgeTokenConfigured, bridgeTokenValid } from './hipico-bridge-security.js';
import { operatorActorRef, operatorTokenConfigured, operatorTokenValid } from './hipico-operator-security.js';
import { configuredOutboxOwnerId } from './hipico-outbox.store.js';
import { AutonomousReplyService, sourceAutoReplyEnabled } from '../hipico/autonomous-reply.service.js';

const router = Router();
const autonomousReplyService = new AutonomousReplyService();
const OFFICIAL_SOURCE_CHANNEL_KEY=String(process.env.HIPICO_OFFICIAL_SOURCE_CHANNEL_KEY||'club-hipico-triple-crown-official').trim();
const DEFAULT_LAB_CHANNEL_KEY=String(process.env.HIPICO_LAB_CHANNEL_KEY||'control-hipico-lab').trim();

const bridgeEventSchema=z.object({bridgeVersion:z.string().min(1).max(80),externalMessageId:z.string().min(1).max(320),groupId:z.string().min(3).max(220),groupName:z.string().trim().min(1).max(220),channelKey:z.string().trim().min(3).max(120).optional(),labChannelKey:z.string().trim().min(3).max(120).optional(),channelRole:z.enum(['source','lab']),shadowMode:z.boolean(),historySync:z.boolean().default(false),senderId:z.string().min(1).max(220),senderLabel:z.string().max(220).default(''),fromMe:z.boolean().default(false),timestamp:z.string().datetime({offset:true}),type:z.string().min(1).max(80).default('chat'),mediaKind:z.enum(['none','image','video','audio','document','unknown']).default('none'),mediaName:z.string().max(240).default(''),text:z.string().max(4000).default(''),hasMedia:z.boolean().default(false),quotedExternalMessageId:z.string().max(320).nullable().default(null),quoteDepth:z.number().int().min(0).max(20).default(0),rawMeta:z.string().max(500).default('')});
const handoffCommandSchema=z.object({groupKey:z.string().trim().min(3).max(120),participantId:z.string().trim().min(1).max(220),raceId:z.string().trim().max(120).nullable().default(null),command:z.enum(['pause','resume','escalate','resolve','reject']),operatorId:z.string().trim().min(1).max(220).optional(),reason:z.string().trim().max(500).optional(),ttlMs:z.number().int().min(0).max(24*60*60*1000).optional()});
const sourceReplyReceiptSchema=z.object({status:z.enum(['sent','ambiguous']),providerMessageId:z.string().trim().max(320).nullable().optional(),error:z.string().trim().max(500).nullable().optional()}).strict();

const shadowTag=(value:string)=>`[SHADOW:${crypto.createHash('sha256').update(value).digest('hex').slice(0,10)}]`;
const REPLAY_MISMATCH_CODES=new Set(['HIPICO_TRANSPORT_REPLAY_MISMATCH','HIPICO_CANONICAL_REPLAY_MISMATCH','HIPICO_SOURCE_REPLY_REPLAY_MISMATCH']);
function replayMismatchCode(error:unknown){const value=error as any;const code=String(value?.code||value?.message||'');return REPLAY_MISMATCH_CODES.has(code)?code:null;}
function buildLabSimulation(input:z.infer<typeof bridgeEventSchema>,result:IntentResult,canonical:any,responseText:string|null){
  if(input.channelRole!=='source'||input.historySync)return null;
  const entities=result.entities||{};const details:string[]=[];
  if(entities.role)details.push(`Rol: ${entities.role==='player'?'JUEGA':'CONSIGUE'}`);
  if(entities.play)details.push(`Jugada: ${entities.play}`);if(entities.horse)details.push(`Caballo: ${entities.horse}`);
  if(entities.amount!=null&&Number.isFinite(Number(entities.amount)))details.push(`Monto: ${Number(entities.amount)}`);
  if(entities.raceNumber!=null&&Number.isFinite(Number(entities.raceNumber)))details.push(`Carrera: ${Number(entities.raceNumber)}`);
  const effectiveMediaKind=effectiveBridgeMediaKind(input.hasMedia,input.mediaKind);
  const visible=input.text.trim()||`[${effectiveMediaKind||'media'} sin texto extraíble]`;
  const proposal=responseText||result.suggestion||'Sin respuesta automática propuesta.';
  return{mirrorTag:shadowTag(input.externalMessageId),sourceExternalMessageId:input.externalMessageId,sourceGroupKey:canonical?.groupKey||input.channelKey||null,labGroupKey:input.labChannelKey||null,text:[shadowTag(input.externalMessageId),'🧪 CONTROL HÍPICO · SIMULACIÓN SHADOW',`Fuente: ${input.groupName}`,`Remitente: ${input.senderLabel||'participante'}`,`Mensaje: ${visible.slice(0,1200)}`,`Lectura: ${result.intent} · riesgo ${result.risk} · confianza ${(Number(result.confidence||0)*100).toFixed(1)}%`,...details,`Propuesta del bot: ${proposal}`,'⚠️ SOLO LABORATORIO: no registró jugada, cierre, resultado, saldo ni liquidación real.'].join('\n').slice(0,3900)};
}

function validatePinnedChannel(input:z.infer<typeof bridgeEventSchema>){
  if(!input.shadowMode)return 'El Bridge solo admite ingestión shadow.';
  const identityError=validateBridgeGroupIdentity(input);
  if(identityError==='HIPICO_BRIDGE_GROUP_IDENTITY_NOT_CONFIGURED')return 'Identidad SOURCE/LAB no configurada para este Bridge.';
  if(identityError)return 'Grupo o canales SOURCE/LAB no autorizados para este Bridge.';
  return null;
}

router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store, max-age=0');next();});
router.get('/bridge/health',async(req,res)=>{
  if(!bridgeTokenValid(req.header('x-hipico-bridge-token')||undefined))return res.status(401).json({ok:false,ready:false,error:'Token del Bridge Hipico invalido.'});
  const autoReplyConfigured=sourceAutoReplyEnabled();
  const base={mode:autoReplyConfigured?'safe-auto':'shadow',sourceSendPossible:false,sourceChannelKey:OFFICIAL_SOURCE_CHANNEL_KEY,labChannelKey:DEFAULT_LAB_CHANNEL_KEY,buildCommit:String(process.env.VERCEL_GIT_COMMIT_SHA||process.env.GIT_SHA||'unknown')};
  try{
    const[transportReady,canonical,responseSafety,sourceReplyReady]=await Promise.all([
      bridgePersistenceReady(),
      canonicalShadowReadiness(),
      responseSafetyReadiness(),
      sourceReplyOutboxReady()
    ]);
    const reasons:string[]=[];
    if(!bridgeTokenConfigured())reasons.push('BRIDGE_TOKEN_NOT_CONFIGURED');
    if(!transportReady)reasons.push('TRANSPORT_SCHEMA_NOT_READY');
    if(!canonical.schemaReady)reasons.push('CANONICAL_SCHEMA_NOT_READY');
    if(canonical.labChannelCount!==1)reasons.push('LAB_CHANNEL_NOT_UNIQUE');
    if(!responseSafety.ready)reasons.push('RESPONSE_SAFETY_SCHEMA_NOT_READY');
    if(autoReplyConfigured&&!configuredOutboxOwnerId())reasons.push('AUTONOMOUS_OWNER_NOT_CONFIGURED');
    if(autoReplyConfigured&&!sourceReplyReady)reasons.push('SOURCE_REPLY_SCHEMA_NOT_READY');
    const ready=reasons.length===0;
    const sourceSendPossible=autoReplyConfigured&&ready;
    return res.status(ready?200:503).json({ok:ready,ready,...base,sourceSendPossible,reasons,persistence:{transportReady,canonicalSchemaReady:canonical.schemaReady,labChannelCount:canonical.labChannelCount,responseSafetyReady:responseSafety.ready,sourceReplyReady},operatorControlConfigured:operatorTokenConfigured(),autonomousReplies:{configured:autoReplyConfigured,humanFallback:'last-resort',domainEffectsAllowed:false,financialAuthority:false},conversationalAppSec:{enabled:true,maxMessagesPerMinute:30,maxIdenticalPerMinute:5,clock:'server',historyReplayThrottle:'separate-bounded'}});
  }catch(error:any){console.error('[hipico-bridge] readiness check failed',{error:error?.message||String(error)});return res.status(503).json({ok:false,ready:false,...base,retryable:true,reasons:['PERSISTENCE_CHECK_FAILED']});}
});
router.post('/bridge/handoff',async(req,res)=>{
  const operatorToken=req.header('x-hipico-operator-token')||undefined;
  if(!operatorTokenValid(operatorToken))return res.status(401).json({ok:false,error:'Control de operador no autenticado.'});
  const actorRef=operatorActorRef();
  if(!actorRef)return res.status(503).json({ok:false,retryable:true,error:'Identidad del operador no disponible.'});
  const parsed=handoffCommandSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({ok:false,retryable:false,error:'Comando de handoff inválido.'});
  try{
    const input=parsed.data;
    const current=await loadHandoff(input.groupKey,input.participantId,input.raceId);
    const next=applyOperatorCommand(current,input.command,{authenticatedOperator:true,operatorId:actorRef,reason:input.reason,ttlMs:input.ttlMs});
    const saved=await saveHandoff(next,{eventType:`operator_${input.command}`,actorId:actorRef,payload:{reason:input.reason||null,ttlMs:input.ttlMs||null}});
    return res.json({ok:true,handoff:saved});
  }catch(error:any){
    if(error?.code==='HIPICO_HANDOFF_CONFLICT')return res.status(409).json({ok:false,retryable:true,error:'handoff_conflict_reload'});
    console.error('[hipico-handoff] operator command failed',{error:error?.message||String(error)});
    return res.status(503).json({ok:false,retryable:true,error:'No se pudo persistir el takeover del operador.'});
  }
});
router.post('/bridge/replies/:id/receipt',async(req,res)=>{
  if(!bridgeTokenValid(req.header('x-hipico-bridge-token')||undefined))return res.status(401).json({ok:false,error:'Token del Bridge Hipico invalido.'});
  const parsed=sourceReplyReceiptSchema.safeParse(req.body);
  const commandId=String(req.params.id||'').trim();
  if(!parsed.success||!/^hsr_[0-9a-f-]{36}$/i.test(commandId))return res.status(400).json({ok:false,retryable:false,error:'Recibo de source reply inválido.'});
  try{
    const data=await recordSourceReplyDelivery({id:commandId,...parsed.data});
    return res.json({ok:true,data});
  }catch(error:any){
    if(error?.code==='HIPICO_SOURCE_REPLY_NOT_FOUND')return res.status(404).json({ok:false,retryable:false,error:error.code});
    if(error?.code==='HIPICO_SOURCE_REPLY_TERMINAL'||error?.code==='HIPICO_SOURCE_REPLY_STATUS_CONFLICT')return res.status(409).json({ok:false,retryable:false,error:error.code});
    console.error('[hipico-bridge] source reply receipt failed',{commandId,error:error?.message||String(error)});
    return res.status(503).json({ok:false,retryable:true,error:'SOURCE_REPLY_RECEIPT_FAILED'});
  }
});
router.post('/bridge/events',async(req,res)=>{
  if(!bridgeTokenValid(req.header('x-hipico-bridge-token')||undefined))return res.status(401).json({ok:false,error:'Token del Bridge Hipico invalido.'});
  const parsed=bridgeEventSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({ok:false,retryable:false,error:'Evento del Bridge invalido.'});const input=parsed.data;
  const channelError=validatePinnedChannel(input);if(channelError)return res.status(400).json({ok:false,retryable:false,error:channelError});
  const sender=normalizeBridgeSender(input.senderId);
  if(!sender)return res.status(400).json({ok:false,retryable:false,error:'Identidad de remitente inválida para el Bridge.'});
  const providerMessageId=`waweb:${input.externalMessageId}`;
  const effectiveMediaKind=effectiveBridgeMediaKind(input.hasMedia,input.mediaKind);
  const{assessment,result}=classifyUntrustedConversation({text:input.text,mediaKind:effectiveMediaKind,quoteDepth:input.quoteDepth,participantId:sender});
  const actorKey=`${input.channelKey||input.groupId}:${sender}`;
  const liveClock=liveRateLimitClock(input.historySync);
  const rate=liveClock===null?historySyncRateCheck(actorKey,assessment.digest):bridgeParticipantRateLimiter.check(actorKey,assessment.digest,liveClock);
  const raceContextKey=operationalRaceContextKey(result.entities);
  const abuse=safePublicAbuseMetadata(assessment,rate);
  const transportPayload={source:'whatsapp-web-bridge',targetType:'group_bridge',status:'shadow',bridgeVersion:input.bridgeVersion,historySync:input.historySync,groupId:input.groupId,groupName:input.groupName,channelKey:input.channelKey||null,labChannelKey:input.labChannelKey||null,channelRole:input.channelRole,bridgeShadowMode:input.shadowMode,senderRaw:input.senderId,senderLabel:input.senderLabel,fromMe:input.fromMe,sentAt:input.timestamp,rawMeta:input.rawMeta,hasMedia:effectiveMediaKind!=='none',mediaKind:effectiveMediaKind,mediaName:input.mediaName||null,quotedExternalMessageId:input.quotedExternalMessageId,operational:result.entities||null,raceContextKey,conversationalAppSec:abuse};
  try{
    const event=await persistBridgeTransportEvent({providerMessageId,phoneNumberId:`group:${input.groupId}`,sender,messageType:input.type,body:input.text,result,payload:transportPayload});
    const canonical=await persistCanonicalShadow({groupName:input.groupName,channelKey:input.channelKey,labChannelKey:input.labChannelKey,channelRole:input.channelRole,providerMessageId,sender,senderLabel:input.senderLabel,fromMe:input.fromMe,sentAt:input.timestamp,messageType:input.type,mediaKind:effectiveMediaKind,mediaName:input.mediaName,historySync:input.historySync,body:input.text,quotedExternalMessageId:input.quotedExternalMessageId,bridgeVersion:input.bridgeVersion,rawMeta:input.rawMeta,transportEventId:event.id,result});
    const outbox=await ensureGroupShadowOutbox({eventId:event.id,recipient:input.groupId,result});const safetyReady=await responseSafetyReadiness();const groupKey=String(canonical?.groupKey||input.channelKey||input.groupId);let handoffState=safetyReady.ready&&!input.historySync?await loadHandoff(groupKey,sender,raceContextKey):null;
    const conversationDecision=decideConversation({sourceMessageId:input.externalMessageId,participantId:sender,participantLabel:input.senderLabel,text:assessment.sanitizedText,timestamp:input.timestamp,raceId:raceContextKey,quotedSourceMessageId:input.quotedExternalMessageId,mediaKind:effectiveMediaKind},{seenSourceMessageIds:event.inserted?[]:[input.externalMessageId],humanOwnedParticipantIds:handoffState?.ownership==='human'?[sender]:[]},()=>result);
    if(handoffState&&!input.historySync){
      const next=updateHandoffAfterDecision(handoffState,conversationDecision,new Date());
      if(JSON.stringify(next)!==JSON.stringify(handoffState)){
        handoffState=await saveHandoff(next,{eventType:'decision_transition',sourceMessageId:input.externalMessageId,correlationId:conversationDecision.correlationId,payload:{decision:conversationDecision.decision,reason:conversationDecision.decisionReason,appsecFlags:assessment.flags,raceContextKey}});
      }
    }
    let responsePlan=planSafeResponse(conversationDecision,{handoffState,systemHealthy:safetyReady.ready,at:new Date()});
    if(input.historySync)responsePlan={...responsePlan,intent:'NONE',text:null,canSend:false,confirmationVerified:false,evidence:null,handoffRequired:false,reason:'HISTORY_SYNC_NO_RESPONSE'};
    else if(!rate.allowed)responsePlan={...responsePlan,intent:'NONE',text:null,canSend:false,confirmationVerified:false,evidence:null,handoffRequired:false,reason:rate.reason||'RATE_LIMIT'};
    const responseReceipt=safetyReady.ready&&!input.historySync&&event.inserted?await persistResponsePlan(responsePlan):null;
    const autoReplyConfigured=sourceAutoReplyEnabled();
    const ownerId=configuredOutboxOwnerId();
    let sourceReplyCommand:any=null;
    if(input.channelRole==='source'&&autoReplyConfigured){
      const persistedReply=!event.inserted?await getSourceReplyOutbox(event.id):null;
      if(persistedReply){
        sourceReplyCommand={
          version:'hipico-autonomous-reply-v1',
          commandId:persistedReply.id,
          action:persistedReply.status==='planned'?'SEND':'NONE',
          canSend:persistedReply.status==='planned',
          text:persistedReply.status==='planned'?persistedReply.message:null,
          reason:`PERSISTED_SOURCE_REPLY_${String(persistedReply.status||'unknown').toUpperCase()}`,
          responseIdempotencyKey:persistedReply.id,
          sourceMessageId:input.externalMessageId,
          targetGroupId:persistedReply.recipient,
          handoffRequired:persistedReply.status==='ambiguous',
          candidateIntent:persistedReply.intent,
          riskPolicy:null,
          provider:{observation:null,readiness:null,influence:'NONE'},
          authority:{deterministicOnly:true,domainEffectsAllowed:false,financialAuthority:false,stateMutationAllowed:false}
        };
      }else if(event.inserted&&ownerId){
        const decision=await autonomousReplyService.decide({
          ownerId,
          groupKey,
          groupId:input.groupId,
          text:assessment.sanitizedText,
          sourceMessageId:input.externalMessageId,
          fromMe:input.fromMe,
          historySync:input.historySync,
          duplicate:false,
          mediaKind:effectiveMediaKind,
          rateAllowed:rate.allowed,
          systemHealthy:safetyReady.ready,
          responsePlan
        });
        if(decision.canSend&&decision.text){
          const stored=await ensureSourceReplyOutbox({
            eventId:event.id,
            recipient:input.groupId,
            message:decision.text,
            intent:decision.candidateIntent||result.intent,
            risk:decision.riskPolicy?.disposition==='AUTO'?'safe':result.risk
          });
          sourceReplyCommand={...decision,commandId:stored.row.id,targetGroupId:stored.row.recipient,canSend:stored.row.status==='planned',text:stored.row.status==='planned'?stored.row.message:null};
        }else sourceReplyCommand=decision;
      }else if(event.inserted&&!ownerId){
        sourceReplyCommand={
          version:'hipico-autonomous-reply-v1',action:'HOLD',canSend:false,text:null,
          reason:'AUTONOMOUS_OWNER_NOT_CONFIGURED',responseIdempotencyKey:responsePlan.responseIdempotencyKey,
          sourceMessageId:input.externalMessageId,handoffRequired:false,candidateIntent:null,riskPolicy:null,
          provider:{observation:null,readiness:null,influence:'NONE'},
          authority:{deterministicOnly:true,domainEffectsAllowed:false,financialAuthority:false,stateMutationAllowed:false}
        };
      }
    }
    return res.status(event.inserted?202:200).json({ok:true,duplicate:!event.inserted,mode:autoReplyConfigured?'safe-auto':'shadow',historySync:input.historySync,classification:result.intent,actions:[] as never[],conversationalAppSec:abuse,conversationDecision,responsePlan,responseReceipt,sourceReply:sourceReplyCommand,labSimulation:event.inserted?buildLabSimulation(input,result,canonical,responsePlan.text):null,data:{eventId:event.id,outboxId:outbox.id,canonical,raceContextKey,intent:result.intent,risk:result.risk,entities:result.entities||null,autoEligible:false}});
  }catch(error:any){
    const mismatch=replayMismatchCode(error);
    if(mismatch){console.warn('[hipico-bridge] replay identity mismatch',{messageRef:shadowTag(input.externalMessageId),channelRole:input.channelRole,code:mismatch});return res.status(409).json({ok:false,retryable:false,error:'REPLAY_IDENTITY_MISMATCH'});}
    if(error?.code==='HIPICO_HANDOFF_CONFLICT')return res.status(503).json({ok:false,retryable:true,error:'HANDOFF_CONFLICT_RETRY'});
    console.error('[hipico-bridge] persistent shadow ingestion failed',{messageRef:shadowTag(input.externalMessageId),channelRole:input.channelRole,historySync:input.historySync,error:error?.message||String(error)});
    return res.status(503).json({ok:false,retryable:true,error:'Persistencia shadow de Control Hipico no disponible. El Bridge debe reintentar.'});
  }
});
export default router;

export const __test__={replayMismatchCode,validatePinnedChannel};