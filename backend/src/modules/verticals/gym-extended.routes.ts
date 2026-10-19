import { Router } from 'express';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requirePermission } from '../../shared/middleware/context.js';
import { ctx as context, one } from './verticals.shared.js';
import { gymClassBookingSchema, gymMembershipStatusSchema, gymPaymentSchema } from './gym.schemas.js';

const router = Router();

router.get('/gym/payments', requirePermission('gym.manage'), asyncHandler(async (req, res) => {
  const memberId = String(req.query.memberId || '');
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT p.*, m."fullName" AS "memberName", m."memberCode"
    FROM public."GymPayment" p
    JOIN public."GymMember" m ON m."id" = p."memberId"
    WHERE p."tenantId" = $1 AND ($2 = '' OR p."memberId" = $2)
    ORDER BY p."paidAt" DESC
    LIMIT 1000
  `, context(req).tenantId, memberId);
  ok(res, rows);
}));

router.post('/gym/payments', requirePermission('gym.manage'), asyncHandler(async (req, res) => {
  const body = gymPaymentSchema.parse(req.body || {});
  const membershipRows = body.membershipId
    ? await prisma.$queryRawUnsafe<any[]>(`
        SELECT "id", "balance" FROM public."GymMembership"
        WHERE "id" = $1 AND "tenantId" = $2 AND "memberId" = $3 LIMIT 1
      `, body.membershipId, context(req).tenantId, body.memberId)
    : [];
  if (body.membershipId && !membershipRows.length) throw new HttpError(404, 'Membresía no encontrada para este cliente.');

  const rows = await prisma.$queryRawUnsafe<any[]>(`
    INSERT INTO public."GymPayment"
      ("id", "tenantId", "memberId", "membershipId", "amount", "currency", "paidAt", "method", "reference", "status", "createdAt")
    VALUES
      (gen_random_uuid()::text, $1, $2, $3, $4, $5, COALESCE($6::timestamptz, now()), $7, $8, $9, now())
    RETURNING *
  `,
    context(req).tenantId,
    body.memberId,
    body.membershipId || null,
    body.amount,
    body.currency,
    body.paidAt || null,
    body.method || null,
    body.reference || null,
    body.status
  );

  if (body.membershipId && body.status === 'paid') {
    await prisma.$executeRawUnsafe(`
      UPDATE public."GymMembership"
      SET "balance" = GREATEST(0, "balance" - $2), "updatedAt" = now()
      WHERE "id" = $1 AND "tenantId" = $3
    `, body.membershipId, body.amount, context(req).tenantId);
  }
  ok(res, one(rows), 201);
}));

router.get('/gym/classes/:classId/bookings', requirePermission('gym.manage'), asyncHandler(async (req, res) => {
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT b.*, m."fullName" AS "memberName", m."memberCode"
    FROM public."GymClassBooking" b
    JOIN public."GymMember" m ON m."id" = b."memberId"
    WHERE b."tenantId" = $1 AND b."classId" = $2
    ORDER BY b."bookedAt" ASC
  `, context(req).tenantId, req.params.classId);
  ok(res, rows);
}));

router.post('/gym/classes/bookings', requirePermission('gym.manage'), asyncHandler(async (req, res) => {
  const body = gymClassBookingSchema.parse(req.body || {});
  const tenantId = context(req).tenantId;
  // PostgreSQL row lock on the class serializes competing last-seat bookings.
  // Count AFTER obtaining the lock, in the same transaction as the write.
  const outcome = await prisma.$transaction(async tx => {
    const classRows = await tx.$queryRawUnsafe<any[]>(`
      SELECT "id","capacity","status" FROM public."GymClass"
      WHERE "id"=$1 AND "tenantId"=$2 LIMIT 1 FOR UPDATE
    `, body.classId, tenantId);
    const gymClass = one(classRows, 'Clase no encontrada.');
    const members = await tx.$queryRawUnsafe<any[]>(`
      SELECT "id" FROM public."GymMember" WHERE "tenantId"=$1 AND "id"=$2 LIMIT 1
    `, tenantId, body.memberId);
    if (!members.length) throw new HttpError(404, 'Miembro no encontrado en esta empresa.');
    const existingRows = await tx.$queryRawUnsafe<any[]>(`
      SELECT * FROM public."GymClassBooking"
      WHERE "tenantId"=$1 AND "classId"=$2 AND "memberId"=$3 LIMIT 1 FOR UPDATE
    `, tenantId, body.classId, body.memberId);
    const existing = existingRows[0];
    if (existing?.status === body.status) return {booking:existing,replayed:true};
    // An attendance record is final; a different status cannot rewrite it.
    if (existing?.status === 'attended') throw new HttpError(409, 'La asistencia registrada no puede modificarse.');
    if (body.status === 'booked') {
      if (existing && existing.status !== 'cancelled') throw new HttpError(409, 'La reserva finalizada no se puede reabrir como nueva.');
      if (gymClass.status !== 'scheduled') throw new HttpError(409, 'La clase no admite nuevas reservas.');
      const membershipRows = await tx.$queryRawUnsafe<any[]>(`
        SELECT "id" FROM public."GymMembership"
        WHERE "tenantId"=$1 AND "memberId"=$2 AND "status"='active'
          AND "startsAt"<=now() AND "endsAt">=now()
        ORDER BY "endsAt" DESC LIMIT 1
      `, tenantId, body.memberId);
      if (!membershipRows.length) throw new HttpError(403, 'El cliente no tiene una membresía activa.');
      const occupied = await tx.$queryRawUnsafe<Array<{taken:number}>>(`
        SELECT count(*)::int AS taken FROM public."GymClassBooking"
        WHERE "tenantId"=$1 AND "classId"=$2 AND "status" IN ('booked','attended')
      `, tenantId, body.classId);
      if (!Number.isSafeInteger(occupied[0]?.taken) ||
          occupied[0].taken >= gymClass.capacity) throw new HttpError(409, 'La clase alcanzó su capacidad máxima.');
    } else if (!existing || existing.status !== 'booked') {
      // Attended/cancelled/no-show cannot silently create a new booking.
      throw new HttpError(409, 'La reserva debe existir y estar confirmada antes de cambiar su estado.');
    }
    const rows = await tx.$queryRawUnsafe<any[]>(`
      INSERT INTO public."GymClassBooking"
        ("id", "tenantId", "classId", "memberId", "status", "bookedAt", "checkInAt")
      VALUES (gen_random_uuid()::text, $1, $2, $3, $4, now(), CASE WHEN $4 = 'attended' THEN now() ELSE NULL END)
      ON CONFLICT ("classId", "memberId") DO UPDATE SET
        "status" = EXCLUDED."status",
        "checkInAt" = CASE WHEN EXCLUDED."status" = 'attended' THEN now() ELSE public."GymClassBooking"."checkInAt" END
      WHERE public."GymClassBooking"."tenantId" = EXCLUDED."tenantId"
      RETURNING *
    `, tenantId, body.classId, body.memberId, body.status);
    if (!rows.length) throw new HttpError(409, 'Conflicto de empresa en reserva.');
    return {booking:one(rows),replayed:false};
  });
  ok(res, outcome.booking, outcome.replayed ? 200 : 201);
}));

router.patch('/gym/memberships/:id/status', requirePermission('gym.manage'), asyncHandler(async (req, res) => {
  const body = gymMembershipStatusSchema.parse(req.body || {});
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    UPDATE public."GymMembership"
    SET "status" = $3,
        "endsAt" = COALESCE($4::timestamptz, "endsAt"),
        "updatedAt" = now()
    WHERE "id" = $1 AND "tenantId" = $2
    RETURNING *
  `, req.params.id, context(req).tenantId, body.status, body.endsAt || null);
  ok(res, one(rows, 'Membresía no encontrada.'));
}));

export default router;
