import crypto from 'node:crypto';
import { prisma } from '../../database/prisma.js';
import { classify as classifyOperational } from './hipico-operational-classifier.js';
import type { IntentResult as OperationalIntentResult } from './hipico-operational-classifier.js';
import { assertCloudOutboundAllowed, assertCloudTransportConfigured, cloudHttpDeliveryAmbiguous, cloudOutboundPolicy, cloudTransportConfiguration } from './hipico-outbound-policy.js';
import { operatorTokenValid as canonicalOperatorTokenValid } from './hipico-operator-security.js';
import { replayMismatchError, sameWebhookReplay } from './hipico-webhook-replay.js';
import { webhookSignatureValid } from './hipico-webhook-security.js';

export type BotPromotion='shadow'|'approved'|'automatic';
export type IntentResult=OperationalIntentResult;

const SAFE_AUTOMATIC=new Set(['greeting','help','status_non_monetary']);
const NON_TEXT_MEDIA=new Set(['audio','document','image','sticker','video']);
const E164_DIGITS=/^[1-9]\d{6,14}$/;
const MAX_INBOUND_TEXT=4000;
const MAX_MESSAGE_TYPE=80;
const MAX_PROVIDER_MESSAGE_ID=320;
const MAX_PHONE_NUMBER_ID=120;

const clampLimit=(value:number, fallback=50)=>Math.min(100,Math.max(1,Number.isFinite(value)?Math.trunc(value):fallback));
const id=(prefix:string)=>`${prefix}_${crypto.randomUUID()}`;
const stableId=(prefix:string,value:string)=>`${prefix}_${crypto.createHash('sha256').update(value).digest('hex').slice(0,40)}`;
let dbStatus:{value:boolean;until:number}|null=null;

export function promotion():BotPromotion {
  const value=String(process.env.HIPICO_BOT_PROMOTION||'shadow').toLowerCase();
  if(value==='automatic'){
    return cloudOutboundPolicy().enabled&&cloudTransportConfiguration().configured?'automatic':'approved';
  }
  return value==='approved'?'approved':'shadow';
}

export function classify(text:string):IntentResult { return classifyOperational(text); }

export function classifyIncoming(message:any):IntentResult {
  const messageType=String(message?.messageType||'text').trim().toLowerCase();
  if(NON_TEXT_MEDIA.has(messageType)){
    return{
      intent:messageType==='document'?'document_reference':'media_message',
      risk:'review',
      confidence:.995,
      suggestion:messageType==='document'
        ?'Documento recibido. Se conserva como referencia y no se interpreta como jugada ni modifica saldos automáticamente.'
        :'Adjunto recibido. Se ignora para efectos monetarios y queda disponible para revisión del operador.',
      autoEligible:false,
      reason:messageType==='document'?'DOCUMENT_REVIEW_GATE':'NON_TEXT_MEDIA_REVIEW_GATE'
    };
  }
  return classifyOperational(message?.body||'');
}

// Compatibility exports keep old imports working, but security policy lives in
// the canonical modules so there is no weaker secondary implementation.
export function signatureValid(raw:Buffer|undefined,signature:string|undefined){
  return webhookSignatureValid(raw,signature);
}

export function operatorTokenValid(value:string|undefined){
  return canonicalOperatorTokenValid(value);
}

export function extractMessages(payload:any){
  const rows:any[]=[];
  for(const entry of payload?.entry||[])for(const change of entry?.changes||[]){
    const value=change?.value||{};
    const phoneNumberId=String(value?.metadata?.phone_number_id||'').trim();
    for(const message of value?.messages||[]){
      const providerMessageId=String(message.id||'').trim();
      const sender=String(message.from||'').trim();
      const messageType=String(message.type||'unknown').trim().toLowerCase()||'unknown';
      const body=String(message?.text?.body||message?.button?.text||message?.interactive?.button_reply?.title||message?.document?.caption||message?.document?.filename||message?.image?.caption||message?.video?.caption||'');
      rows.push({providerMessageId,phoneNumberId,sender,messageType,body,payload:message});
    }
  }
  return rows.filter((row)=>
    row.providerMessageId.length>0&&row.providerMessageId.length<=MAX_PROVIDER_MESSAGE_ID&&
    row.phoneNumberId.length>0&&row.phoneNumberId.length<=MAX_PHONE_NUMBER_ID&&
    row.messageType.length>0&&row.messageType.length<=MAX_MESSAGE_TYPE&&
    row.body.length<=MAX_INBOUND_TEXT&&
    E164_DIGITS.test(row.sender)
  );
}

async function dbReady(force=false){
  const now=Date.now();
  if(!force&&dbStatus&&dbStatus.until>now)return dbStatus.value;
  try{await prisma.$queryRaw`SELECT 1 FROM public."HipicoWebhookEvent" LIMIT 1`;dbStatus={value:true,until:now+30_000};return true;}
  catch{dbStatus={value:false,until:now+10_000};return false;}
}

const memoryEvents:any[]=[];
const memoryOutbox:any[]=[];

function sameOutboxIntent(existing:any,row:any){
  return String(existing?.recipient||'')===String(row?.recipient||'')
    && String(existing?.targetType||'individual')===String(row?.targetType||'individual')
    && String(existing?.message||'')===String(row?.message||'')
    && String(existing?.intent||'unknown')===String(row?.intent||'unknown');
}

export const HipicoBotStore={
  dbReady,
  async hasEvent(providerMessageId:string){
    if(await dbReady()){
      const rows=await prisma.$queryRaw<Array<{id:string}>>`SELECT "id" FROM public."HipicoWebhookEvent" WHERE "providerMessageId"=${providerMessageId} LIMIT 1`;
      return Boolean(rows[0]);
    }
    return memoryEvents.some((event)=>event.providerMessageId===providerMessageId);
  },
  async saveEvent(row:any,options:{requirePersistent?:boolean}={}){
    const record={id:id('hwe'),...row,receivedAt:new Date().toISOString()};
    if(await dbReady(Boolean(options.requirePersistent))){
      const inserted=await prisma.$queryRaw<Array<{id:string}>>`INSERT INTO public."HipicoWebhookEvent" ("id","providerMessageId","phoneNumberId","sender","messageType","body","intent","risk","status","confidence","suggestion","payload","receivedAt","processedAt") VALUES (${record.id},${record.providerMessageId},${record.phoneNumberId||null},${record.sender||null},${record.messageType||'unknown'},${record.body||null},${record.intent||'unknown'},${record.risk||'review'},${record.status||'received'},${Number(record.confidence||0)},${record.suggestion||null},${JSON.stringify(record.payload||{})}::jsonb,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT ("providerMessageId") DO NOTHING RETURNING "id"`;
      if(inserted[0]?.id)return{...record,id:inserted[0].id,inserted:true};
      const rows=await prisma.$queryRaw<any[]>`
        SELECT "id","providerMessageId","phoneNumberId","sender","messageType","body","payload"
        FROM public."HipicoWebhookEvent"
        WHERE "providerMessageId"=${record.providerMessageId}
        LIMIT 2`;
      if(rows.length!==1)throw Object.assign(new Error('Webhook dedupe row missing or ambiguous.'),{code:'HIPICO_WEBHOOK_DEDUPE_ROW_INVALID'});
      if(!sameWebhookReplay(rows[0],record))throw replayMismatchError();
      return{...record,id:rows[0].id,inserted:false};
    }
    if(options.requirePersistent)throw Object.assign(new Error('Persistent Hípico event storage is required for webhook ingestion.'),{code:'HIPICO_WEBHOOK_PERSISTENCE_REQUIRED'});
    const existing=memoryEvents.find((event)=>event.providerMessageId===record.providerMessageId);
    if(existing){
      if(!sameWebhookReplay(existing,record))throw replayMismatchError();
      return{...record,id:existing.id,inserted:false};
    }
    memoryEvents.unshift(record);memoryEvents.splice(250);return{...record,inserted:true};
  },
  async queue(row:any){
    const record={id:id('hbo'),...row,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
    if(await dbReady()){
      await prisma.$executeRaw`INSERT INTO public."HipicoBotOutbox" ("id","eventId","recipient","targetType","message","intent","risk","status","createdAt","updatedAt") VALUES (${record.id},${record.eventId||null},${record.recipient},${record.targetType||'individual'},${record.message},${record.intent||'unknown'},${record.risk||'review'},${record.status||'pending_approval'},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`;
      return record;
    }
    memoryOutbox.unshift(record);memoryOutbox.splice(250);return record;
  },
  async queueIdempotent(row:any,scope:string,requestId:string){
    if(!await dbReady(true))throw Object.assign(new Error('Persistent Hípico outbox is required for outbound sends.'),{code:'HIPICO_OUTBOX_PERSISTENCE_REQUIRED'});
    const key=String(requestId||'').trim();
    if(!key)throw Object.assign(new Error('Outbound requestId is required.'),{code:'HIPICO_OUTBOX_REQUEST_ID_REQUIRED'});
    const record={id:stableId('hbo',`${scope}|${key}`),...row};
    const inserted=await prisma.$queryRaw<Array<{id:string}>>`
      INSERT INTO public."HipicoBotOutbox" ("id","eventId","recipient","targetType","message","intent","risk","status","createdAt","updatedAt")
      VALUES (${record.id},${record.eventId||null},${record.recipient},${record.targetType||'individual'},${record.message},${record.intent||'unknown'},${record.risk||'review'},${record.status||'pending_approval'},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
      ON CONFLICT ("id") DO NOTHING
      RETURNING "id"`;
    const rows=await prisma.$queryRaw<any[]>`SELECT * FROM public."HipicoBotOutbox" WHERE "id"=${record.id} LIMIT 1`;
    const existing=rows[0]||null;
    if(!existing)throw Object.assign(new Error('Idempotent outbox row was not persisted.'),{code:'HIPICO_OUTBOX_IDEMPOTENCY_ROW_MISSING'});
    if(!sameOutboxIntent(existing,record))throw Object.assign(new Error('requestId was reused with different outbound content.'),{code:'HIPICO_OUTBOX_IDEMPOTENCY_MISMATCH'});
    return{row:existing,inserted:Boolean(inserted[0])};
  },
  async events(limit=50){const bounded=clampLimit(limit);if(await dbReady())return prisma.$queryRaw`SELECT * FROM public."HipicoWebhookEvent" ORDER BY "receivedAt" DESC LIMIT ${bounded}`;return memoryEvents.slice(0,bounded);},
  async outbox(limit=50){const bounded=clampLimit(limit);if(await dbReady())return prisma.$queryRaw`SELECT * FROM public."HipicoBotOutbox" ORDER BY "createdAt" DESC LIMIT ${bounded}`;return memoryOutbox.slice(0,bounded);},
  async getOutbox(idValue:string){if(await dbReady()){const rows=await prisma.$queryRaw<any[]>`SELECT * FROM public."HipicoBotOutbox" WHERE "id"=${idValue} LIMIT 1`;return rows[0]||null;}return memoryOutbox.find((item)=>item.id===idValue)||null;},
  async claimForSend(idValue:string,expectedStatus:'pending_approval'|'ready_auto'){
    if(await dbReady()){
      const rows=await prisma.$queryRaw<any[]>`UPDATE public."HipicoBotOutbox" SET "status"='sending',"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${idValue} AND "status"=${expectedStatus} RETURNING *`;
      return rows[0]||null;
    }
    const row=memoryOutbox.find((item)=>item.id===idValue&&item.status===expectedStatus);
    if(!row)return null;
    Object.assign(row,{status:'sending',updatedAt:new Date().toISOString()});
    return row;
  },
  async markSent(idValue:string,providerMessageId:string,approvedBy='automatic'){
    if(await dbReady()){
      const affected=await prisma.$executeRaw`UPDATE public."HipicoBotOutbox" SET "status"='sent',"providerMessageId"=${providerMessageId},"approvedBy"=${approvedBy},"approvedAt"=COALESCE("approvedAt",CURRENT_TIMESTAMP),"sentAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${idValue} AND "status"='sending'`;
      return affected===1;
    }
    const row=memoryOutbox.find((item)=>item.id===idValue&&item.status==='sending');
    if(!row)return false;
    Object.assign(row,{status:'sent',providerMessageId,approvedBy,sentAt:new Date().toISOString()});
    return true;
  },
  async markFailed(idValue:string,error:string){
    const safeError=String(error||'unknown').slice(0,1000);
    if(await dbReady()){
      const affected=await prisma.$executeRaw`UPDATE public."HipicoBotOutbox" SET "status"='failed',"error"=${safeError},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${idValue} AND "status"='sending'`;
      return affected===1;
    }
    const row=memoryOutbox.find((item)=>item.id===idValue&&item.status==='sending');
    if(!row)return false;
    Object.assign(row,{status:'failed',error:safeError});
    return true;
  },
  async markReconciliationRequired(idValue:string,error:string){
    const safeError=String(error||'ambiguous_delivery').slice(0,1000);
    if(await dbReady()){
      const affected=await prisma.$executeRaw`UPDATE public."HipicoBotOutbox" SET "status"='reconciliation_required',"error"=${safeError},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${idValue} AND "status"='sending'`;
      return affected===1;
    }
    const row=memoryOutbox.find((item)=>item.id===idValue&&item.status==='sending');
    if(!row)return false;
    Object.assign(row,{status:'reconciliation_required',error:safeError,updatedAt:new Date().toISOString()});
    return true;
  }
};

export async function sendCloudText(recipient:string,message:string){
  assertCloudOutboundAllowed(recipient);
  const {token,phoneId,version,timeoutMs}=assertCloudTransportConfigured();
  if(!E164_DIGITS.test(recipient))throw new Error('Destinatario WhatsApp inválido.');
  const text=String(message||'').trim();
  if(!text||text.length>4000)throw Object.assign(new Error('Mensaje WhatsApp vacío o demasiado largo.'),{code:'HIPICO_CLOUD_MESSAGE_INVALID'});
  let response:Response;
  try{
    response=await fetch(`https://graph.facebook.com/${encodeURIComponent(version)}/${encodeURIComponent(phoneId)}/messages`,{
      method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},
      body:JSON.stringify({messaging_product:'whatsapp',recipient_type:'individual',to:recipient,type:'text',text:{preview_url:false,body:text}}),
      signal:AbortSignal.timeout(timeoutMs)
    });
  }catch(error:any){
    throw Object.assign(new Error('No se pudo determinar si Meta aceptó el mensaje; requiere conciliación manual.'),{
      code:'HIPICO_CLOUD_DELIVERY_AMBIGUOUS',
      transportError:String(error?.name||'network_error').slice(0,120)
    });
  }
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
    if(cloudHttpDeliveryAmbiguous(response.status)){
      throw Object.assign(new Error(`Meta Graph HTTP ${response.status}; entrega ambigua, requiere conciliación manual.`),{
        code:'HIPICO_CLOUD_DELIVERY_AMBIGUOUS',responseStatus:response.status,receiptReason:'AMBIGUOUS_HTTP_STATUS'
      });
    }
    throw Object.assign(new Error(`Meta Graph HTTP ${response.status}`),{code:'HIPICO_CLOUD_HTTP_ERROR',status:response.status});
  }
  const providerMessageId=String(data?.messages?.[0]?.id||'');
  if(!providerMessageId){
    throw Object.assign(new Error('Meta respondió éxito sin identificador de mensaje; requiere conciliación manual.'),{
      code:'HIPICO_CLOUD_DELIVERY_AMBIGUOUS',
      responseStatus:response.status,
      receiptReason:'MESSAGE_ID_MISSING'
    });
  }
  return{providerMessageId,raw:data};
}

export async function processIncoming(message:any,options:{requirePersistent?:boolean}={}){
  const result=classifyIncoming(message);
  const event=await HipicoBotStore.saveEvent({...message,...result,status:'classified'},options);
  if(event.inserted===false&&!options.requirePersistent)return{duplicate:true};
  const mode=promotion();
  const persistent=options.requirePersistent?true:await HipicoBotStore.dbReady();
  const outboxStatus=mode==='shadow'?'shadow':mode==='approved'?'pending_approval':(persistent&&result.autoEligible&&SAFE_AUTOMATIC.has(result.intent)?'ready_auto':'pending_approval');
  const outboxInput={eventId:event.id,recipient:message.sender,targetType:'individual',message:result.suggestion,intent:result.intent,risk:result.risk,status:outboxStatus};
  let outbox:any;
  if(options.requirePersistent){
    const queued=await HipicoBotStore.queueIdempotent(outboxInput,'meta-webhook',String(message.providerMessageId||''));
    outbox=queued.row;
    if(event.inserted===false&&queued.inserted===false){
      const persistedStatus=String(outbox?.status||'');
      if(persistedStatus==='sending'){
        const reconciled=await HipicoBotStore.markReconciliationRequired(outbox.id,'INTERRUPTED_AUTOMATIC_SEND_REQUIRES_RECONCILIATION');
        if(!reconciled)throw Object.assign(new Error('Interrupted webhook send could not be persisted for reconciliation.'),{code:'HIPICO_WEBHOOK_RECONCILIATION_PERSISTENCE_REQUIRED'});
        return{duplicate:false,event,outbox:{...outbox,status:'reconciliation_required',error:'INTERRUPTED_AUTOMATIC_SEND_REQUIRES_RECONCILIATION'}};
      }
      if(!(mode==='automatic'&&outboxStatus==='ready_auto'&&persistedStatus==='ready_auto'))return{duplicate:true,event,outbox};
    }
  }else{
    outbox=await HipicoBotStore.queue(outboxInput);
  }
  if(mode==='automatic'&&persistent&&outboxStatus==='ready_auto'&&String(outbox?.status||outboxStatus)==='ready_auto'){
    const claimed=await HipicoBotStore.claimForSend(outbox.id,'ready_auto');
    if(!claimed)return{duplicate:false,event,outbox:{...outbox,status:'reconciliation_required'}};
    try{
      const sent=await sendCloudText(message.sender,result.suggestion);
      const persisted=await HipicoBotStore.markSent(outbox.id,sent.providerMessageId,'automatic');
      return{duplicate:false,event,outbox:{...outbox,status:persisted?'sent':'reconciliation_required',providerMessageId:sent.providerMessageId}};
    }catch(error:any){
      const ambiguous=error?.code==='HIPICO_CLOUD_DELIVERY_AMBIGUOUS';
      const persisted=ambiguous
        ?await HipicoBotStore.markReconciliationRequired(outbox.id,error?.message||String(error))
        :await HipicoBotStore.markFailed(outbox.id,error?.message||String(error));
      return{duplicate:false,event,outbox:{...outbox,status:persisted?(ambiguous?'reconciliation_required':'failed'):'reconciliation_required',error:error?.message||String(error)}};
    }
  }
  return{duplicate:false,event,outbox};
}