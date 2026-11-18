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
    JOIN public."GymMember" m ON m."tenantId" = p."tenantId" AND m."id" = p."memberId"
    WHERE p."tenantId" = $1 AND ($2 = '' OR p."memberId" = $2)
    ORDER BY p."paidAt" DESC
    LIMIT 1000
  `, context(req).tenantId, memberId);
  ok(res, rows);
}));

router.post('/gym/payments', requirePermission('gym.manage'), asyncHandler(async (req, res) => {
  const body = gymPaymentSchema.parse(req.body || {});
  const tenantId = context(req).tenantId;
  // Posting a payment and applying its membership balance effect are one
  // transaction. Lock the tenant/member-owned membership before either write.
  const payment = await prisma.$transaction(async tx => {
    // Some payments do not reference a membership. The member must still
    // belong to the authenticated tenant; a bare foreign member UUID is not
    // sufficient authority to create a payment or store personal data.
    const memberRows = await tx.$queryRawUnsafe<Array<{id:string}>>(
      'SELECT "id" FROM public."GymMember" WHERE "tenantId"=$1 AND "id"=$2 FOR SHARE',
      tenantId,body.memberId
    );
    if (memberRows.length !== 1)
      throw new HttpError(404, 'Miembro no encontrado en esta empresa.');
    if (body.membershipId) {
      const membershipRows = await tx.$queryRawUnsafe<Array<{id:string}>>(`
        SELECT "id" FROM public."GymMembership"
        WHERE "id"=$1 AND "tenantId"=$2 AND "memberId"=$3 FOR UPDATE
      `,body.membershipId,tenantId,body.memberId);
      if (!membershipRows.length)
        throw new HttpError(404, 'Membresía no encontrada para este cliente.');
    }

    const rows = await tx.$queryRawUnsafe<any[]>(`
      INSERT INTO public."GymPayment"
        ("id","tenantId","memberId","membershipId","amount","currency","paidAt",
         "method","reference","status","createdAt")
      VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,
              COALESCE($6::timestamptz,now()),$7,$8,$9,now())
      RETURNING *
    `,tenantId,body.memberId,body.membershipId||null,body.amount,body.currency,
      body.paidAt||null,body.method||null,body.reference||null,body.status);

    if (body.membershipId && body.status === 'paid') {
      const changed = await tx.$executeRawUnsafe(`
        UPDATE public."GymMembership"
        SET "balance"="balance"-$2,"updatedAt"=now()
        WHERE "id"=$1 AND "tenantId"=$3 AND "memberId"=$4
          AND "balance">=$2
      `,body.membershipId,body.amount,tenantId,body.memberId);
      // Do not silently discard overpayments by flooring balance to zero.
      // Until the shared finance authority supports a linked advance/credit,
      // refuse the excess and roll back the just-inserted payment atomically.
      if (changed !== 1)
        throw new HttpError(409, 'El pago excede el saldo pendiente o la membresía cambió.');
    }
    return one(rows);
  });
  ok(res,payment,201);
}));

router.get('/gym/classes/:classId/bookings', requirePermission('gym.manage'), asyncHandler(async (req, res) => {
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT b.*, m."fullName" AS "memberName", m."memberCode"
    FROM public."GymClassBooking" b
    JOIN public."GymMember" m ON m."tenantId" = b."tenantId" AND m."id" = b."memberId"
    WHERE b."tenantId" = $1 AND b."classId" = $2
    ORDER BY b."bookedAt" ASC
  `, context(req).tenantId, req.params.classId);
  ok(res, rows);
}));

router.post('/gym/classes/bookings', requirePermission('gym.manage'), asyncHandler(async (req, res) => {
  const body = gymClassBookingSchema.parse(req.body || {});
  const tenantId = context(req).tenantId;
  // Class FOR UPDATE serializes last-seat, cancellation and FIFO promotion.
  const outcome = await prisma.$transaction(async tx => {
    const classRows = await tx.$queryRawUnsafe<Array<{
      id:string;capacity:number;status:string;startsAt:Date;endsAt:Date
    }>>(`
      SELECT "id","capacity","status","startsAt","endsAt" FROM public."GymClass"
      WHERE "id"=$1 AND "tenantId"=$2 FOR UPDATE
    `,body.classId,tenantId);
    const klass = one(classRows, 'Clase no encontrada.');
    const members = await tx.$queryRawUnsafe<Array<{id:string;status:string}>>(
      'SELECT "id","status" FROM public."GymMember" WHERE "tenantId"=$1 AND "id"=$2',
      tenantId,body.memberId
    );
    if (!members.length) throw new HttpError(404, 'Miembro no encontrado en esta empresa.');
    const existingRows = await tx.$queryRawUnsafe<Array<{id:string;status:string}>>(`
      SELECT "id","status" FROM public."GymClassBooking"
      WHERE "tenantId"=$1 AND "classId"=$2 AND "memberId"=$3 FOR UPDATE
    `,tenantId,body.classId,body.memberId);
    const existing=existingRows[0];
    if (existing?.status === body.status) {
      const saved=await tx.$queryRawUnsafe<any[]>(
        'SELECT * FROM public."GymClassBooking" WHERE "tenantId"=$1 AND "id"=$2',
        tenantId,existing.id
      );
      return {booking:one(saved),replayed:true,promotedBookingId:null};
    }
    if (existing?.status==='attended'||existing?.status==='no_show')
      throw new HttpError(409,'La asistencia finalizada no puede reescribirse.');
    // A cancelled class never happened: preserve its booking history, but
    // do not allow a fabricated attended/no_show fact after cancellation.
    if(klass.status==='cancelled'&&['attended','no_show'].includes(body.status))
      throw new HttpError(409,'Una clase cancelada no admite asistencia ni ausencia.');
    // Attendance is a real event, never a prediction. Preserve the ability
    // to backfill historical classes without introducing artificial grace
    // periods, but reject premature attendance and no-show decisions.
    const now = new Date();
    if (body.status==='attended'&&klass.startsAt>now)
      throw new HttpError(409,'No se puede registrar asistencia antes del inicio de la clase.');
    if (body.status==='no_show'&&klass.endsAt>now)
      throw new HttpError(409,'No se puede marcar ausencia antes de finalizar la clase.');
    let desiredStatus:string=body.status;
    if (body.status==='booked') {
      if (existing && !['cancelled','waitlisted'].includes(existing.status))
        throw new HttpError(409,'La reserva no admite reapertura.');
      if (klass.status!=='scheduled'||klass.startsAt<=new Date())
        throw new HttpError(409,'La clase ya no admite reservas.');
      if (members[0].status!=='active')
        throw new HttpError(403,'Miembro no habilitado para reservar.');
      const eligible=await tx.$queryRawUnsafe<Array<{id:string}>>(`
        SELECT "id" FROM public."GymMembership"
        WHERE "tenantId"=$1 AND "memberId"=$2 AND "status"='active'
          AND "startsAt"<=$3::timestamptz AND "endsAt">$3::timestamptz
        ORDER BY "endsAt" DESC LIMIT 1
      `,tenantId,body.memberId,klass.startsAt);
      if (!eligible.length) throw new HttpError(403,'El cliente no tiene membresía válida en la fecha de la clase.');
      const occupied=await tx.$queryRawUnsafe<Array<{taken:number}>>(`
        SELECT count(*)::int AS taken FROM public."GymClassBooking"
        WHERE "tenantId"=$1 AND "classId"=$2 AND "status" IN ('booked','attended')
      `,tenantId,body.classId);
      // FIFO applies only to members still eligible on the class date.
      const firstWaiting=await tx.$queryRawUnsafe<Array<{id:string}>>(`
        SELECT b."id" FROM public."GymClassBooking" b
        JOIN public."GymMember" m ON m."tenantId"=b."tenantId"
          AND m."id"=b."memberId" AND m."status"='active'
        WHERE b."tenantId"=$1 AND b."classId"=$2 AND b."status"='waitlisted'
          AND EXISTS (
            SELECT 1 FROM public."GymMembership" ms
            WHERE ms."tenantId"=b."tenantId" AND ms."memberId"=b."memberId"
              AND ms."status"='active'
              AND ms."startsAt"<=$3::timestamptz AND ms."endsAt">$3::timestamptz
          )
        ORDER BY b."bookedAt",b."id" LIMIT 1 FOR UPDATE OF b
      `,tenantId,body.classId,klass.startsAt);
      if (!Number.isSafeInteger(occupied[0]?.taken))
        throw new HttpError(409,'No es posible confirmar el aforo de la clase.');
      const available=occupied[0].taken<klass.capacity;
      const turn=!firstWaiting.length||firstWaiting[0].id===existing?.id;
      if (!available||!turn) {
        if (!body.allowWaitlist) throw new HttpError(409,'La clase está llena o hay una lista de espera anterior.');
        desiredStatus='waitlisted';
      }
      if (existing?.status===desiredStatus) {
        const rows=await tx.$queryRawUnsafe<any[]>(
          'SELECT * FROM public."GymClassBooking" WHERE "tenantId"=$1 AND "id"=$2',tenantId,existing.id
        );
        return {booking:one(rows),replayed:true,promotedBookingId:null};
      }
    } else if (!existing || !(
      existing.status==='booked' || (existing.status==='waitlisted' && body.status==='cancelled')
    )) {
      throw new HttpError(409,'La reserva debe estar confirmada o en espera para cambiar su estado.');
    }
    const rows=await tx.$queryRawUnsafe<any[]>(`
      INSERT INTO public."GymClassBooking"
        ("id","tenantId","classId","memberId","status","bookedAt","checkInAt")
      VALUES (gen_random_uuid()::text,$1,$2,$3,$4,now(),CASE WHEN $4='attended' THEN now() ELSE NULL END)
      ON CONFLICT ("classId","memberId") DO UPDATE SET
        "status"=EXCLUDED."status",
        "bookedAt"=CASE WHEN public."GymClassBooking"."status"='cancelled' THEN now()
          ELSE public."GymClassBooking"."bookedAt" END,
        "checkInAt"=CASE WHEN EXCLUDED."status"='attended' THEN now() ELSE NULL END
      WHERE public."GymClassBooking"."tenantId"=EXCLUDED."tenantId"
      RETURNING *
    `,tenantId,body.classId,body.memberId,desiredStatus);
    if (!rows.length) throw new HttpError(409,'Conflicto de empresa en reserva.');
    let promotedBookingId:string|null=null;
    if (desiredStatus==='cancelled'&&existing?.status==='booked'
        &&klass.status==='scheduled'&&klass.startsAt>new Date()) {
      const waiting=await tx.$queryRawUnsafe<Array<{id:string}>>(`
        SELECT b."id" FROM public."GymClassBooking" b
        JOIN public."GymMember" m ON m."tenantId"=b."tenantId"
          AND m."id"=b."memberId" AND m."status"='active'
        WHERE b."tenantId"=$1 AND b."classId"=$2 AND b."status"='waitlisted'
          AND EXISTS (
            SELECT 1 FROM public."GymMembership" ms
            WHERE ms."tenantId"=b."tenantId" AND ms."memberId"=b."memberId"
              AND ms."status"='active'
              AND ms."startsAt"<=$3::timestamptz AND ms."endsAt">$3::timestamptz
          )
        ORDER BY b."bookedAt",b."id" LIMIT 1 FOR UPDATE OF b
      `,tenantId,body.classId,klass.startsAt);
      if (waiting.length) {
        const promoted=await tx.$queryRawUnsafe<Array<{id:string}>>(`
          UPDATE public."GymClassBooking" SET "status"='booked'
          WHERE "tenantId"=$1 AND "id"=$2 AND "status"='waitlisted'
          RETURNING "id"
        `,tenantId,waiting[0].id);
        if (promoted.length!==1) throw new HttpError(409,'No fue posible asignar el cupo liberado.');
        promotedBookingId=promoted[0].id;
      }
    }
    return {booking:one(rows),replayed:false,promotedBookingId};
  });
  ok(res,{...outcome.booking,promotedBookingId:outcome.promotedBookingId},outcome.replayed?200:201);
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
