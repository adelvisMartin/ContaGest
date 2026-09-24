import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { ctx, one } from './verticals.shared.js';
import {
  hospitalizationSchema,
  hospitalizationStatusSchema
} from './veterinary.schemas.js';

const router = Router();

const referenceNumber = (prefix: string) => `${prefix}-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`;

router.get('/hospitalizations', asyncHandler(async (req, res) => {
  const patientId = String(req.query.patientId || '');
  const status = String(req.query.status || '');
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT h.*, p."displayName" AS "patientName", p."species", p."breed", pr."fullName" AS "professionalName",
      count(o."id")::int AS "observationCount"
    FROM public."CareHospitalization" h JOIN public."CarePatient" p ON p."id"=h."patientId" AND p."kind"='animal'
    LEFT JOIN public."CareProfessional" pr ON pr."id"=h."professionalId" AND pr."tenantId"=h."tenantId"
    LEFT JOIN public."CareHospitalObservation" o ON o."hospitalizationId"=h."id"
    WHERE h."tenantId"=$1 AND ($2='' OR h."patientId"=$2) AND ($3='' OR h."status"=$3)
    GROUP BY h."id",p."displayName",p."species",p."breed",pr."fullName"
    ORDER BY h."admittedAt" DESC LIMIT 1000
  `, ctx(req).tenantId, patientId, status);
  ok(res, rows);
}));

router.post('/hospitalizations', asyncHandler(async (req, res) => {
  const b = hospitalizationSchema.parse(req.body || {});
  const tenantId=ctx(req).tenantId;
  if(b.professionalId){
    const professionals=await prisma.$queryRawUnsafe<any[]>(`SELECT "id" FROM public."CareProfessional" WHERE "tenantId"=$1 AND "id"=$2 LIMIT 1`,tenantId,b.professionalId);
    if(!professionals.length)throw new HttpError(422,'El profesional no pertenece al tenant activo.');
  }
  if(b.encounterId){
    const encounters=await prisma.$queryRawUnsafe<any[]>(`SELECT "id" FROM public."CareEncounter" WHERE "tenantId"=$1 AND "id"=$2 AND "patientId"=$3 LIMIT 1`,tenantId,b.encounterId,b.patientId);
    if(!encounters.length)throw new HttpError(422,'El encuentro no pertenece a la mascota hospitalizada.');
  }
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    INSERT INTO public."CareHospitalization" ("id","tenantId","patientId","encounterId","professionalId","admissionNumber","admittedAt","ward","cage","reason","diagnosis","status","carePlan","createdAt","updatedAt")
    SELECT gen_random_uuid()::text,$1,p."id",$3,$4,$5,COALESCE($6::timestamptz,now()),$7,$8,$9,$10,$11,$12::jsonb,now(),now()
    FROM public."CarePatient" p WHERE p."id"=$2 AND p."tenantId"=$1 AND p."kind"='animal' RETURNING *
  `, ctx(req).tenantId, b.patientId, b.encounterId || null, b.professionalId || null, referenceNumber('VET-HOSP'), b.admittedAt || null, b.ward || null, b.cage || null, b.reason, b.diagnosis || null, b.status, JSON.stringify(b.carePlan));
  ok(res, one(rows, 'Mascota no encontrada.'), 201);
}));

router.patch('/hospitalizations/:id/status', asyncHandler(async (req, res) => {
  const b = hospitalizationStatusSchema.parse(req.body || {});
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    UPDATE public."CareHospitalization" SET "status"=$3,"dischargedAt"=CASE WHEN $3='discharged' THEN COALESCE($4::timestamptz,now()) ELSE "dischargedAt" END,"diagnosis"=COALESCE($5,"diagnosis"),"updatedAt"=now()
    WHERE "id"=$1 AND "tenantId"=$2 RETURNING *
  `, req.params.id, ctx(req).tenantId, b.status, b.dischargedAt || null, b.diagnosis || null);
  ok(res, one(rows, 'Hospitalización no encontrada.'));
}));

export default router;
