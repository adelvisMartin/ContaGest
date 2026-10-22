import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requireTenant, requirePermission } from '../../shared/middleware/context.js';
import { NotificationTemplateError, renderNotificationTemplate, evaluateNotificationQuietHours, listNotificationTemplateDescriptors } from './notification-template-catalog.js';
import { projectNotificationDeliveryEvidence } from './notification-delivery-evidence.js';

const router = Router();
router.use(requireTenant);

const messageSchema = z.object({
  to: z.string().min(7),
  message: z.string().min(1).max(4000),
  order: z.record(z.string(), z.unknown()).optional()
});

// #854 Transport boundary: the order object is not a trusted server record.
// Only the destination needed by this legacy adapter can cross the boundary.
// Unknown outer fields fail; unrelated order fields are discarded, never logged.
const whatsappOrderSchema = z.object({
  order: z.object({
    phone: z.string().regex(/^\+?[1-9]\d{7,14}$/)
  }).strip(),
  message: z.string().trim().min(1).max(4000)
    .refine(value => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value))
}).strict();

// Automated WhatsApp dispatch is prohibited until the server can prove recipient
// consent, original order ownership and a durable #853 intent + #772 adapter.
// An operator's sales.manage permission is not the recipient's opt-in, nor is
// order.phone in request.body a trusted destination. The manual wa.me link in
// the frontend remains a deliberate human action, not a delivery receipt.
router.post('/whatsapp/order', requirePermission('sales.manage'), asyncHandler(async (req, _res) => {
  whatsappOrderSchema.parse(req.body || {});
  throw new HttpError(503, 'El envío automático de WhatsApp no está habilitado sin consentimiento verificable y entrega durable.');
}));


// Internal self-service consent is not a provider opt-in. The only supported
// channel here is in_app; external transport remains disabled.
const preferenceSchema=z.object({
  enabled:z.boolean(),
  consent:z.enum(['granted','denied']),
  quietHours:z.object({
    timeZone:z.string().trim().min(1).max(120),
    start:z.string().regex(/^([01]\\d|2[0-3]):[0-5]\\d$/),
    end:z.string().regex(/^([01]\\d|2[0-3]):[0-5]\\d$/)
  }).strict().nullish()
}).strict().superRefine((row,c)=>{
  if(row.enabled && row.consent!=='granted')
    c.addIssue({code:'custom',message:'La habilitación requiere consentimiento explícito.'});
  if(row.quietHours?.start===row.quietHours?.end&&row.quietHours)
    c.addIssue({code:'custom',message:'Las horas de silencio deben delimitar un intervalo.'});
});
const authenticatedSelf=(req:any)=>{
  const context=req.context as {tenantId:string;userId?:string};
  if(!context.userId)throw new HttpError(401,'Sesión requerida.');
  return {tenantId:context.tenantId,userId:context.userId};
};
router.get('/preferences/me',asyncHandler(async(req,res)=>{
  const {tenantId,userId}=authenticatedSelf(req);
  const pref=await prisma.notificationChannelPreference.findUnique({
    where:{tenantId_userId_channel:{tenantId,userId,channel:'in_app'}},
    select:{channel:true,enabled:true,consent:true,verifiedAt:true,
      timeZone:true,quietStart:true,quietEnd:true,updatedAt:true}
  });
  res.setHeader('Cache-Control','private, no-store');
  ok(res,pref||{channel:'in_app',enabled:false,consent:'unknown',verifiedAt:null,
    timeZone:null,quietStart:null,quietEnd:null});
}));
router.put('/preferences/me',asyncHandler(async(req,res)=>{
  const {tenantId,userId}=authenticatedSelf(req);
  const input=preferenceSchema.parse(req.body||{});
  if(input.quietHours){
    try{
      new Intl.DateTimeFormat('en-US',{timeZone:input.quietHours.timeZone}).format(new Date());
    }catch{throw new HttpError(422,'Zona horaria inválida.');}
  }
  const saved=await prisma.$transaction(async tx=>{
    const active=await tx.userProfile.findFirst({
      where:{id:userId,tenantId,status:'active'},select:{id:true}
    });
    if(!active)throw new HttpError(403,'Usuario no disponible.');
    const key={tenantId,userId,channel:'in_app'};
    const old=await tx.notificationChannelPreference.findUnique({
      where:{tenantId_userId_channel:key}
    });
    const now=new Date();
    const data={
      enabled:input.enabled,consent:input.consent,
      verifiedAt:input.consent==='granted'?now:null,
      verifiedSource:input.consent==='granted'?'authenticated-self-service':null,
      timeZone:input.quietHours?.timeZone||null,
      quietStart:input.quietHours?.start||null,
      quietEnd:input.quietHours?.end||null,
      updatedBy:userId
    };
    const current=await tx.notificationChannelPreference.upsert({
      where:{tenantId_userId_channel:key},
      create:{...key,...data},update:data
    });
    await tx.auditLog.create({data:{
      tenantId,userId,action:'notification.preference.self-updated',
      entity:'NotificationChannelPreference',entityId:current.id,
      before:old?{enabled:old.enabled,consent:old.consent}:null,
      after:{channel:'in_app',enabled:current.enabled,consent:current.consent},
    }});
    return current;
  });
  res.setHeader('Cache-Control','private, no-store');
  ok(res,{channel:'in_app',enabled:saved.enabled,consent:saved.consent,
    verifiedAt:saved.verifiedAt,timeZone:saved.timeZone,
    quietStart:saved.quietStart,quietEnd:saved.quietEnd});
}));

// Tenant-scoped, permission-guarded PREVIEW ONLY; never delivers or persists data.
const previewSchema = z.object({
  key: z.enum(['operational.notice', 'sales.order-status']),
  locale: z.string().max(35).optional(),
  values: z.record(z.string(), z.string()).optional(),
  quietHours: z.object({
    timeZone: z.string().min(1).max(120),
    start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    at: z.string().datetime({ offset: true })
  }).strict().optional()
}).strict();

// Tenant + permission gate applies also to catalog metadata. No public or PII data.
router.get('/templates', requirePermission('sales.manage'), asyncHandler(async (_req, res) => {
  ok(res, { templates: listNotificationTemplateDescriptors(), queueReady: false });
}));

router.post('/templates/preview', requirePermission('sales.manage'), asyncHandler(async (req, res) => {
  const payload = previewSchema.parse(req.body || {});
  try {
    const preview = renderNotificationTemplate(payload.key, payload.locale, payload.values);
    const quietHours = payload.quietHours ? evaluateNotificationQuietHours({
      timeZone: payload.quietHours.timeZone,
      start: payload.quietHours.start,
      end: payload.quietHours.end,
      instant: new Date(payload.quietHours.at)
    }) : null;
    ok(res, { preview, quietHours, queued: false, delivered: false });
  } catch (error) {
    if (error instanceof NotificationTemplateError) throw new HttpError(422, error.message);
    throw error;
  }
}));

router.post('/send', requirePermission('sales.manage'), asyncHandler(async (req, _res) => {
  messageSchema.parse(req.body || {});
  // The #853 AsyncJobIntent foundation exists, but this route has no reviewed
  // notification handler, consent store or provider delivery worker connected.
  // Never report queued=true or echo private data before a durable intent exists.
  throw new HttpError(503, 'La cola de notificaciones no está disponible; no se programó ningún envío.');
}));


const deliveryWindow = z.object({
  take: z.coerce.number().int().min(1).max(100).default(50),
  skip: z.coerce.number().int().min(0).max(100000).default(0),
}).strict();
// This is NOT a receipt log or provider timeline; it is a safe projection
// of existing internal NotificationLog rows only.
router.get('/delivery-evidence', requirePermission('sales.manage'), asyncHandler(async (req, res) => {
  const { take, skip } = deliveryWindow.parse(req.query);
  const tenantId = (req as any).context.tenantId as string;
  const rows = await prisma.notificationLog.findMany({
    where: { tenantId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { id: true, tenantId: true, channel: true, status: true, createdAt: true },
    take: take + 1, skip,
  });
  const hasMore = rows.length > take;
  const evidence = projectNotificationDeliveryEvidence(tenantId, rows.slice(0, take));
  res.setHeader('Cache-Control', 'private, no-store');
  ok(res, { ...evidence, pagination: { take, skip, hasMore } });
}));

export default router;
