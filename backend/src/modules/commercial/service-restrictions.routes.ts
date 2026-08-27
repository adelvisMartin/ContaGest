import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requirePermission, requireTenant } from '../../shared/middleware/context.js';

const router=Router();
router.use(requireTenant,requirePermission('platform.manage'));

export const SERVICE_RESTRICTION_REASON_CODES=[
  'SEC_SESSION_COMPROMISED','SEC_DEVICE_COMPROMISED','SEC_TENANT_ESCAPE_ATTEMPT','SEC_MALWARE','SEC_ATTACK_ACTIVE',
  'FRAUD_IDENTITY','FRAUD_PAYMENT','BILLING_PAST_DUE','CONTRACT_LIMIT_BYPASS','CONTRACT_AUP','LEGAL_ORDER',
  'CUSTOMER_CANCEL','PROVIDER_CONVENIENCE','DATA_RETENTION_HOLD'
] as const;

const SUSPEND_REASON_CODES=[
  'SEC_TENANT_ESCAPE_ATTEMPT','SEC_MALWARE','SEC_ATTACK_ACTIVE','FRAUD_IDENTITY','FRAUD_PAYMENT',
  'BILLING_PAST_DUE','CONTRACT_LIMIT_BYPASS','CONTRACT_AUP','LEGAL_ORDER'
] as const;
const TERMINATE_REASON_CODES=[
  'SEC_ATTACK_ACTIVE','FRAUD_IDENTITY','FRAUD_PAYMENT','BILLING_PAST_DUE','CONTRACT_LIMIT_BYPASS',
  'CONTRACT_AUP','LEGAL_ORDER','CUSTOMER_CANCEL','PROVIDER_CONVENIENCE'
] as const;
const IMMEDIATE_CONTAINMENT_CODES=new Set(['SEC_TENANT_ESCAPE_ATTEMPT','SEC_MALWARE','SEC_ATTACK_ACTIVE','FRAUD_IDENTITY','FRAUD_PAYMENT','LEGAL_ORDER']);
const CURE_REQUIRED_CODES=new Set(['CONTRACT_LIMIT_BYPASS','CONTRACT_AUP']);
const RESTRICTED_STATUSES=new Set(['suspended','cancelled','expired']);

const caseFields=`"id","subscriptionId","action","targetStatus","reasonCode","scope","evidenceRef","actorId","reviewedById","status","openedAt","effectiveAt","noticeAt","cureDeadline","appealDeadline","reviewedAt","resolvedAt","metadata"`;

const suspendSchema=z.object({
  reasonCode:z.enum(SUSPEND_REASON_CODES),scope:z.literal('subscription'),evidenceRef:z.string().trim().min(3).max(1000),
  effectiveAt:z.coerce.date().optional(),noticeAt:z.coerce.date().optional(),cureDeadline:z.coerce.date().optional(),appealDeadline:z.coerce.date().optional()
}).strict();
const reactivateSchema=z.object({caseId:z.string().min(1).max(120),evidenceRef:z.string().trim().min(3).max(1000),effectiveAt:z.coerce.date().optional()}).strict();
const terminateSchema=z.object({
  caseId:z.string().min(1).max(120).optional(),confirm:z.boolean().optional(),reasonCode:z.enum(TERMINATE_REASON_CODES).optional(),scope:z.literal('subscription').optional(),
  evidenceRef:z.string().trim().min(3).max(1000).optional(),terminalStatus:z.enum(['cancelled','expired']).optional(),effectiveAt:z.coerce.date().optional(),
  noticeAt:z.coerce.date().optional(),cureDeadline:z.coerce.date().optional(),appealDeadline:z.coerce.date().optional()
}).strict();
const paymentSchema=z.object({
  subscriptionId:z.string().min(1).max(120),amount:z.coerce.number().min(0),currency:z.string().trim().min(3).max(8).default('USD'),method:z.string().trim().max(80).optional(),
  reference:z.string().trim().max(160).optional(),status:z.enum(['pending','paid','failed','refunded','void']).default('paid'),paidAt:z.coerce.date().optional(),periodStart:z.coerce.date().optional(),periodEnd:z.coerce.date().optional()
}).passthrough();

type RestrictionCase={id:string;subscriptionId:string;action:string;targetStatus:string;reasonCode:string;scope:string;evidenceRef:string;actorId:string|null;reviewedById:string|null;status:string;openedAt:Date;effectiveAt:Date|null;noticeAt:Date|null;cureDeadline:Date|null;appealDeadline:Date|null;reviewedAt:Date|null;resolvedAt:Date|null;metadata:any};

function actor(req:any){const id=req.context?.userId;if(!id)throw new HttpError(401,'La operación gobernada requiere un actor autenticado.');return String(id);}
function due(value:Date|undefined,label:string){if(!value)throw new HttpError(422,`${label} es obligatorio para este motivo.`);if(value.getTime()>Date.now())throw new HttpError(409,`${label} todavía no se ha cumplido.`);}
function atOrBeforeNow(value:Date|undefined){if(value&&value.getTime()>Date.now())throw new HttpError(409,'La fecha efectiva futura requiere un ejecutor programado; esta operación solo ejecuta cambios vigentes.');return value||new Date();}
function addCycle(date:Date,cycle:string){const next=new Date(date);if(cycle==='monthly')next.setUTCMonth(next.getUTCMonth()+1);else if(cycle==='quarterly')next.setUTCMonth(next.getUTCMonth()+3);else if(cycle==='semiannual')next.setUTCMonth(next.getUTCMonth()+6);else if(cycle==='annual')next.setUTCFullYear(next.getUTCFullYear()+1);return next;}

async function subscription(id:string,client:any=prisma){const rows=await client.$queryRawUnsafe<any[]>(`SELECT s.*,sa."commissionRate" FROM public."Subscription" s LEFT JOIN public."SalesAgent" sa ON sa."id"=s."salesAgentId" WHERE s."id"=$1 LIMIT 1`,id);return rows[0]||null;}
async function restrictionCase(id:string,client:any=prisma){const rows=await client.$queryRawUnsafe<RestrictionCase[]>(`SELECT ${caseFields} FROM public."ServiceRestrictionCase" WHERE "id"=$1 LIMIT 1`,id);return rows[0]||null;}
async function openCaseForSubscription(subscriptionId:string,client:any=prisma){const rows=await client.$queryRawUnsafe<RestrictionCase[]>(`SELECT ${caseFields} FROM public."ServiceRestrictionCase" WHERE "subscriptionId"=$1 AND "status" IN ('open','pending_review') ORDER BY "openedAt" DESC LIMIT 1`,subscriptionId);return rows[0]||null;}
async function audit(tx:any,req:any,action:string,caseId:string,before:unknown,after:unknown){await tx.auditLog.create({data:{tenantId:req.context.tenantId,userId:req.context.userId||null,action,entity:'ServiceRestrictionCase',entityId:caseId,before:before as any,after:after as any,ipAddress:req.ip,userAgent:req.headers['user-agent']||null}});}

// Explicitly close every normal legacy/manual bypass before the historical commercial router runs.
router.post('/subscriptions/:id/status',(_req,_res,next)=>next(new HttpError(410,'El endpoint genérico de estado fue retirado. Usa /suspend, /reactivate o /terminate con expediente.')));
router.patch('/subscriptions/:id',(req,_res,next)=>{
  if(Object.prototype.hasOwnProperty.call(req.body||{},'status'))return next(new HttpError(422,'Subscription.status no puede modificarse por PATCH. Usa una operación gobernada.'));
  next();
});
router.post('/subscriptions',(req,_res,next)=>{
  if(RESTRICTED_STATUSES.has(String(req.body?.status||'')))return next(new HttpError(422,'Una suscripción nueva no puede nacer suspendida, cancelada ni expirada. Abre el expediente correspondiente después de crearla.'));
  next();
});

router.get('/subscriptions/:id/restriction-cases',asyncHandler(async(req,res)=>{
  if(!await subscription(req.params.id))throw new HttpError(404,'Suscripción no encontrada.');
  const rows=await prisma.$queryRawUnsafe<any[]>(`SELECT ${caseFields} FROM public."ServiceRestrictionCase" WHERE "subscriptionId"=$1 ORDER BY "openedAt" DESC LIMIT 100`,req.params.id);
  ok(res,rows);
}));

router.post('/subscriptions/:id/suspend',asyncHandler(async(req,res)=>{
  const b=suspendSchema.parse(req.body||{});const userId=actor(req);const current=await subscription(req.params.id);
  if(!current)throw new HttpError(404,'Suscripción no encontrada.');
  if(['suspended','cancelled','expired'].includes(String(current.status)))throw new HttpError(409,`No se puede suspender una suscripción en estado ${current.status}.`);
  if(await openCaseForSubscription(req.params.id))throw new HttpError(409,'Ya existe un expediente abierto para esta suscripción. Resuélvelo antes de abrir otro.');
  if(b.reasonCode==='BILLING_PAST_DUE'){
    if(String(current.status)!=='past_due')throw new HttpError(409,'BILLING_PAST_DUE solo puede suspender una suscripción previamente marcada past_due.');
    if(!current.graceUntil||new Date(current.graceUntil).getTime()>Date.now())throw new HttpError(409,'La gracia comercial no ha vencido; la suspensión por mora aún no es elegible.');
    due(b.noticeAt,'noticeAt');
  }
  if(CURE_REQUIRED_CODES.has(b.reasonCode)){due(b.noticeAt,'noticeAt');due(b.cureDeadline,'cureDeadline');}
  const effectiveAt=atOrBeforeNow(b.effectiveAt);
  const result=await prisma.$transaction(async(tx:any)=>{
    const cases=await tx.$queryRawUnsafe<any[]>(`INSERT INTO public."ServiceRestrictionCase" ("subscriptionId","action","targetStatus","reasonCode","scope","evidenceRef","actorId","status","openedAt","effectiveAt","noticeAt","cureDeadline","appealDeadline","metadata") VALUES ($1,'suspend','suspended',$2,$3,$4,$5,'open',now(),$6,$7,$8,$9,$10::jsonb) RETURNING ${caseFields}`,
      req.params.id,b.reasonCode,b.scope,b.evidenceRef,userId,effectiveAt,b.noticeAt||null,b.cureDeadline||null,b.appealDeadline||null,JSON.stringify({immediateContainment:IMMEDIATE_CONTAINMENT_CODES.has(b.reasonCode)}));
    const c=cases[0];
    await tx.$executeRawUnsafe(`UPDATE public."Subscription" SET "status"='suspended',"updatedAt"=now() WHERE "id"=$1`,req.params.id);
    await tx.$executeRawUnsafe(`UPDATE public."CustomerAccount" SET "status"='suspended',"updatedAt"=now() WHERE "id"=$1`,current.customerAccountId);
    await audit(tx,req,'commercial.subscription.suspend',c.id,{subscriptionStatus:current.status},{caseId:c.id,subscriptionId:req.params.id,status:'suspended',reasonCode:c.reasonCode,scope:c.scope,evidenceRef:c.evidenceRef,effectiveAt:c.effectiveAt});
    return c;
  });
  ok(res,{subscription:await subscription(req.params.id),case:result},201);
}));

router.post('/subscriptions/:id/reactivate',asyncHandler(async(req,res)=>{
  const b=reactivateSchema.parse(req.body||{});actor(req);const current=await subscription(req.params.id);
  if(!current)throw new HttpError(404,'Suscripción no encontrada.');
  if(String(current.status)!=='suspended')throw new HttpError(409,'Solo una suscripción suspendida puede reactivarse mediante un expediente.');
  const c=await restrictionCase(b.caseId);
  if(!c||c.subscriptionId!==req.params.id||c.action!=='suspend')throw new HttpError(404,'El expediente original de suspensión no pertenece a esta suscripción.');
  if(c.status!=='open')throw new HttpError(409,'El expediente original ya fue resuelto o no está abierto.');
  if(c.reasonCode==='BILLING_PAST_DUE'){
    const paid=await prisma.$queryRawUnsafe<any[]>(`SELECT "id" FROM public."SubscriptionPayment" WHERE "subscriptionId"=$1 AND "status"='paid' AND COALESCE("paidAt","createdAt") >= $2 ORDER BY COALESCE("paidAt","createdAt") DESC LIMIT 1`,req.params.id,c.openedAt);
    if(!paid[0])throw new HttpError(409,'La reactivación por mora requiere un pago conciliado posterior a la suspensión.');
  }
  const effectiveAt=atOrBeforeNow(b.effectiveAt);
  const updated=await prisma.$transaction(async(tx:any)=>{
    await tx.$executeRawUnsafe(`UPDATE public."Subscription" SET "status"='active',"updatedAt"=now() WHERE "id"=$1`,req.params.id);
    await tx.$executeRawUnsafe(`UPDATE public."CustomerAccount" SET "status"='active',"updatedAt"=now() WHERE "id"=$1`,current.customerAccountId);
    const rows=await tx.$queryRawUnsafe<RestrictionCase[]>(`UPDATE public."ServiceRestrictionCase" SET "status"='resolved',"resolvedAt"=$2,"metadata"=COALESCE("metadata",'{}'::jsonb)||jsonb_build_object('reactivationEvidenceRef',$3) WHERE "id"=$1 RETURNING ${caseFields}`,c.id,effectiveAt,b.evidenceRef);
    await audit(tx,req,'commercial.subscription.reactivate',c.id,{subscriptionStatus:'suspended',caseStatus:c.status},{caseId:c.id,subscriptionId:req.params.id,status:'active',reasonCode:c.reasonCode,evidenceRef:b.evidenceRef,resolvedAt:effectiveAt});
    return rows[0];
  });
  ok(res,{subscription:await subscription(req.params.id),case:updated});
}));

router.post('/subscriptions/:id/terminate',asyncHandler(async(req,res)=>{
  const b=terminateSchema.parse(req.body||{});const userId=actor(req);const current=await subscription(req.params.id);
  if(!current)throw new HttpError(404,'Suscripción no encontrada.');
  if(['cancelled','expired'].includes(String(current.status)))throw new HttpError(409,`La suscripción ya está en estado terminal ${current.status}.`);

  if(!b.caseId){
    if(!b.reasonCode||!b.scope||!b.evidenceRef)throw new HttpError(422,'reasonCode, scope y evidenceRef son obligatorios al abrir una terminación.');
    if(await openCaseForSubscription(req.params.id))throw new HttpError(409,'Ya existe un expediente abierto para esta suscripción. Resuélvelo antes de abrir otro.');
    if(CURE_REQUIRED_CODES.has(b.reasonCode)){due(b.noticeAt,'noticeAt');due(b.cureDeadline,'cureDeadline');}
    if(!IMMEDIATE_CONTAINMENT_CODES.has(b.reasonCode)&&b.reasonCode!=='CUSTOMER_CANCEL')due(b.noticeAt,'noticeAt');
    const effectiveAt=b.effectiveAt||new Date();
    const rows=await prisma.$transaction(async(tx:any)=>{
      const created=await tx.$queryRawUnsafe<RestrictionCase[]>(`INSERT INTO public."ServiceRestrictionCase" ("subscriptionId","action","targetStatus","reasonCode","scope","evidenceRef","actorId","status","openedAt","effectiveAt","noticeAt","cureDeadline","appealDeadline","metadata") VALUES ($1,'terminate',$2,$3,$4,$5,$6,'pending_review',now(),$7,$8,$9,$10,'{}'::jsonb) RETURNING ${caseFields}`,
        req.params.id,b.terminalStatus||'cancelled',b.reasonCode,b.scope,b.evidenceRef,userId,effectiveAt,b.noticeAt||null,b.cureDeadline||null,b.appealDeadline||null);
      await audit(tx,req,'commercial.subscription.termination.request',created[0].id,{subscriptionStatus:current.status},{caseId:created[0].id,subscriptionId:req.params.id,targetStatus:created[0].targetStatus,reasonCode:created[0].reasonCode,reviewRequired:true});
      return created[0];
    });
    return ok(res,{subscription:current,case:rows,reviewRequired:true},202);
  }

  if(b.confirm!==true)throw new HttpError(422,'La segunda revisión requiere confirm=true.');
  const c=await restrictionCase(b.caseId);
  if(!c||c.subscriptionId!==req.params.id||c.action!=='terminate')throw new HttpError(404,'Expediente de terminación no encontrado para esta suscripción.');
  if(c.status!=='pending_review')throw new HttpError(409,'El expediente no está pendiente de segunda revisión.');
  if(c.actorId===userId)throw new HttpError(403,'Segregación de funciones: el actor que abrió la terminación no puede aprobarla.');
  if(c.effectiveAt&&new Date(c.effectiveAt).getTime()>Date.now())throw new HttpError(409,'La fecha efectiva aún no llegó; vuelve a ejecutar la segunda revisión en la fecha aprobada.');
  const resolvedAt=new Date();
  const result=await prisma.$transaction(async(tx:any)=>{
    await tx.$executeRawUnsafe(`UPDATE public."Subscription" SET "status"=$2,"updatedAt"=now() WHERE "id"=$1`,req.params.id,c.targetStatus);
    await tx.$executeRawUnsafe(`UPDATE public."CustomerAccount" SET "status"='cancelled',"updatedAt"=now() WHERE "id"=$1`,current.customerAccountId);
    const rows=await tx.$queryRawUnsafe<RestrictionCase[]>(`UPDATE public."ServiceRestrictionCase" SET "status"='resolved',"reviewedById"=$2,"reviewedAt"=$3,"resolvedAt"=$3 WHERE "id"=$1 RETURNING ${caseFields}`,c.id,userId,resolvedAt);
    await audit(tx,req,'commercial.subscription.terminate',c.id,{subscriptionStatus:current.status,caseStatus:c.status},{caseId:c.id,subscriptionId:req.params.id,status:c.targetStatus,reasonCode:c.reasonCode,reviewedById:userId,resolvedAt});
    return rows[0];
  });
  ok(res,{subscription:await subscription(req.params.id),case:result});
}));

// A paid request must not silently reactivate a non-billing suspension. For a billing
// suspension, payment reconciliation and case resolution happen atomically here.
router.post('/payments',asyncHandler(async(req,res,next)=>{
  const b=paymentSchema.parse(req.body||{});
  if(b.status!=='paid')return next();
  const current=await subscription(b.subscriptionId);
  if(!current||String(current.status)!=='suspended')return next();
  const c=await openCaseForSubscription(b.subscriptionId);
  if(!c||c.action!=='suspend')throw new HttpError(409,'La suscripción suspendida no tiene un expediente abierto; el pago no puede saltarse la gobernanza.');
  if(c.reasonCode!=='BILLING_PAST_DUE')throw new HttpError(409,'Un pago no puede reactivar una suspensión de seguridad, fraude, contrato u orden legal. Usa /reactivate con el expediente original.');
  if(!b.reference||b.reference.trim().length<3)throw new HttpError(422,'La reactivación automática por mora requiere referencia de conciliación como evidencia.');
  if(b.amount<=0)throw new HttpError(422,'Un pago conciliado debe tener monto mayor que cero.');
  const paidAt=b.paidAt||new Date();const periodStart=b.periodStart||paidAt;const periodEnd=b.periodEnd||(current.billingCycle!=='manual'?addCycle(new Date(periodStart),current.billingCycle):null);const nextRenewal=periodEnd||(current.billingCycle!=='manual'?addCycle(new Date(paidAt),current.billingCycle):null);
  const output=await prisma.$transaction(async(tx:any)=>{
    const payments=await tx.$queryRawUnsafe<any[]>(`INSERT INTO public."SubscriptionPayment" ("id","subscriptionId","amount","currency","method","reference","status","periodStart","periodEnd","paidAt","metadata","createdAt","updatedAt") VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,'paid',$6,$7,$8,'{}'::jsonb,now(),now()) RETURNING *`,b.subscriptionId,b.amount,b.currency.toUpperCase(),b.method||null,b.reference,periodStart,periodEnd,paidAt);
    const payment=payments[0];
    await tx.$executeRawUnsafe(`UPDATE public."Subscription" SET "status"='active',"currentPeriodStart"=$2,"currentPeriodEnd"=$3,"nextRenewalAt"=$4,"updatedAt"=now() WHERE "id"=$1`,b.subscriptionId,periodStart,periodEnd,nextRenewal);
    await tx.$executeRawUnsafe(`UPDATE public."CustomerAccount" SET "status"='active',"updatedAt"=now() WHERE "id"=$1`,current.customerAccountId);
    if(current.salesAgentId){const existing=await tx.$queryRawUnsafe<any[]>(`SELECT "id" FROM public."Commission" WHERE "paymentId"=$1 LIMIT 1`,payment.id);if(!existing[0]){const rate=Number(current.commissionRate||0);const commissionAmount=Math.round((b.amount*rate/100)*100)/100;await tx.$executeRawUnsafe(`INSERT INTO public."Commission" ("id","salesAgentId","subscriptionId","paymentId","rate","baseAmount","amount","currency","status","earnedAt","createdAt","updatedAt") VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,'earned',now(),now(),now())`,current.salesAgentId,b.subscriptionId,payment.id,rate,b.amount,commissionAmount,b.currency.toUpperCase());}}
    await tx.$queryRawUnsafe(`UPDATE public."ServiceRestrictionCase" SET "status"='resolved',"resolvedAt"=$2,"metadata"=COALESCE("metadata",'{}'::jsonb)||jsonb_build_object('reactivationEvidenceRef',$3,'paymentId',$4) WHERE "id"=$1 RETURNING "id"`,c.id,paidAt,`payment:${b.reference}`,payment.id);
    await tx.auditLog.create({data:{tenantId:req.context.tenantId,userId:req.context.userId||null,action:'commercial.payment.create',entity:'SubscriptionPayment',entityId:payment.id,after:payment as any,ipAddress:req.ip,userAgent:req.headers['user-agent']||null}});
    await audit(tx,req,'commercial.subscription.reactivate',c.id,{subscriptionStatus:'suspended',caseStatus:c.status},{caseId:c.id,subscriptionId:b.subscriptionId,status:'active',reasonCode:c.reasonCode,paymentId:payment.id,evidenceRef:`payment:${b.reference}`});
    return payment;
  });
  ok(res,{payment:output,subscription:await subscription(b.subscriptionId),restrictionCaseId:c.id},201);
}));

export default router;
