import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { ctx, one } from './verticals.shared.js';
import {
  observationSchema,
  procedureSchema,
  communicationSchema
} from './veterinary.schemas.js';

const router = Router();

const referenceNumber = (prefix: string) => `${prefix}-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`;

router.get('/observations', asyncHandler(async (req, res) => {
  const hospitalizationId = String(req.query.hospitalizationId || '');
  if (!hospitalizationId) throw new HttpError(422, 'hospitalizationId es obligatorio.');
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT o.*,pr."fullName" AS "professionalName" FROM public."CareHospitalObservation" o
    JOIN public."CareHospitalization" h ON h."id"=o."hospitalizationId" AND h."tenantId"=o."tenantId"
    LEFT JOIN public."CareProfessional" pr ON pr."id"=o."professionalId" AND pr."tenantId"=o."tenantId"
    WHERE o."tenantId"=$1 AND o."hospitalizationId"=$2 ORDER BY o."observedAt" DESC LIMIT 2000
  `, ctx(req).tenantId, hospitalizationId);
  ok(res, rows);
}));

router.post('/observations', asyncHandler(async (req, res) => {
  const b = observationSchema.parse(req.body || {});
  const tenantId=ctx(req).tenantId;
  if(b.professionalId){
    const professionals=await prisma.$queryRawUnsafe<any[]>(`SELECT "id" FROM public."CareProfessional" WHERE "tenantId"=$1 AND "id"=$2 LIMIT 1`,tenantId,b.professionalId);
    if(!professionals.length)throw new HttpError(422,'El profesional no pertenece al tenant activo.');
  }
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    INSERT INTO public."CareHospitalObservation" ("id","tenantId","hospitalizationId","professionalId","observedAt","type","values","note","createdAt")
    SELECT gen_random_uuid()::text,$1,h."id",$3,COALESCE($4::timestamptz,now()),$5,$6::jsonb,$7,now()
    FROM public."CareHospitalization" h WHERE h."id"=$2 AND h."tenantId"=$1 AND h."status" IN ('admitted','observed') RETURNING *
  `, ctx(req).tenantId, b.hospitalizationId, b.professionalId || null, b.observedAt || null, b.type, JSON.stringify(b.values), b.note || null);
  ok(res, one(rows, 'Hospitalización activa no encontrada.'), 201);
}));

router.get('/procedures', asyncHandler(async (req, res) => {
  const patientId = String(req.query.patientId || '');
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT c.*,p."displayName" AS "patientName",pr."fullName" AS "professionalName"
    FROM public."CareProcedure" c JOIN public."CarePatient" p ON p."id"=c."patientId" AND p."kind"='animal'
    LEFT JOIN public."CareProfessional" pr ON pr."id"=c."professionalId"
    WHERE c."tenantId"=$1 AND ($2='' OR c."patientId"=$2) ORDER BY COALESCE(c."performedAt",c."scheduledAt",c."createdAt") DESC LIMIT 1000
  `, ctx(req).tenantId, patientId);
  ok(res, rows);
}));

router.post('/procedures', asyncHandler(async (req, res) => {
  const b = procedureSchema.parse(req.body || {});
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    INSERT INTO public."CareProcedure" ("id","tenantId","patientId","encounterId","professionalId","name","kind","status","scheduledAt","performedAt","anesthesia","notes","outcome","createdAt","updatedAt")
    SELECT gen_random_uuid()::text,$1,p."id",$3,$4,$5,$6,$7,$8::timestamptz,$9::timestamptz,$10,$11,$12,now(),now()
    FROM public."CarePatient" p WHERE p."id"=$2 AND p."tenantId"=$1 AND p."kind"='animal' RETURNING *
  `, ctx(req).tenantId, b.patientId, b.encounterId || null, b.professionalId || null, b.name, b.kind, b.status, b.scheduledAt || null, b.performedAt || null, b.anesthesia || null, b.notes || null, b.outcome || null);
  ok(res, one(rows, 'Mascota no encontrada.'), 201);
}));

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
