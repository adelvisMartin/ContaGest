import crypto from 'node:crypto';
import { prisma } from '../../database/prisma.js';

export type BotPromotion='shadow'|'approved'|'automatic';
export type IntentResult={intent:string;risk:'safe'|'review'|'monetary';confidence:number;suggestion:string;autoEligible:boolean;reason:string};

const monetary=/\b(juego|juega|consigo|consigue|apuesta|monto|saldo|disponible|debo|debe|pago|pag[oó]|cobro|liquida|liquidaci[oó]n|premio|polla|parley|\d+[.,]?\d*\s*(k|mil|bs|usd|\$))\b/i;
const result=/\b(llegada|pizarra|resultado|gan[oó]|primero|segundo|tercero)\b/i;
const close=/\b(cerrad[ao]|cierre|no m[aá]s jugadas|fin de carrera)\b/i;
const greeting=/^(hola|buen[oa]s?|saludos|buen d[ií]a|buenas tardes|buenas noches)\b/i;
const help=/\b(ayuda|c[oó]mo funciona|instrucciones|men[uú]|opciones)\b/i;
const status=/\b(estado|confirmad[ao]|recibido|pendiente|revisando|ya lleg[oó])\b/i;
const SAFE_AUTOMATIC=new Set(['greeting','help','status_non_monetary']);

const clampLimit=(value:number, fallback=50)=>Math.min(100,Math.max(1,Number.isFinite(value)?Math.trunc(value):fallback));
const id=(prefix:string)=>`${prefix}_${crypto.randomUUID()}`;
let dbStatus:{value:boolean;until:number}|null=null;

export function promotion():BotPromotion {
  const value=String(process.env.HIPICO_BOT_PROMOTION||'shadow').toLowerCase();
  return value==='automatic'||value==='approved'?value:'shadow';
}

export function classify(text:string):IntentResult {
  const body=String(text||'').trim();
  if(!body)return{intent:'empty',risk:'review',confidence:0,suggestion:'No recibí texto para analizar.',autoEligible:false,reason:'EMPTY'};
  if(monetary.test(body))return{intent:'betting_or_balance',risk:'monetary',confidence:.995,suggestion:'Recibido. La operación monetaria queda pendiente de revisión del operador antes de confirmar o afectar saldos.',autoEligible:false,reason:'MONETARY_REVIEW_GATE'};
  if(result.test(body))return{intent:'race_result',risk:'review',confidence:.97,suggestion:'Llegada recibida. Se validará contra la carrera activa antes de aplicar la pizarra.',autoEligible:false,reason:'RESULT_REVIEW_GATE'};
  if(close.test(body))return{intent:'race_close',risk:'review',confidence:.98,suggestion:'Cierre recibido. Se verificará la ventana de carrera antes de cambiar el estado operativo.',autoEligible:false,reason:'CLOSE_REVIEW_GATE'};
  if(greeting.test(body))return{intent:'greeting',risk:'safe',confidence:.99,suggestion:'Hola. Soy el asistente de Control Hípico. Puedo recibir consultas operativas; las jugadas, saldos, cierres y resultados siempre pasan controles adicionales.',autoEligible:true,reason:'SAFE_GREETING'};
  if(help.test(body))return{intent:'help',risk:'safe',confidence:.96,suggestion:'Puedo ayudarte con el flujo de carrera, estado general y dudas de uso. Para jugadas, saldos, cierres o resultados, el operador valida antes de cualquier efecto.',autoEligible:true,reason:'SAFE_HELP'};
  if(status.test(body))return{intent:'status_non_monetary',risk:'safe',confidence:.9,suggestion:'Mensaje recibido. El operador puede revisar el estado en Control Hípico; si la consulta implica dinero o una jugada, no se confirmará automáticamente.',autoEligible:true,reason:'SAFE_STATUS'};
  return{intent:'conversation',risk:'review',confidence:.65,suggestion:'Mensaje recibido para revisión. No se ejecutó ninguna operación automática.',autoEligible:false,reason:'AMBIGUOUS'};
}

export function signatureValid(raw:Buffer|undefined,signature:string|undefined){
  const secret=String(process.env.WHATSAPP_APP_SECRET||'');
  if(!secret||!raw||!signature?.startsWith('sha256='))return false;
  const expected=`sha256=${crypto.createHmac('sha256',secret).update(raw).digest('hex')}`;
  try{return crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(signature));}catch{return false;}
}

export function operatorTokenValid(value:string|undefined){
  const expected=String(process.env.HIPICO_BOT_OPERATOR_TOKEN||'');
  if(!expected||!value)return false;
  try{return crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(value));}catch{return false;}
}

export function extractMessages(payload:any){
  const rows:any[]=[];
  for(const entry of payload?.entry||[])for(const change of entry?.changes||[]){
    const value=change?.value||{};
    const phoneNumberId=String(value?.metadata?.phone_number_id||'');
    for(const message of value?.messages||[]){
      rows.push({
        providerMessageId:String(message.id||''),phoneNumberId,sender:String(message.from||''),
        messageType:String(message.type||'unknown'),
        body:String(message?.text?.body||message?.button?.text||message?.interactive?.button_reply?.title||''),
        payload:message
      });
    }
  }
  return rows.filter((row)=>row.providerMessageId&&/^\d{7,18}$/.test(row.sender));
}

async function dbReady(force=false){
  const now=Date.now();
  if(!force&&dbStatus&&dbStatus.until>now)return dbStatus.value;
  try{
    await prisma.$queryRaw`SELECT 1 FROM public."HipicoWebhookEvent" LIMIT 1`;
    dbStatus={value:true,until:now+30_000};
    return true;
  }catch{
    dbStatus={value:false,until:now+10_000};
    return false;
  }
}

const memoryEvents:any[]=[];
const memoryOutbox:any[]=[];

export const HipicoBotStore={
  dbReady,
  async hasEvent(providerMessageId:string){
    if(await dbReady()){
      const rows=await prisma.$queryRaw<Array<{id:string}>>`SELECT "id" FROM public."HipicoWebhookEvent" WHERE "providerMessageId"=${providerMessageId} LIMIT 1`;
      return Boolean(rows[0]);
    }
    return memoryEvents.some((e)=>e.providerMessageId===providerMessageId);
  },
  async saveEvent(row:any){
    const record={id:id('hwe'),...row,receivedAt:new Date().toISOString()};
    if(await dbReady()){
      const inserted=await prisma.$queryRaw<Array<{id:string}>>`INSERT INTO public."HipicoWebhookEvent" ("id","providerMessageId","phoneNumberId","sender","messageType","body","intent","risk","status","confidence","suggestion","payload","receivedAt","processedAt") VALUES (${record.id},${record.providerMessageId},${record.phoneNumberId||null},${record.sender||null},${record.messageType||'unknown'},${record.body||null},${record.intent||'unknown'},${record.risk||'review'},${record.status||'received'},${Number(record.confidence||0)},${record.suggestion||null},${JSON.stringify(record.payload||{})}::jsonb,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT ("providerMessageId") DO NOTHING RETURNING "id"`;
      return {...record,inserted:Boolean(inserted[0])};
    }
    if(memoryEvents.some((e)=>e.providerMessageId===record.providerMessageId))return{...record,inserted:false};
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
  async events(limit=50){
    const bounded=clampLimit(limit);
    if(await dbReady())return prisma.$queryRaw`SELECT * FROM public."HipicoWebhookEvent" ORDER BY "receivedAt" DESC LIMIT ${bounded}`;
    return memoryEvents.slice(0,bounded);
  },
  async outbox(limit=50){
    const bounded=clampLimit(limit);
    if(await dbReady())return prisma.$queryRaw`SELECT * FROM public."HipicoBotOutbox" ORDER BY "createdAt" DESC LIMIT ${bounded}`;
    return memoryOutbox.slice(0,bounded);
  },
  async getOutbox(idValue:string){
    if(await dbReady()){
      const rows=await prisma.$queryRaw<any[]>`SELECT * FROM public."HipicoBotOutbox" WHERE "id"=${idValue} LIMIT 1`;
      return rows[0]||null;
    }
    return memoryOutbox.find((x)=>x.id===idValue)||null;
  },
  async markSent(idValue:string,providerMessageId:string,approvedBy='automatic'){
    if(await dbReady()){
      await prisma.$executeRaw`UPDATE public."HipicoBotOutbox" SET "status"='sent',"providerMessageId"=${providerMessageId},"approvedBy"=${approvedBy},"approvedAt"=COALESCE("approvedAt",CURRENT_TIMESTAMP),"sentAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${idValue}`;
      return;
    }
    const row=memoryOutbox.find((x)=>x.id===idValue);if(row)Object.assign(row,{status:'sent',providerMessageId,approvedBy,sentAt:new Date().toISOString()});
  },
  async markFailed(idValue:string,error:string){
    const safeError=String(error||'unknown').slice(0,1000);
    if(await dbReady()){
      await prisma.$executeRaw`UPDATE public."HipicoBotOutbox" SET "status"='failed',"error"=${safeError},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${idValue}`;
      return;
    }
    const row=memoryOutbox.find((x)=>x.id===idValue);if(row)Object.assign(row,{status:'failed',error:safeError});
  }
};

export async function sendCloudText(recipient:string,message:string){
  const token=String(process.env.WHATSAPP_CLOUD_TOKEN||'');
  const phoneId=String(process.env.WHATSAPP_PHONE_NUMBER_ID||'');
  const version=String(process.env.WHATSAPP_GRAPH_API_VERSION||process.env.WHATSAPP_GRAPH_VERSION||'v23.0');
  if(!token||!phoneId)throw new Error('Faltan WHATSAPP_CLOUD_TOKEN o WHATSAPP_PHONE_NUMBER_ID');
  if(!/^\d{7,18}$/.test(recipient))throw new Error('Destinatario WhatsApp inválido.');
  const response=await fetch(`https://graph.facebook.com/${encodeURIComponent(version)}/${encodeURIComponent(phoneId)}/messages`,{
    method:'POST',
    headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},
    body:JSON.stringify({messaging_product:'whatsapp',recipient_type:'individual',to:recipient,type:'text',text:{preview_url:false,body:String(message).slice(0,4000)}}),
    signal:AbortSignal.timeout(10_000)
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(`Meta Graph HTTP ${response.status}: ${data?.error?.message||'error al enviar'}`);
  return{providerMessageId:String(data?.messages?.[0]?.id||''),raw:data};
}

export async function processIncoming(message:any){
  if(await HipicoBotStore.hasEvent(message.providerMessageId))return{duplicate:true};
  const result=classify(message.body);
  const event=await HipicoBotStore.saveEvent({...message,...result,status:'classified'});
  if(event.inserted===false)return{duplicate:true};

  const mode=promotion();
  const persistent=await HipicoBotStore.dbReady();
  // Automatic delivery is disabled if persistence is unavailable. Serverless
  // memory cannot guarantee idempotency/audit for an autonomous reply.
  const outboxStatus=mode==='shadow'
    ?'shadow'
    :mode==='approved'
      ?'pending_approval'
      :(persistent&&result.autoEligible&&SAFE_AUTOMATIC.has(result.intent)?'ready_auto':'pending_approval');
  const outbox=await HipicoBotStore.queue({eventId:event.id,recipient:message.sender,targetType:'individual',message:result.suggestion,intent:result.intent,risk:result.risk,status:outboxStatus});

  if(mode==='automatic'&&persistent&&outboxStatus==='ready_auto'){
    try{
      const sent=await sendCloudText(message.sender,result.suggestion);
      await HipicoBotStore.markSent(outbox.id,sent.providerMessageId,'automatic');
      return{duplicate:false,event,outbox:{...outbox,status:'sent'}};
    }catch(error:any){
      await HipicoBotStore.markFailed(outbox.id,error?.message||String(error));
      return{duplicate:false,event,outbox:{...outbox,status:'failed',error:error?.message||String(error)}};
    }
  }
  return{duplicate:false,event,outbox};
}
