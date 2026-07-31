import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requireTenant, requirePermission } from '../../shared/middleware/context.js';

const router = Router();
router.use(requireTenant);

const context = (req: any) => req.context as { tenantId: string; userId?: string };
const optionalText = z.string().trim().max(2000).optional().nullable();
const one = <T>(rows: T[], message = 'Registro no encontrado.') => {
  if (!rows.length) throw new HttpError(404, message);
  return rows[0];
};

const prescriptionSchema = z.object({
  patientId: z.string().min(10),
  encounterId: z.string().optional().nullable(),
  professionalId: z.string().optional().nullable(),
  medication: z.string().trim().min(2).max(240),
  dose: optionalText,
  frequency: optionalText,
  duration: optionalText,
  instructions: optionalText,
  status: z.enum(['active', 'completed', 'cancelled']).default('active')
});

const consentSchema = z.object({
  patientId: z.string().min(10),
  kind: z.string().trim().min(2).max(160),
  status: z.enum(['pending', 'signed', 'revoked', 'expired']).default('pending'),
  signerName: optionalText,
  signedAt: z.string().optional().nullable(),
  documentUrl: optionalText,
  metadata: z.record(z.string(), z.unknown()).default({})
});

const paymentSchema = z.object({
  memberId: z.string().min(10),
  membershipId: z.string().optional().nullable(),
  amount: z.coerce.number().positive().max(999999999),
  currency: z.string().trim().min(2).max(10).default('USD'),
  paidAt: z.string().optional(),
  method: z.string().trim().max(80).optional().nullable(),
  reference: z.string().trim().max(160).optional().nullable(),
  status: z.enum(['pending', 'paid', 'void', 'refunded']).default('paid')
});

const bookingSchema = z.object({
  classId: z.string().min(10),
  memberId: z.string().min(10),
  status: z.enum(['booked', 'attended', 'cancelled', 'no_show']).default('booked')
});

const membershipStatusSchema = z.object({
  status: z.enum(['active', 'expired', 'frozen', 'cancelled', 'pending']),
  endsAt: z.string().optional().nullable()
});

router.get('/health/prescriptions', requirePermission('health.manage'), asyncHandler(async (req, res) => {
  const patientId = String(req.query.patientId || '');
  if (!patientId) throw new HttpError(422, 'patientId es obligatorio.');
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT p.*, pr."fullName" AS "professionalName"
    FROM public."CarePrescription" p
    LEFT JOIN public."CareProfessional" pr ON pr."id" = p."professionalId"
    WHERE p."tenantId" = $1 AND p."patientId" = $2
    ORDER BY p."createdAt" DESC
    LIMIT 500
  `, context(req).tenantId, patientId);
  ok(res, rows);
}));

router.post('/health/prescriptions', requirePermission('health.manage'), asyncHandler(async (req, res) => {
  const body = prescriptionSchema.parse(req.body || {});
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    INSERT INTO public."CarePrescription"
      ("id", "tenantId", "patientId", "encounterId", "professionalId", "medication", "dose", "frequency", "duration", "instructions", "status", "createdAt")
    VALUES
      (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
    RETURNING *
  `,
    context(req).tenantId,
    body.patientId,
    body.encounterId || null,
    body.professionalId || null,
    body.medication,
    body.dose || null,
    body.frequency || null,
    body.duration || null,
    body.instructions || null,
    body.status
  );
  ok(res, one(rows), 201);
}));

router.get('/health/consents', requirePermission('health.manage'), asyncHandler(async (req, res) => {
  const patientId = String(req.query.patientId || '');
  if (!patientId) throw new HttpError(422, 'patientId es obligatorio.');
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT * FROM public."CareConsent"
    WHERE "tenantId" = $1 AND "patientId" = $2
    ORDER BY "createdAt" DESC
    LIMIT 500
  `, context(req).tenantId, patientId);
  ok(res, rows);
}));

router.post('/health/consents', requirePermission('health.manage'), asyncHandler(async (req, res) => {
  const body = consentSchema.parse(req.body || {});
  const signedAt = body.status === 'signed' ? body.signedAt || new Date().toISOString() : body.signedAt || null;
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    INSERT INTO public."CareConsent"
      ("id", "tenantId", "patientId", "kind", "status", "signerName", "signedAt", "documentUrl", "metadata", "createdAt")
    VALUES
      (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6::timestamptz, $7, $8::jsonb, now())
    RETURNING *
  `,
    context(req).tenantId,
    body.patientId,
    body.kind,
    body.status,
    body.signerName || null,
    signedAt,
    body.documentUrl || null,
    JSON.stringify(body.metadata)
  );
  ok(res, one(rows), 201);
}));

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
  const body = paymentSchema.parse(req.body || {});
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
  const body = bookingSchema.parse(req.body || {});
  const classRows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT c.*, count(b."id") FILTER (WHERE b."status" = 'booked')::int AS bookings
    FROM public."GymClass" c
    LEFT JOIN public."GymClassBooking" b ON b."classId" = c."id"
    WHERE c."id" = $1 AND c."tenantId" = $2
    GROUP BY c."id"
    LIMIT 1
  `, body.classId, context(req).tenantId);
  const gymClass = one(classRows, 'Clase no encontrada.');
  if (gymClass.status !== 'scheduled') throw new HttpError(409, 'La clase no admite nuevas reservas.');
  if (body.status === 'booked' && Number(gymClass.bookings || 0) >= Number(gymClass.capacity || 0)) {
    throw new HttpError(409, 'La clase alcanzó su capacidad máxima.');
  }

  const membershipRows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT "id" FROM public."GymMembership"
    WHERE "tenantId" = $1 AND "memberId" = $2 AND "status" = 'active'
      AND "startsAt" <= now() AND "endsAt" >= now()
    ORDER BY "endsAt" DESC LIMIT 1
  `, context(req).tenantId, body.memberId);
  if (!membershipRows.length && body.status === 'booked') throw new HttpError(403, 'El cliente no tiene una membresía activa.');

  const rows = await prisma.$queryRawUnsafe<any[]>(`
    INSERT INTO public."GymClassBooking"
      ("id", "tenantId", "classId", "memberId", "status", "bookedAt", "checkInAt")
    VALUES
      (gen_random_uuid()::text, $1, $2, $3, $4, now(), CASE WHEN $4 = 'attended' THEN now() ELSE NULL END)
    ON CONFLICT ("classId", "memberId") DO UPDATE SET
      "status" = EXCLUDED."status",
      "checkInAt" = CASE WHEN EXCLUDED."status" = 'attended' THEN now() ELSE public."GymClassBooking"."checkInAt" END
    RETURNING *
  `, context(req).tenantId, body.classId, body.memberId, body.status);
  ok(res, one(rows), 201);
}));

router.patch('/gym/memberships/:id/status', requirePermission('gym.manage'), asyncHandler(async (req, res) => {
  const body = membershipStatusSchema.parse(req.body || {});
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
