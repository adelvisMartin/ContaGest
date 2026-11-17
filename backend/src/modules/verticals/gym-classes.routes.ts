import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requirePermission } from '../../shared/middleware/context.js';
import { ctx, one } from './verticals.shared.js';
import { classSchema } from './gym.schemas.js';

const router = Router();

router.get('/gym/classes', requirePermission('gym.manage'), asyncHandler(async (req, res) => {
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT c.*, t."fullName" AS "trainerName", count(b."id") FILTER (WHERE b."status"='booked')::int AS bookings
    FROM public."GymClass" c
    LEFT JOIN public."GymTrainer" t ON t."tenantId"=c."tenantId" AND t."id"=c."trainerId"
    LEFT JOIN public."GymClassBooking" b ON b."tenantId"=c."tenantId" AND b."classId"=c."id"
    WHERE c."tenantId"=$1 AND c."startsAt">=now()-interval '1 day' GROUP BY c."id",t."fullName" ORDER BY c."startsAt" LIMIT 500
  `, ctx(req).tenantId);
  ok(res, rows);
}));

router.post('/gym/classes', requirePermission('gym.manage'), asyncHandler(async (req, res) => {
  const b = classSchema.parse(req.body || {});
  const tenantId = ctx(req).tenantId;
  const start = new Date(b.startsAt), end = new Date(b.endsAt);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start)
    throw new HttpError(422, 'El horario de la clase no es válido.');
  const location = b.location?.trim() || null;
  // Stable tenant-scoped lock order serializes room/trainer collisions.
  const locks = [
    ...(b.trainerId ? [`gym:class:${tenantId}:trainer:${b.trainerId}`] : []),
    ...(location ? [`gym:class:${tenantId}:location:${location.toLowerCase()}`] : [])
  ].sort();
  const saved = await prisma.$transaction(async tx => {
    for (const lock of locks) {
      await tx.$queryRawUnsafe<Array<{locked:string}>>(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))::text AS locked',lock
      );
    }
    if (b.trainerId) {
      const trainers = await tx.$queryRawUnsafe<Array<{id:string;status:string}>>(
        'SELECT "id","status" FROM public."GymTrainer" WHERE "tenantId"=$1 AND "id"=$2 FOR SHARE',
        tenantId,b.trainerId
      );
      if (!trainers.length) throw new HttpError(404, 'Instructor no encontrado en esta empresa.');
      if (trainers[0].status !== 'active') throw new HttpError(409, 'El instructor no está disponible.');
    }
    if (locks.length) {
      const conflict = await tx.$queryRawUnsafe<Array<{id:string}>>(`
        SELECT "id" FROM public."GymClass"
        WHERE "tenantId"=$1 AND "status"='scheduled'
          AND "startsAt"<$3::timestamptz AND "endsAt">$2::timestamptz
          AND (($4::text IS NOT NULL AND "trainerId"=$4)
            OR ($5::text IS NOT NULL AND lower(trim("location"))=lower($5)))
        LIMIT 1
      `,tenantId,start.toISOString(),end.toISOString(),b.trainerId||null,location?.toLowerCase()||null);
      if (conflict.length) throw new HttpError(409, 'El instructor o la sala ya tiene una clase en ese horario.');
    }
    const rows = await tx.$queryRawUnsafe<any[]>(`
      INSERT INTO public."GymClass" ("id","tenantId","trainerId","name","startsAt","endsAt","capacity","location","status","createdAt","updatedAt")
      VALUES (gen_random_uuid()::text,$1,$2,$3,$4::timestamptz,$5::timestamptz,$6,$7,'scheduled',now(),now()) RETURNING *
    `,tenantId,b.trainerId||null,b.name,start.toISOString(),end.toISOString(),b.capacity,location);
    return one(rows);
  }, {isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted});
  ok(res, saved, 201);
}));

export default router;
