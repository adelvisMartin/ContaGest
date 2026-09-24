import { Router } from 'express';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requirePermission } from '../../shared/middleware/context.js';
import { ctx, one, num } from './verticals.shared.js';
import {
  memberSchema,
  trainerSchema,
  planSchema,
  membershipSchema,
  checkInSchema,
  assessmentSchema
} from './gym.schemas.js';

const router = Router();

router.get('/gym/summary', requirePermission('gym.manage'), asyncHandler(async (req, res) => {
  const tenantId = ctx(req).tenantId;
  const [members, memberships, checkins, revenue] = await Promise.all([
    prisma.$queryRawUnsafe<any[]>(`SELECT count(*)::int AS total, count(*) FILTER (WHERE "status"='active')::int AS active FROM public."GymMember" WHERE "tenantId"=$1`, tenantId),
    prisma.$queryRawUnsafe<any[]>(`SELECT count(*)::int AS active, count(*) FILTER (WHERE "endsAt" <= now()+interval '7 days')::int AS expiring FROM public."GymMembership" WHERE "tenantId"=$1 AND "status"='active'`, tenantId),
    prisma.$queryRawUnsafe<any[]>(`SELECT count(*)::int AS total FROM public."GymCheckIn" WHERE "tenantId"=$1 AND "checkedInAt">=date_trunc('day',now())`, tenantId),
    prisma.$queryRawUnsafe<any[]>(`SELECT COALESCE(sum("amount"),0) AS total FROM public."GymPayment" WHERE "tenantId"=$1 AND "status"='paid' AND "paidAt">=date_trunc('month',now())`, tenantId)
  ]);
  ok(res, { members:members[0]||{}, memberships:memberships[0]||{}, checkinsToday:num(checkins[0]?.total), revenueThisMonth:num(revenue[0]?.total) });
}));

router.get('/gym/members', requirePermission('gym.manage'), asyncHandler(async (req, res) => {
  const q = `%${String(req.query.q || '').trim()}%`;
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT m.*, ms."endsAt" AS "membershipEndsAt", ms."status" AS "membershipStatus", p."name" AS "planName"
    FROM public."GymMember" m
    LEFT JOIN LATERAL (SELECT * FROM public."GymMembership" x WHERE x."memberId"=m."id" ORDER BY x."createdAt" DESC LIMIT 1) ms ON true
    LEFT JOIN public."GymMembershipPlan" p ON p."id"=ms."planId"
    WHERE m."tenantId"=$1 AND ($2='%%' OR m."fullName" ILIKE $2 OR m."memberCode" ILIKE $2 OR COALESCE(m."email",'') ILIKE $2)
    ORDER BY m."status", m."fullName" LIMIT 1000
  `, ctx(req).tenantId, q);
  ok(res, rows);
}));

router.post('/gym/members', requirePermission('gym.manage'), asyncHandler(async (req, res) => {
  const b = memberSchema.parse(req.body || {});
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    INSERT INTO public."GymMember" ("id","tenantId","userId","memberCode","fullName","email","phone","birthDate","sex","photoUrl","emergencyContact","goals","medicalNotes","status","joinedAt","createdAt","updatedAt")
    VALUES (gen_random_uuid()::text,$1,NULL,$2,$3,$4,$5,$6::date,$7,$8,$9::jsonb,$10::jsonb,$11,$12,now(),now(),now()) RETURNING *
  `, ctx(req).tenantId,b.memberCode,b.fullName,b.email||null,b.phone||null,b.birthDate||null,b.sex||null,b.photoUrl||null,JSON.stringify(b.emergencyContact),JSON.stringify(b.goals),b.medicalNotes||null,b.status);
  ok(res, one(rows), 201);
}));

router.get('/gym/trainers', requirePermission('gym.manage'), asyncHandler(async (req, res) => {
  const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM public."GymTrainer" WHERE "tenantId"=$1 ORDER BY "status", "fullName"`, ctx(req).tenantId);
  ok(res, rows);
}));

router.post('/gym/trainers', requirePermission('gym.manage'), asyncHandler(async (req, res) => {
  const b = trainerSchema.parse(req.body || {});
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    INSERT INTO public."GymTrainer" ("id","tenantId","userId","fullName","email","phone","specialties","status","createdAt","updatedAt")
    VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6::jsonb,$7,now(),now()) RETURNING *
  `, ctx(req).tenantId,ctx(req).userId||null,b.fullName,b.email||null,b.phone||null,JSON.stringify(b.specialties),b.status);
  ok(res, one(rows), 201);
}));

router.get('/gym/plans', requirePermission('gym.manage'), asyncHandler(async (req, res) => {
  const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM public."GymMembershipPlan" WHERE "tenantId"=$1 ORDER BY "active" DESC, "price" ASC`, ctx(req).tenantId);
  ok(res, rows);
}));

router.post('/gym/plans', requirePermission('gym.manage'), asyncHandler(async (req, res) => {
  const b = planSchema.parse(req.body || {});
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    INSERT INTO public."GymMembershipPlan" ("id","tenantId","name","durationDays","price","currency","accessLimit","classLimit","active","metadata","createdAt","updatedAt")
    VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,now(),now()) RETURNING *
  `, ctx(req).tenantId,b.name,b.durationDays,b.price,b.currency,b.accessLimit||null,b.classLimit||null,b.active,JSON.stringify(b.metadata));
  ok(res, one(rows), 201);
}));

router.post('/gym/memberships', requirePermission('gym.manage'), asyncHandler(async (req, res) => {
  const b = membershipSchema.parse(req.body || {});
  const planRows = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM public."GymMembershipPlan" WHERE "id"=$1 AND "tenantId"=$2 LIMIT 1`, b.planId, ctx(req).tenantId);
  const plan = one(planRows, 'Plan no encontrado.');
  const start = new Date(b.startsAt);
  const end = b.endsAt ? new Date(b.endsAt) : new Date(start.getTime() + Number(plan.durationDays) * 86400000);
  await prisma.$executeRawUnsafe(`UPDATE public."GymMembership" SET "status"='expired', "updatedAt"=now() WHERE "tenantId"=$1 AND "memberId"=$2 AND "status"='active'`, ctx(req).tenantId, b.memberId);
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    INSERT INTO public."GymMembership" ("id","tenantId","memberId","planId","startsAt","endsAt","status","remainingAccesses","balance","autoRenew","createdAt","updatedAt")
    VALUES (gen_random_uuid()::text,$1,$2,$3,$4::timestamptz,$5::timestamptz,'active',$6,$7,$8,now(),now()) RETURNING *
  `, ctx(req).tenantId,b.memberId,b.planId,start.toISOString(),end.toISOString(),plan.accessLimit||null,b.balance,b.autoRenew);
  ok(res, one(rows), 201);
}));

router.post('/gym/checkins', requirePermission('gym.manage'), asyncHandler(async (req, res) => {
  const b = checkInSchema.parse(req.body || {});
  const membershipRows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT * FROM public."GymMembership" WHERE "tenantId"=$1 AND "memberId"=$2 AND "status"='active' AND "startsAt"<=now() AND "endsAt">=now() ORDER BY "endsAt" DESC LIMIT 1
  `, ctx(req).tenantId,b.memberId);
  const membership = membershipRows[0];
  const result = membership ? 'accepted' : 'rejected';
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    INSERT INTO public."GymCheckIn" ("id","tenantId","memberId","membershipId","checkedInAt","method","device","result","notes")
    VALUES (gen_random_uuid()::text,$1,$2,$3,now(),$4,$5,$6,$7) RETURNING *
  `, ctx(req).tenantId,b.memberId,membership?.id||null,b.method,b.device||null,result,b.notes||null);
  if (membership?.remainingAccesses != null) {
    await prisma.$executeRawUnsafe(`UPDATE public."GymMembership" SET "remainingAccesses"=GREATEST(0,"remainingAccesses"-1), "updatedAt"=now() WHERE "id"=$1`, membership.id);
  }
  ok(res, { ...one(rows), membershipValid:Boolean(membership) }, membership ? 201 : 200);
}));

router.get('/gym/assessments', requirePermission('gym.manage'), asyncHandler(async (req, res) => {
  const memberId = String(req.query.memberId || '');
  if (!memberId) throw new HttpError(422, 'memberId es obligatorio.');
  const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM public."GymAssessment" WHERE "tenantId"=$1 AND "memberId"=$2 ORDER BY "measuredAt" DESC LIMIT 500`, ctx(req).tenantId,memberId);
  ok(res, rows);
}));

router.post('/gym/assessments', requirePermission('gym.manage'), asyncHandler(async (req, res) => {
  const tenantId=ctx(req).tenantId;
  const b = assessmentSchema.parse(req.body || {});
  const memberRows=await prisma.$queryRawUnsafe<any[]>(`
    SELECT "id" FROM public."GymMember"
    WHERE "tenantId"=$1 AND "id"=$2
    LIMIT 1
  `,tenantId,b.memberId);
  if(!memberRows.length)throw new HttpError(422,'El cliente no pertenece al tenant activo.');
  if(b.trainerId){
    const trainerRows=await prisma.$queryRawUnsafe<any[]>(`
      SELECT "id" FROM public."GymTrainer"
      WHERE "tenantId"=$1 AND "id"=$2
      LIMIT 1
    `,tenantId,b.trainerId);
    if(!trainerRows.length)throw new HttpError(422,'El entrenador no pertenece al tenant activo.');
  }
  const bmi = b.weightKg && b.heightCm ? Number((b.weightKg / Math.pow(b.heightCm / 100, 2)).toFixed(2)) : null;
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    INSERT INTO public."GymAssessment" ("id","tenantId","memberId","trainerId","measuredAt","weightKg","heightCm","bodyFatPct","muscleMassKg","visceralFat","bmi","waistCm","hipCm","chestCm","armCm","thighCm","restingHeartRate","notes","createdAt")
    VALUES (gen_random_uuid()::text,$1,$2,$3,COALESCE($4::timestamptz,now()),$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,now()) RETURNING *
  `, tenantId,b.memberId,b.trainerId||null,b.measuredAt||null,b.weightKg||null,b.heightCm||null,b.bodyFatPct||null,b.muscleMassKg||null,b.visceralFat||null,bmi,b.waistCm||null,b.hipCm||null,b.chestCm||null,b.armCm||null,b.thighCm||null,b.restingHeartRate||null,b.notes||null);
  ok(res, one(rows), 201);
}));


export default router;
