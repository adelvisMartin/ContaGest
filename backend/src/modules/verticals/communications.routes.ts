import { Router } from 'express';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, ok } from '../../shared/http.js';
import { requirePermission } from '../../shared/middleware/context.js';
import { communicationRenderSchema, communicationTemplateSchema } from './communications.schemas.js';
import { ctx, one } from './verticals.shared.js';

const router = Router();

router.get('/communications/templates', requirePermission('communications.manage'), asyncHandler(async (req, res) => {
  const vertical = String(req.query.vertical || '');
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT * FROM public."CommunicationTemplate" WHERE "tenantId"=$1 AND ($2='' OR "vertical"=$2) ORDER BY "vertical","event"
  `, ctx(req).tenantId,vertical);
  ok(res, rows);
}));

router.post('/communications/templates', requirePermission('communications.manage'), asyncHandler(async (req, res) => {
  const b = communicationTemplateSchema.parse(req.body || {});
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    INSERT INTO public."CommunicationTemplate" ("id","tenantId","channel","vertical","event","name","body","variables","active","createdAt","updatedAt")
    VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7::jsonb,$8,now(),now())
    ON CONFLICT ("tenantId","channel","vertical","event") DO UPDATE SET "name"=EXCLUDED."name","body"=EXCLUDED."body","variables"=EXCLUDED."variables","active"=EXCLUDED."active","updatedAt"=now()
    RETURNING *
  `, ctx(req).tenantId,b.channel,b.vertical,b.event,b.name,b.body,JSON.stringify(b.variables),b.active);
  ok(res, one(rows), 201);
}));

router.post('/communications/render', requirePermission('communications.manage'), asyncHandler(async (req, res) => {
  const body = communicationRenderSchema.parse(req.body || {});
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT * FROM public."CommunicationTemplate" WHERE "tenantId"=$1 AND "channel"='whatsapp' AND "vertical"=$2 AND "event"=$3 AND "active"=true LIMIT 1
  `, ctx(req).tenantId,body.vertical,body.event);
  const template = one(rows, 'Plantilla de WhatsApp no encontrada.');
  const rendered = Object.entries(body.values).reduce((text,[key,value]) => text.replaceAll(`{{${key}}}`, String(value ?? '')), String(template.body));
  ok(res, { templateId:template.id, rendered, whatsappUrl:`https://wa.me/?text=${encodeURIComponent(rendered)}` });
}));

export default router;
