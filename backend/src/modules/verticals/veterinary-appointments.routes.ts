import { Router } from 'express';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { ctx } from './verticals.shared.js';
import {
  appointmentStatusSchema
} from './veterinary.schemas.js';
import { allowedVetAppointmentPreviousStatuses } from './allowed-vet-appointment-transition.js';

const router = Router();

router.patch('/appointments/:id/status', asyncHandler(async (req, res) => {
  const b = appointmentStatusSchema.parse(req.body || {});
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    UPDATE public."CareAppointment" a SET "status"=$3,"reminderStatus"=COALESCE($4,"reminderStatus"),"notes"=COALESCE($5,"notes"),"updatedAt"=now()
    FROM public."CarePatient" p
    WHERE a."id"=$1 AND a."tenantId"=$2 AND p."id"=a."patientId"
      AND p."tenantId"=a."tenantId" AND p."kind"='animal'
      AND a."status"=ANY($6::text[]) RETURNING a.*
  `, req.params.id, ctx(req).tenantId, b.status, b.reminderStatus || null, b.notes || null,
  [...allowedVetAppointmentPreviousStatuses(b.status)]);
  if(!rows.length){
    const existing=await prisma.$queryRawUnsafe<Array<{id:string}>>(`
      SELECT a."id" FROM public."CareAppointment" a
      JOIN public."CarePatient" p ON p."id"=a."patientId" AND p."tenantId"=a."tenantId"
      WHERE a."id"=$1 AND a."tenantId"=$2 AND p."kind"='animal' LIMIT 1
    `,req.params.id,ctx(req).tenantId);
    if(existing.length)throw new HttpError(409,'Transición de estado de cita veterinaria no permitida.');
    throw new HttpError(404,'Cita veterinaria no encontrada.');
  }
  ok(res, rows[0]);
}));

export default router;
