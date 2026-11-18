import { Router } from 'express';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { ctx, one } from './verticals.shared.js';
import { communicationSchema } from './veterinary.schemas.js';

const router = Router();

router.get('/communications', asyncHandler(async (req, res) => {
  const patientId = String(req.query.patientId || '');
  const appointmentId = String(req.query.appointmentId || '');
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT l.*,p."displayName" AS "patientName" FROM public."CareCommunicationLog" l
    LEFT JOIN public."CarePatient" p
      ON p."id"=l."patientId" AND p."tenantId"=l."tenantId" AND p."kind"='animal'
    WHERE l."tenantId"=$1 AND ($2='' OR l."patientId"=$2) AND ($3='' OR l."appointmentId"=$3)
    ORDER BY l."createdAt" DESC LIMIT 1000
  `, ctx(req).tenantId, patientId, appointmentId);
  ok(res, rows);
}));

router.post('/communications', asyncHandler(async (req, res) => {
  const b = communicationSchema.parse(req.body || {});
  const tenantId = ctx(req).tenantId;
  const created = await prisma.$transaction(async tx => {
    let patientId: string | null = b.patientId || null;
    // A supplied patient reference is not authorization. Lock the tenant-owned
    // animal record so a concurrent archive/update cannot change its identity.
    if (patientId) {
      const patients = await tx.$queryRawUnsafe<Array<{id:string}>>(`
        SELECT "id" FROM public."CarePatient"
        WHERE "tenantId"=$1 AND "id"=$2 AND "kind"='animal'
        FOR SHARE
      `, tenantId, patientId);
      if (patients.length !== 1)
        throw new HttpError(422, 'La mascota no pertenece a la empresa activa.');
    }
    if (b.appointmentId) {
      // Also validate the booking's patient, not merely the appointment ID.
      const appointments = await tx.$queryRawUnsafe<Array<{id:string;patientId:string}>>(`
        SELECT a."id",a."patientId" FROM public."CareAppointment" a
        JOIN public."CarePatient" p
          ON p."id"=a."patientId" AND p."tenantId"=a."tenantId" AND p."kind"='animal'
        WHERE a."tenantId"=$1 AND a."id"=$2
        FOR SHARE OF a,p
      `, tenantId, b.appointmentId);
      if (appointments.length !== 1)
        throw new HttpError(422, 'La cita veterinaria no pertenece a la empresa activa.');
      if (patientId && appointments[0].patientId !== patientId)
        throw new HttpError(409, 'La cita no corresponde a la mascota indicada.');
      patientId = appointments[0].patientId;
    }
    const rows = await tx.$queryRawUnsafe<any[]>(`
      INSERT INTO public."CareCommunicationLog"
        ("id","tenantId","patientId","appointmentId","channel","event","recipient",
         "templateId","status","scheduledAt","sentAt","providerMessageId","payload","error","createdAt")
      VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8,$9::timestamptz,
              $10::timestamptz,$11,$12::jsonb,$13,now())
      RETURNING *
    `, tenantId, patientId, b.appointmentId || null, b.channel, b.event, b.recipient,
      b.templateId || null, b.status, b.scheduledAt || null, b.sentAt || null,
      b.providerMessageId || null, JSON.stringify(b.payload), b.error || null);
    return one(rows);
  });
  ok(res, created, 201);
}));

export default router;
