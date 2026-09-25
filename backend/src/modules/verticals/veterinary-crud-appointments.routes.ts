import { Router } from 'express';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { veterinaryAppointmentPatchSchema } from './veterinary.schemas.js';

const router = Router();
const ctx = (req: any) => req.context as { tenantId: string };
function changed<T extends Record<string, unknown>>(body: T, key: keyof T) {
  return Object.prototype.hasOwnProperty.call(body, key);
}

router.patch('/health/appointments/:id', asyncHandler(async (req, res) => {
  const b = veterinaryAppointmentPatchSchema.parse(req.body || {});
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    UPDATE public."CareAppointment" SET
      "patientId"=CASE WHEN $3 THEN $4 ELSE "patientId" END,
      "professionalId"=CASE WHEN $5 THEN $6 ELSE "professionalId" END,
      "startsAt"=CASE WHEN $7 THEN $8::timestamptz ELSE "startsAt" END,
      "endsAt"=CASE WHEN $9 THEN $10::timestamptz ELSE "endsAt" END,
      "type"=CASE WHEN $11 THEN $12 ELSE "type" END,
      "status"=CASE WHEN $13 THEN $14 ELSE "status" END,
      "reason"=CASE WHEN $15 THEN $16 ELSE "reason" END,
      "channel"=CASE WHEN $17 THEN $18 ELSE "channel" END,
      "room"=CASE WHEN $19 THEN $20 ELSE "room" END,
      "notes"=CASE WHEN $21 THEN $22 ELSE "notes" END,
      "updatedAt"=now()
    WHERE "id"=$1 AND "tenantId"=$2 RETURNING *
  `,
  req.params.id, ctx(req).tenantId,
  changed(b,'patientId'), b.patientId ?? null,
  changed(b,'professionalId'), b.professionalId ?? null,
  changed(b,'startsAt'), b.startsAt ?? null,
  changed(b,'endsAt'), b.endsAt ?? null,
  changed(b,'type'), b.type ?? null,
  changed(b,'status'), b.status ?? null,
  changed(b,'reason'), b.reason ?? null,
  changed(b,'channel'), b.channel ?? null,
  changed(b,'room'), b.room ?? null,
  changed(b,'notes'), b.notes ?? null);
  if (!rows.length) throw new HttpError(404, 'Cita no encontrada.');
  ok(res, rows[0]);
}));

router.delete('/health/appointments/:id', asyncHandler(async (req, res) => {
  const refs = await prisma.$queryRawUnsafe<Array<{encounters:number; communications:number}>>(`
    SELECT
      (SELECT count(*)::int FROM public."CareEncounter" WHERE "tenantId"=$2 AND "appointmentId"=$1) AS encounters,
      (SELECT count(*)::int FROM public."CareCommunicationLog" WHERE "tenantId"=$2 AND "appointmentId"=$1) AS communications
  `, req.params.id, ctx(req).tenantId);
  const linked = Number(refs[0]?.encounters || 0) + Number(refs[0]?.communications || 0);
  if (linked > 0) {
    const rows = await prisma.$queryRawUnsafe<any[]>(`
      UPDATE public."CareAppointment" SET "status"='cancelled',"updatedAt"=now()
      WHERE "id"=$1 AND "tenantId"=$2 RETURNING *
    `, req.params.id, ctx(req).tenantId);
    if (!rows.length) throw new HttpError(404, 'Cita no encontrada.');
    return ok(res, { deleted:false, archived:true, reason:'La cita tiene trazabilidad clínica o comunicaciones asociadas.' });
  }
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    DELETE FROM public."CareAppointment" WHERE "id"=$1 AND "tenantId"=$2 RETURNING "id"
  `, req.params.id, ctx(req).tenantId);
  if (!rows.length) throw new HttpError(404, 'Cita no encontrada.');
  ok(res, { deleted:true, id:rows[0].id });
}));

export default router;
