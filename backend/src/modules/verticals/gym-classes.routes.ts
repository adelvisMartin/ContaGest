import { Router } from 'express';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, ok } from '../../shared/http.js';
import { requirePermission } from '../../shared/middleware/context.js';
import { ctx, one } from './verticals.shared.js';
import { classSchema } from './gym.schemas.js';

const router = Router();

router.get('/gym/classes', requirePermission('gym.manage'), asyncHandler(async (req, res) => {
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT c.*, t."fullName" AS "trainerName", count(b."id") FILTER (WHERE b."status"='booked')::int AS bookings
    FROM public."GymClass" c LEFT JOIN public."GymTrainer" t ON t."id"=c."trainerId" LEFT JOIN public."GymClassBooking" b ON b."classId"=c."id"
    WHERE c."tenantId"=$1 AND c."startsAt">=now()-interval '1 day' GROUP BY c."id",t."fullName" ORDER BY c."startsAt" LIMIT 500
  `, ctx(req).tenantId);
  ok(res, rows);
}));

router.post('/gym/classes', requirePermission('gym.manage'), asyncHandler(async (req, res) => {
  const b = classSchema.parse(req.body || {});
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    INSERT INTO public."GymClass" ("id","tenantId","trainerId","name","startsAt","endsAt","capacity","location","status","createdAt","updatedAt")
    VALUES (gen_random_uuid()::text,$1,$2,$3,$4::timestamptz,$5::timestamptz,$6,$7,'scheduled',now(),now()) RETURNING *
  `, ctx(req).tenantId,b.trainerId||null,b.name,b.startsAt,b.endsAt,b.capacity,b.location||null);
  ok(res, one(rows), 201);
}));

export default router;

export default router;
