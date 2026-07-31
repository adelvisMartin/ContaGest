import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requireTenant, requirePermission } from '../../shared/middleware/context.js';

const router = Router();
router.use(requireTenant);

const optionalText = z.string().trim().max(2000).optional().nullable();
const dateText = z.string().min(8).max(40);
const jsonRecord = z.record(z.string(), z.unknown()).default({});
const jsonArray = z.array(z.unknown()).default([]);
const ctx = (req: any) => req.context as { tenantId: string; userId?: string; email?: string };
const one = <T>(rows: T[], message = 'Registro no encontrado.') => {
  if (!rows.length) throw new HttpError(404, message);
  return rows[0];
};
const num = (value: unknown) => Number(value || 0);

const patientSchema = z.object({
  kind: z.enum(['human','animal']).default('human'),
  firstName: optionalText,
  lastName: optionalText,
  displayName: z.string().trim().min(2).max(180),
  idNumber: optionalText,
  birthDate: z.string().optional().nullable(),
  sex: optionalText,
  phone: optionalText,
  email: z.string().email().optional().nullable().or(z.literal('')),
  address: optionalText,
  photoUrl: optionalText,
  species: optionalText,
  breed: optionalText,
  color: optionalText,
  microchip: optionalText,
  guardianName: optionalText,
  guardianPhone: optionalText,
  guardianEmail: z.string().email().optional().nullable().or(z.literal('')),
  emergencyContact: jsonRecord,
  allergies: optionalText,
  conditions: optionalText,
  notes: optionalText,
  active: z.boolean().default(true)
});

const professionalSchema = z.object({
  fullName: z.string().trim().min(2).max(180),
  specialty: z.string().trim().min(2).max(120).default('general'),
  licenseNumber: optionalText,
  email: z.string().email().optional().nullable().or(z.literal('')),
  phone: optionalText,
  status: z.enum(['active','inactive','vacation']).default('active'),
  schedule: jsonRecord
});

const appointmentSchema = z.object({
  patientId: z.string().min(10),
  professionalId: z.string().optional().nullable(),
  startsAt: dateText,
  endsAt: dateText,
  type: z.string().trim().max(120).default('consultation'),
  status: z.enum(['scheduled','confirmed','checked_in','in_progress','completed','cancelled','no_show']).default('scheduled'),
  reason: optionalText,
  channel: z.enum(['onsite','telemedicine','home_visit']).default('onsite'),
  room: optionalText,
  notes: optionalText
});

const encounterSchema = z.object({
  patientId: z.string().min(10),
  professionalId: z.string().optional().nullable(),
  appointmentId: z.string().optional().nullable(),
  specialty: z.string().trim().max(120).default('general'),
  type: z.string().trim().max(120).default('consultation'),
  subjective: optionalText,
  objective: optionalText,
  assessment: optionalText,
  plan: optionalText,
  diagnosisCodes: jsonArray,
  clinicalData: jsonRecord,
  confidential: z.boolean().default(false),
  status: z.enum(['draft','signed','amended','cancelled']).default('draft')
});

const measurementSchema = z.object({
  patientId: z.string().min(10),
  encounterId: z.string().optional().nullable(),
  kind: z.string().trim().min(1).max(100),
  value: z.coerce.number(),
  unit: z.string().trim().min(1).max(40),
  measuredAt: z.string().optional(),
  metadata: jsonRecord
});

const immunizationSchema = z.object({
  patientId: z.string().min(10),
  professionalId: z.string().optional().nullable(),
  vaccine: z.string().trim().min(2).max(180),
  dose: optionalText,
  lot: optionalText,
  administeredAt: z.string().optional(),
  nextDueAt: z.string().optional().nullable(),
  notes: optionalText
});

const memberSchema = z.object({
  memberCode: z.string().trim().min(2).max(80),
  fullName: z.string().trim().min(2).max(180),
  email: z.string().email().optional().nullable().or(z.literal('')),
  phone: optionalText,
  birthDate: z.string().optional().nullable(),
  sex: optionalText,
  photoUrl: optionalText,
  emergencyContact: jsonRecord,
  goals: z.array(z.string().max(100)).default([]),
  medicalNotes: optionalText,
  status: z.enum(['active','inactive','frozen','blocked']).default('active')
});

const trainerSchema = z.object({
  fullName: z.string().trim().min(2).max(180),
  email: z.string().email().optional().nullable().or(z.literal('')),
  phone: optionalText,
  specialties: z.array(z.string().max(120)).default([]),
  status: z.enum(['active','inactive','vacation']).default('active')
});

const planSchema = z.object({
  name: z.string().trim().min(2).max(120),
  durationDays: z.coerce.number().int().min(1).max(3650).default(30),
  price: z.coerce.number().min(0).default(0),
  currency: z.string().trim().max(10).default('USD'),
  accessLimit: z.coerce.number().int().min(1).optional().nullable(),
  classLimit: z.coerce.number().int().min(1).optional().nullable(),
  active: z.boolean().default(true),
  metadata: jsonRecord
});

const membershipSchema = z.object({
  memberId: z.string().min(10),
  planId: z.string().min(10),
  startsAt: dateText,
  endsAt: dateText.optional(),
  autoRenew: z.boolean().default(false),
  balance: z.coerce.number().default(0)
});

const checkInSchema = z.object({
  memberId: z.string().min(10),
  method: z.enum(['manual','qr','barcode','nfc']).default('manual'),
  device: optionalText,
  notes: optionalText
});

const assessmentSchema = z.object({
  memberId: z.string().min(10),
  trainerId: z.string().optional().nullable(),
  measuredAt: z.string().optional(),
  weightKg: z.coerce.number().positive().optional().nullable(),
  heightCm: z.coerce.number().positive().optional().nullable(),
  bodyFatPct: z.coerce.number().min(0).max(100).optional().nullable(),
  muscleMassKg: z.coerce.number().min(0).optional().nullable(),
  visceralFat: z.coerce.number().min(0).optional().nullable(),
  waistCm: z.coerce.number().min(0).optional().nullable(),
  hipCm: z.coerce.number().min(0).optional().nullable(),
  chestCm: z.coerce.number().min(0).optional().nullable(),
  armCm: z.coerce.number().min(0).optional().nullable(),
  thighCm: z.coerce.number().min(0).optional().nullable(),
  restingHeartRate: z.coerce.number().int().min(20).max(260).optional().nullable(),
  notes: optionalText
});

const routineSchema = z.object({
  memberId: z.string().min(10),
  trainerId: z.string().optional().nullable(),
  name: z.string().trim().min(2).max(180),
  goal: optionalText,
  level: z.enum(['beginner','intermediate','advanced']).default('beginner'),
  startsAt: z.string().optional().nullable(),
  endsAt: z.string().optional().nullable(),
  daysPerWeek: z.coerce.number().int().min(1).max(7).default(3),
  notes: optionalText,
  exercises: z.array(z.object({
    exerciseId: z.string().optional().nullable(),
    exerciseName: z.string().trim().min(2).max(180),
    muscleGroup: optionalText,
    equipment: optionalText,
    instructions: optionalText,
    dayOfWeek: z.coerce.number().int().min(1).max(7),
    sortOrder: z.coerce.number().int().min(1).default(1),
    sets: z.coerce.number().int().min(1).max(20).default(3),
    reps: z.string().max(60).default('10'),
    loadKg: z.coerce.number().min(0).optional().nullable(),
    restSeconds: z.coerce.number().int().min(0).max(3600).default(60),
    tempo: optionalText,
    notes: optionalText
  })).default([])
});

const nutritionSchema = z.object({
  memberId: z.string().min(10),
  trainerId: z.string().optional().nullable(),
  name: z.string().trim().min(2).max(180),
  goal: optionalText,
  targetCalories: z.coerce.number().int().min(0).max(20000).optional().nullable(),
  proteinG: z.coerce.number().min(0).optional().nullable(),
  carbsG: z.coerce.number().min(0).optional().nullable(),
  fatG: z.coerce.number().min(0).optional().nullable(),
  waterMl: z.coerce.number().int().min(0).optional().nullable(),
  notes: optionalText,
  startsAt: z.string().optional().nullable(),
  endsAt: z.string().optional().nullable(),
  meals: z.array(z.object({
    mealType: z.string().trim().min(2).max(80),
    plannedAt: z.string().optional().nullable(),
    items: z.array(z.unknown()).default([]),
    calories: z.coerce.number().int().min(0).optional().nullable(),
    proteinG: z.coerce.number().min(0).optional().nullable(),
    carbsG: z.coerce.number().min(0).optional().nullable(),
    fatG: z.coerce.number().min(0).optional().nullable(),
    notes: optionalText
  })).default([])
});

const classSchema = z.object({
  trainerId: z.string().optional().nullable(),
  name: z.string().trim().min(2).max(180),
  startsAt: dateText,
  endsAt: dateText,
  capacity: z.coerce.number().int().min(1).max(1000).default(20),
  location: optionalText
});

const templateSchema = z.object({
  channel: z.enum(['whatsapp','email','sms']).default('whatsapp'),
  vertical: z.enum(['general','health','veterinary','gym']).default('general'),
  event: z.string().trim().min(2).max(100),
  name: z.string().trim().min(2).max(160),
  body: z.string().trim().min(2).max(4000),
  variables: z.array(z.string().max(80)).default([]),
  active: z.boolean().default(true)
});

router.get('/health/summary', requirePermission('health.manage'), asyncHandler(async (req, res) => {
  const tenantId = ctx(req).tenantId;
  const [patients, appointments, dueVaccines, encounters] = await Promise.all([
    prisma.$queryRawUnsafe<any[]>(`SELECT count(*)::int AS total, count(*) FILTER (WHERE "kind"='animal')::int AS animals, count(*) FILTER (WHERE "kind"='human')::int AS humans FROM public."CarePatient" WHERE "tenantId"=$1 AND "active"=true`, tenantId),
    prisma.$queryRawUnsafe<any[]>(`SELECT count(*)::int AS total, count(*) FILTER (WHERE "status" IN ('scheduled','confirmed'))::int AS upcoming FROM public."CareAppointment" WHERE "tenantId"=$1 AND "startsAt" >= date_trunc('day', now()) AND "startsAt" < date_trunc('day', now()) + interval '1 day'`, tenantId),
    prisma.$queryRawUnsafe<any[]>(`SELECT count(*)::int AS total FROM public."CareImmunization" WHERE "tenantId"=$1 AND "nextDueAt" IS NOT NULL AND "nextDueAt" <= now() + interval '30 days'`, tenantId),
    prisma.$queryRawUnsafe<any[]>(`SELECT count(*)::int AS total FROM public."CareEncounter" WHERE "tenantId"=$1 AND "createdAt" >= date_trunc('month', now())`, tenantId)
  ]);
  ok(res, { patients:patients[0] || {}, appointmentsToday:appointments[0] || {}, vaccinesDue:num(dueVaccines[0]?.total), encountersThisMonth:num(encounters[0]?.total) });
}));

router.get('/health/patients', requirePermission('health.manage'), asyncHandler(async (req, res) => {
  const tenantId = ctx(req).tenantId;
  const kind = ['human','animal'].includes(String(req.query.kind)) ? String(req.query.kind) : null;
  const q = `%${String(req.query.q || '').trim()}%`;
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT * FROM public."CarePatient"
    WHERE "tenantId"=$1 AND ($2::text IS NULL OR "kind"=$2)
      AND ($3='%%' OR "displayName" ILIKE $3 OR COALESCE("idNumber",'') ILIKE $3 OR COALESCE("guardianName",'') ILIKE $3)
    ORDER BY "active" DESC, "displayName" ASC LIMIT 500
  `, tenantId, kind, q);
  ok(res, rows);
}));

router.post('/health/patients', requirePermission('health.manage'), asyncHandler(async (req, res) => {
  const tenantId = ctx(req).tenantId;
  const b = patientSchema.parse(req.body || {});
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    INSERT INTO public."CarePatient" ("id","tenantId","kind","firstName","lastName","displayName","idNumber","birthDate","sex","phone","email","address","photoUrl","species","breed","color","microchip","guardianName","guardianPhone","guardianEmail","emergencyContact","allergies","conditions","notes","active","createdAt","updatedAt")
    VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7::date,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20::jsonb,$21,$22,$23,$24,now(),now()) RETURNING *
  `, tenantId,b.kind,b.firstName||null,b.lastName||null,b.displayName,b.idNumber||null,b.birthDate||null,b.sex||null,b.phone||null,b.email||null,b.address||null,b.photoUrl||null,b.species||null,b.breed||null,b.color||null,b.microchip||null,b.guardianName||null,b.guardianPhone||null,b.guardianEmail||null,JSON.stringify(b.emergencyContact),b.allergies||null,b.conditions||null,b.notes||null,b.active);
  ok(res, one(rows), 201);
}));

router.get('/health/professionals', requirePermission('health.manage'), asyncHandler(async (req, res) => {
  const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM public."CareProfessional" WHERE "tenantId"=$1 ORDER BY "status", "fullName"`, ctx(req).tenantId);
  ok(res, rows);
}));

router.post('/health/professionals', requirePermission('health.manage'), asyncHandler(async (req, res) => {
  const b = professionalSchema.parse(req.body || {});
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    INSERT INTO public."CareProfessional" ("id","tenantId","userId","fullName","specialty","licenseNumber","email","phone","status","schedule","createdAt","updatedAt")
    VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,now(),now()) RETURNING *
  `, ctx(req).tenantId,ctx(req).userId||null,b.fullName,b.specialty,b.licenseNumber||null,b.email||null,b.phone||null,b.status,JSON.stringify(b.schedule));
  ok(res, one(rows), 201);
}));

router.get('/health/appointments', requirePermission('health.manage'), asyncHandler(async (req, res) => {
  const from = String(req.query.from || new Date(Date.now() - 86400000).toISOString());
  const to = String(req.query.to || new Date(Date.now() + 30 * 86400000).toISOString());
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT a.*, p."displayName" AS "patientName", p."kind" AS "patientKind", pr."fullName" AS "professionalName", pr."specialty"
    FROM public."CareAppointment" a
    JOIN public."CarePatient" p ON p."id"=a."patientId"
    LEFT JOIN public."CareProfessional" pr ON pr."id"=a."professionalId"
    WHERE a."tenantId"=$1 AND a."startsAt" BETWEEN $2::timestamptz AND $3::timestamptz
    ORDER BY a."startsAt" ASC LIMIT 1000
  `, ctx(req).tenantId, from, to);
  ok(res, rows);
}));

router.post('/health/appointments', requirePermission('health.manage'), asyncHandler(async (req, res) => {
  const b = appointmentSchema.parse(req.body || {});
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    INSERT INTO public."CareAppointment" ("id","tenantId","patientId","professionalId","startsAt","endsAt","type","status","reason","channel","room","reminderStatus","notes","createdAt","updatedAt")
    VALUES (gen_random_uuid()::text,$1,$2,$3,$4::timestamptz,$5::timestamptz,$6,$7,$8,$9,$10,'pending',$11,now(),now()) RETURNING *
  `, ctx(req).tenantId,b.patientId,b.professionalId||null,b.startsAt,b.endsAt,b.type,b.status,b.reason||null,b.channel,b.room||null,b.notes||null);
  ok(res, one(rows), 201);
}));

router.get('/health/encounters', requirePermission('health.manage'), asyncHandler(async (req, res) => {
  const patientId = String(req.query.patientId || '');
  if (!patientId) throw new HttpError(422, 'patientId es obligatorio.');
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT e.*, pr."fullName" AS "professionalName" FROM public."CareEncounter" e
    LEFT JOIN public."CareProfessional" pr ON pr."id"=e."professionalId"
    WHERE e."tenantId"=$1 AND e."patientId"=$2 ORDER BY e."createdAt" DESC LIMIT 500
  `, ctx(req).tenantId, patientId);
  ok(res, rows);
}));

router.post('/health/encounters', requirePermission('health.manage'), asyncHandler(async (req, res) => {
  const b = encounterSchema.parse(req.body || {});
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    INSERT INTO public."CareEncounter" ("id","tenantId","patientId","professionalId","appointmentId","specialty","type","subjective","objective","assessment","plan","diagnosisCodes","clinicalData","confidential","status","signedAt","createdAt","updatedAt")
    VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13,$14,CASE WHEN $14='signed' THEN now() ELSE NULL END,now(),now()) RETURNING *
  `, ctx(req).tenantId,b.patientId,b.professionalId||null,b.appointmentId||null,b.specialty,b.type,b.subjective||null,b.objective||null,b.assessment||null,b.plan||null,JSON.stringify(b.diagnosisCodes),JSON.stringify(b.clinicalData),b.confidential,b.status);
  ok(res, one(rows), 201);
}));

router.post('/health/measurements', requirePermission('health.manage'), asyncHandler(async (req, res) => {
  const b = measurementSchema.parse(req.body || {});
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    INSERT INTO public."CareMeasurement" ("id","tenantId","patientId","encounterId","kind","value","unit","measuredAt","metadata")
    VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,COALESCE($7::timestamptz,now()),$8::jsonb) RETURNING *
  `, ctx(req).tenantId,b.patientId,b.encounterId||null,b.kind,b.value,b.unit,b.measuredAt||null,JSON.stringify(b.metadata));
  ok(res, one(rows), 201);
}));

router.post('/health/immunizations', requirePermission('health.manage'), asyncHandler(async (req, res) => {
  const b = immunizationSchema.parse(req.body || {});
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    INSERT INTO public."CareImmunization" ("id","tenantId","patientId","professionalId","vaccine","dose","lot","administeredAt","nextDueAt","notes","createdAt")
    VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,COALESCE($7::timestamptz,now()),$8::timestamptz,$9,now()) RETURNING *
  `, ctx(req).tenantId,b.patientId,b.professionalId||null,b.vaccine,b.dose||null,b.lot||null,b.administeredAt||null,b.nextDueAt||null,b.notes||null);
  ok(res, one(rows), 201);
}));

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
  const b = assessmentSchema.parse(req.body || {});
  const bmi = b.weightKg && b.heightCm ? Number((b.weightKg / Math.pow(b.heightCm / 100, 2)).toFixed(2)) : null;
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    INSERT INTO public."GymAssessment" ("id","tenantId","memberId","trainerId","measuredAt","weightKg","heightCm","bodyFatPct","muscleMassKg","visceralFat","bmi","waistCm","hipCm","chestCm","armCm","thighCm","restingHeartRate","notes","createdAt")
    VALUES (gen_random_uuid()::text,$1,$2,$3,COALESCE($4::timestamptz,now()),$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,now()) RETURNING *
  `, ctx(req).tenantId,b.memberId,b.trainerId||null,b.measuredAt||null,b.weightKg||null,b.heightCm||null,b.bodyFatPct||null,b.muscleMassKg||null,b.visceralFat||null,bmi,b.waistCm||null,b.hipCm||null,b.chestCm||null,b.armCm||null,b.thighCm||null,b.restingHeartRate||null,b.notes||null);
  ok(res, one(rows), 201);
}));

router.get('/gym/routines', requirePermission('gym.manage'), asyncHandler(async (req, res) => {
  const memberId = String(req.query.memberId || '');
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT r.*, COALESCE(json_agg(re ORDER BY re."dayOfWeek",re."sortOrder") FILTER (WHERE re."id" IS NOT NULL),'[]') AS exercises
    FROM public."GymRoutine" r LEFT JOIN public."GymRoutineExercise" re ON re."routineId"=r."id"
    WHERE r."tenantId"=$1 AND ($2='' OR r."memberId"=$2) GROUP BY r."id" ORDER BY r."active" DESC,r."createdAt" DESC LIMIT 500
  `, ctx(req).tenantId,memberId);
  ok(res, rows);
}));

router.post('/gym/routines', requirePermission('gym.manage'), asyncHandler(async (req, res) => {
  const b = routineSchema.parse(req.body || {});
  const routineRows = await prisma.$queryRawUnsafe<any[]>(`
    INSERT INTO public."GymRoutine" ("id","tenantId","memberId","trainerId","name","goal","level","startsAt","endsAt","daysPerWeek","notes","active","createdAt","updatedAt")
    VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7::date,$8::date,$9,$10,true,now(),now()) RETURNING *
  `, ctx(req).tenantId,b.memberId,b.trainerId||null,b.name,b.goal||null,b.level,b.startsAt||null,b.endsAt||null,b.daysPerWeek,b.notes||null);
  const routine = one(routineRows);
  for (const item of b.exercises) {
    let exerciseId = item.exerciseId || null;
    if (!exerciseId) {
      const exRows = await prisma.$queryRawUnsafe<any[]>(`
        INSERT INTO public."GymExercise" ("id","tenantId","name","muscleGroup","equipment","instructions","active","createdAt","updatedAt")
        VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,true,now(),now())
        ON CONFLICT ("tenantId","name") DO UPDATE SET "updatedAt"=now() RETURNING "id"
      `, ctx(req).tenantId,item.exerciseName,item.muscleGroup||null,item.equipment||null,item.instructions||null);
      exerciseId = exRows[0]?.id;
    }
    await prisma.$executeRawUnsafe(`
      INSERT INTO public."GymRoutineExercise" ("id","tenantId","routineId","exerciseId","dayOfWeek","sortOrder","sets","reps","loadKg","restSeconds","tempo","notes")
      VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    `, ctx(req).tenantId,routine.id,exerciseId,item.dayOfWeek,item.sortOrder,item.sets,item.reps,item.loadKg||null,item.restSeconds,item.tempo||null,item.notes||null);
  }
  ok(res, routine, 201);
}));

router.get('/gym/nutrition', requirePermission('gym.manage'), asyncHandler(async (req, res) => {
  const memberId = String(req.query.memberId || '');
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT p.*, COALESCE(json_agg(m ORDER BY m."plannedAt") FILTER (WHERE m."id" IS NOT NULL),'[]') AS meals
    FROM public."GymNutritionPlan" p LEFT JOIN public."GymMeal" m ON m."nutritionPlanId"=p."id"
    WHERE p."tenantId"=$1 AND ($2='' OR p."memberId"=$2) GROUP BY p."id" ORDER BY p."active" DESC,p."createdAt" DESC LIMIT 500
  `, ctx(req).tenantId,memberId);
  ok(res, rows);
}));

router.post('/gym/nutrition', requirePermission('gym.manage'), asyncHandler(async (req, res) => {
  const b = nutritionSchema.parse(req.body || {});
  const planRows = await prisma.$queryRawUnsafe<any[]>(`
    INSERT INTO public."GymNutritionPlan" ("id","tenantId","memberId","trainerId","name","goal","targetCalories","proteinG","carbsG","fatG","waterMl","notes","startsAt","endsAt","active","createdAt","updatedAt")
    VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::date,$13::date,true,now(),now()) RETURNING *
  `, ctx(req).tenantId,b.memberId,b.trainerId||null,b.name,b.goal||null,b.targetCalories||null,b.proteinG||null,b.carbsG||null,b.fatG||null,b.waterMl||null,b.notes||null,b.startsAt||null,b.endsAt||null);
  const plan = one(planRows);
  for (const meal of b.meals) {
    await prisma.$executeRawUnsafe(`
      INSERT INTO public."GymMeal" ("id","tenantId","nutritionPlanId","mealType","plannedAt","items","calories","proteinG","carbsG","fatG","notes")
      VALUES (gen_random_uuid()::text,$1,$2,$3,$4::time,$5::jsonb,$6,$7,$8,$9,$10)
    `, ctx(req).tenantId,plan.id,meal.mealType,meal.plannedAt||null,JSON.stringify(meal.items),meal.calories||null,meal.proteinG||null,meal.carbsG||null,meal.fatG||null,meal.notes||null);
  }
  ok(res, plan, 201);
}));

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

router.get('/communications/templates', requirePermission('communications.manage'), asyncHandler(async (req, res) => {
  const vertical = String(req.query.vertical || '');
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT * FROM public."CommunicationTemplate" WHERE "tenantId"=$1 AND ($2='' OR "vertical"=$2) ORDER BY "vertical","event"
  `, ctx(req).tenantId,vertical);
  ok(res, rows);
}));

router.post('/communications/templates', requirePermission('communications.manage'), asyncHandler(async (req, res) => {
  const b = templateSchema.parse(req.body || {});
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    INSERT INTO public."CommunicationTemplate" ("id","tenantId","channel","vertical","event","name","body","variables","active","createdAt","updatedAt")
    VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7::jsonb,$8,now(),now())
    ON CONFLICT ("tenantId","channel","vertical","event") DO UPDATE SET "name"=EXCLUDED."name","body"=EXCLUDED."body","variables"=EXCLUDED."variables","active"=EXCLUDED."active","updatedAt"=now()
    RETURNING *
  `, ctx(req).tenantId,b.channel,b.vertical,b.event,b.name,b.body,JSON.stringify(b.variables),b.active);
  ok(res, one(rows), 201);
}));

router.post('/communications/render', requirePermission('communications.manage'), asyncHandler(async (req, res) => {
  const body = z.object({ vertical:z.string(), event:z.string(), values:z.record(z.string(),z.union([z.string(),z.number(),z.boolean(),z.null()])).default({}) }).parse(req.body || {});
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT * FROM public."CommunicationTemplate" WHERE "tenantId"=$1 AND "channel"='whatsapp' AND "vertical"=$2 AND "event"=$3 AND "active"=true LIMIT 1
  `, ctx(req).tenantId,body.vertical,body.event);
  const template = one(rows, 'Plantilla de WhatsApp no encontrada.');
  const rendered = Object.entries(body.values).reduce((text,[key,value]) => text.replaceAll(`{{${key}}}`, String(value ?? '')), String(template.body));
  ok(res, { templateId:template.id, rendered, whatsappUrl:`https://wa.me/?text=${encodeURIComponent(rendered)}` });
}));

export default router;
