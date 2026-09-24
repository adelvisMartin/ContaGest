import { Router } from 'express';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, ok } from '../../shared/http.js';
import { ctx, one } from './verticals.shared.js';
import {
  appointmentStatusSchema
} from './veterinary.schemas.js';

const router = Router();

router.patch('/appointments/:id/status', asyncHandler(async (req, res) => {
  const b = appointmentStatusSchema.parse(req.body || {});
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    UPDATE public."CareAppointment" a SET "status"=$3,"reminderStatus"=COALESCE($4,"reminderStatus"),"notes"=COALESCE($5,"notes"),"updatedAt"=now()
    FROM public."CarePatient" p
    WHERE a."id"=$1 AND a."tenantId"=$2 AND p."id"=a."patientId" AND p."kind"='animal' RETURNING a.*
  `, req.params.id, ctx(req).tenantId, b.status, b.reminderStatus || null, b.notes || null);
  ok(res, one(rows, 'Cita veterinaria no encontrada.'));
}));

export default router;
