import { Router } from 'express';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, ok } from '../../shared/http.js';
import { ctx, one } from './verticals.shared.js';
import { communicationSchema } from './veterinary.schemas.js';

const router = Router();

router.get('/communications', asyncHandler(async (req, res) => {
  const patientId = String(req.query.patientId || '');
  const appointmentId = String(req.query.appointmentId || '');
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT l.*,p."displayName" AS "patientName" FROM public."CareCommunicationLog" l
    LEFT JOIN public."CarePatient" p ON p."id"=l."patientId"
    WHERE l."tenantId"=$1 AND ($2='' OR l."patientId"=$2) AND ($3='' OR l."appointmentId"=$3)
    ORDER BY l."createdAt" DESC LIMIT 1000
  `, ctx(req).tenantId, patientId, appointmentId);
  ok(res, rows);
}));

router.post('/communications', asyncHandler(async (req, res) => {
  const b = communicationSchema.parse(req.body || {});
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    INSERT INTO public."CareCommunicationLog" ("id","tenantId","patientId","appointmentId","channel","event","recipient","templateId","status","scheduledAt","sentAt","providerMessageId","payload","error","createdAt")
    VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8,$9::timestamptz,$10::timestamptz,$11,$12::jsonb,$13,now()) RETURNING *
  `, ctx(req).tenantId, b.patientId || null, b.appointmentId || null, b.channel, b.event, b.recipient, b.templateId || null, b.status, b.scheduledAt || null, b.sentAt || null, b.providerMessageId || null, JSON.stringify(b.payload), b.error || null);
  ok(res, one(rows), 201);
}));

export default router;
