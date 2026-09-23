import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requirePermission } from '../../shared/middleware/context.js';
import { optionalText, dateText, jsonRecord, ctx, one, num } from './verticals.shared.js';
import { evaluateGymProgression } from './gym.progression.js';

const router = Router();

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

const exerciseLibrarySchema = z.object({
  name: z.string().trim().min(2).max(180),
  category: optionalText,
  muscleGroup: optionalText,
  equipment: optionalText,
  instructions: optionalText,
  mediaUrl: z.string().url().max(2000).optional().nullable().or(z.literal('')),
  defaultSets: z.coerce.number().int().min(1).max(20).optional().nullable(),
  defaultReps: z.string().trim().max(60).optional().nullable(),
  active: z.boolean().default(true)
});
const exerciseLibraryPatchSchema = exerciseLibrarySchema.partial().refine((value)=>Object.keys(value).length>0,{message:'Indica al menos un campo para actualizar.'});

const intensityTechniqueSchema = z.enum([
  'standard','drop_set','rest_pause','myo_reps','cluster',
  'superset','giant_set','mechanical_drop','isometric_hold'
]);
const techniqueConfigSchema = z.object({
  rounds: z.coerce.number().int().min(1).max(12).optional().nullable(),
  intraRestSeconds: z.coerce.number().int().min(1).max(600).optional().nullable(),
  loadDropPct: z.coerce.number().min(1).max(90).optional().nullable(),
  groupKey: z.string().trim().max(80).optional().nullable(),
  holdSeconds: z.coerce.number().int().min(1).max(300).optional().nullable(),
  techniqueNotes: z.string().trim().max(500).optional().nullable()
}).default({});
const progressionStrategySchema = z.enum(['manual','linear_load','double_progression','percent_1rm']);
const progressionConfigSchema = z.object({
  repRangeMin: z.coerce.number().int().min(1).max(100).optional().nullable(),
  repRangeMax: z.coerce.number().int().min(1).max(100).optional().nullable(),
  repIncrement: z.coerce.number().int().min(1).max(20).optional().nullable(),
  loadIncrementKg: z.coerce.number().positive().max(100).optional().nullable(),
  targetRir: z.coerce.number().min(0).max(10).optional().nullable(),
  targetRpe: z.coerce.number().min(1).max(10).optional().nullable(),
  oneRepMaxKg: z.coerce.number().positive().max(1000).optional().nullable(),
  percent1Rm: z.coerce.number().min(1).max(100).optional().nullable(),
  stallAfter: z.coerce.number().int().min(1).max(12).optional().nullable(),
  resetPct: z.coerce.number().min(1).max(50).optional().nullable()
}).default({});

const progressionEvaluationSchema = z.object({
  strategy: progressionStrategySchema,
  config: progressionConfigSchema,
  current: z.object({
    loadKg: z.coerce.number().min(0).optional().nullable(),
    reps: z.coerce.number().int().min(1).max(200)
  }),
  performance: z.object({
    completed: z.boolean().default(true),
    achievedReps: z.coerce.number().int().min(0).max(200),
    rir: z.coerce.number().min(0).max(10).optional().nullable(),
    rpe: z.coerce.number().min(1).max(10).optional().nullable(),
    consecutiveMisses: z.coerce.number().int().min(0).max(100).default(0)
  })
}).superRefine((value, refinement) => {
  const progression=value.config||{};
  if(progression.targetRir!=null&&progression.targetRpe!=null&&Math.abs((10-Number(progression.targetRir))-Number(progression.targetRpe))>0.5){
    refinement.addIssue({code:'custom',path:['config','targetRpe'],message:'RPE y RIR no son coherentes entre sí.'});
  }
  if(value.strategy==='linear_load'&&!progression.loadIncrementKg){
    refinement.addIssue({code:'custom',path:['config','loadIncrementKg'],message:'La progresión lineal requiere un incremento de carga.'});
  }
  if(value.strategy==='double_progression'){
    if(!progression.repRangeMin||!progression.repRangeMax||Number(progression.repRangeMin)>Number(progression.repRangeMax)){
      refinement.addIssue({code:'custom',path:['config','repRangeMax'],message:'La doble progresión requiere un rango de repeticiones válido.'});
    }
    if(!progression.loadIncrementKg){
      refinement.addIssue({code:'custom',path:['config','loadIncrementKg'],message:'La doble progresión requiere un incremento de carga.'});
    }
  }
  if(value.strategy==='percent_1rm'&&(!progression.oneRepMaxKg||!progression.percent1Rm)){
    refinement.addIssue({code:'custom',path:['config','percent1Rm'],message:'La progresión por %1RM requiere 1RM y porcentaje.'});
  }
});

const routineExerciseSchema = z.object({
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
  notes: optionalText,
  intensityTechnique: intensityTechniqueSchema.default('standard'),
  techniqueConfig: techniqueConfigSchema,
  progressionStrategy: progressionStrategySchema.default('manual'),
  progressionConfig: progressionConfigSchema
}).superRefine((value, refinement) => {
  const config=value.techniqueConfig||{};
  const multiRound=['drop_set','rest_pause','myo_reps','cluster','mechanical_drop'].includes(value.intensityTechnique);
  if(multiRound && !config.rounds){
    refinement.addIssue({code:'custom',path:['techniqueConfig','rounds'],message:'La técnica seleccionada requiere indicar rondas.'});
  }
  if(value.intensityTechnique==='drop_set' && !config.loadDropPct){
    refinement.addIssue({code:'custom',path:['techniqueConfig','loadDropPct'],message:'La técnica drop set requiere un porcentaje de reducción de carga.'});
  }
  if(['rest_pause','myo_reps','cluster'].includes(value.intensityTechnique) && !config.intraRestSeconds){
    refinement.addIssue({code:'custom',path:['techniqueConfig','intraRestSeconds'],message:'La técnica seleccionada requiere descanso intra-técnica.'});
  }
  if(['superset','giant_set'].includes(value.intensityTechnique) && !String(config.groupKey||'').trim()){
    refinement.addIssue({code:'custom',path:['techniqueConfig','groupKey'],message:'La técnica seleccionada requiere una clave de grupo.'});
  }
  if(value.intensityTechnique==='isometric_hold' && !config.holdSeconds){
    refinement.addIssue({code:'custom',path:['techniqueConfig','holdSeconds'],message:'La pausa isométrica requiere duración en segundos.'});
  }
  const progression=value.progressionConfig||{};
  if(progression.targetRir!=null&&progression.targetRpe!=null&&Math.abs((10-Number(progression.targetRir))-Number(progression.targetRpe))>0.5){
    refinement.addIssue({code:'custom',path:['progressionConfig','targetRpe'],message:'RPE y RIR no son coherentes entre sí.'});
  }
  if(value.progressionStrategy==='linear_load'&&!progression.loadIncrementKg){
    refinement.addIssue({code:'custom',path:['progressionConfig','loadIncrementKg'],message:'La progresión lineal requiere un incremento de carga.'});
  }
  if(value.progressionStrategy==='double_progression'){
    if(!progression.repRangeMin||!progression.repRangeMax||Number(progression.repRangeMin)>Number(progression.repRangeMax)){
      refinement.addIssue({code:'custom',path:['progressionConfig','repRangeMax'],message:'La doble progresión requiere un rango de repeticiones válido.'});
    }
    if(!progression.loadIncrementKg){
      refinement.addIssue({code:'custom',path:['progressionConfig','loadIncrementKg'],message:'La doble progresión requiere un incremento de carga.'});
    }
  }
  if(value.progressionStrategy==='percent_1rm'&&(!progression.oneRepMaxKg||!progression.percent1Rm)){
    refinement.addIssue({code:'custom',path:['progressionConfig','percent1Rm'],message:'La progresión por %1RM requiere 1RM y porcentaje.'});
  }
});

const periodizationWeekSchema = z.object({
  weekType: z.enum(['load','deload']),
  volumePct: z.coerce.number().min(1).max(200),
  intensityPct: z.coerce.number().min(1).max(200),
  notes: optionalText
});
const periodizationPhaseSchema = z.object({
  name: z.string().trim().min(2).max(120),
  kind: z.enum(['accumulation','intensification','realization','deload','custom']),
  weeks: z.array(periodizationWeekSchema).min(1).max(12),
  notes: optionalText
});
const periodizationStructureSchema = z.object({
  phases: z.array(periodizationPhaseSchema).min(1).max(24)
});
const periodizationTemplateSchema = z.object({
  name: z.string().trim().min(2).max(160),
  description: optionalText,
  structure: periodizationStructureSchema
});
const periodizationProgramSchema = z.object({
  routineId: z.string().min(10),
  name: z.string().trim().min(2).max(180),
  startsAt: z.string().optional().nullable(),
  sourceTemplateId: z.string().optional().nullable(),
  notes: optionalText,
  structure: periodizationStructureSchema
});

const decoratePeriodizationProgram = (row:any) => {
  const phases=Array.isArray(row?.structure?.phases)?row.structure.phases:[];
  const weeks=phases.flatMap((phase:any)=>Array.isArray(phase?.weeks)?phase.weeks:[]);
  return {
    ...row,
    totalWeeks:weeks.length,
    loadWeeks:weeks.filter((week:any)=>week?.weekType==='load').length,
    deloadWeeks:weeks.filter((week:any)=>week?.weekType==='deload').length
  };
};

const workoutSessionSchema = z.object({
  routineId: z.string().min(10),
  notes: optionalText
});
const exerciseSubstitutionSchema = z.object({
  routineExerciseId: z.string().min(10),
  availableEquipment: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
  preferredExerciseIds: z.array(z.string().min(10)).max(50).default([]),
  excludedExerciseIds: z.array(z.string().min(10)).max(50).default([]),
  declaredLimitations: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
  limit: z.coerce.number().int().min(1).max(10).default(5)
});

const workoutSetSchema = z.object({
  routineExerciseId: z.string().min(10),
  setNumber: z.coerce.number().int().min(1).max(100),
  status: z.enum(['completed','skipped']),
  loadKg: z.coerce.number().min(0).max(5000).optional().nullable(),
  reps: z.coerce.number().int().min(0).max(500).optional().nullable(),
  rir: z.coerce.number().min(0).max(10).optional().nullable(),
  rpe: z.coerce.number().min(1).max(10).optional().nullable(),
  restSeconds: z.coerce.number().int().min(0).max(3600).default(0),
  notes: optionalText,
  performedExerciseId: z.string().optional().nullable(),
  substitutionReason: z.string().trim().max(500).optional().nullable()
}).superRefine((value, refinement) => {
  if(value.status==='completed'&&value.reps==null){
    refinement.addIssue({code:'custom',path:['reps'],message:'Las series realizadas requieren repeticiones.'});
  }
  if(value.rir!=null&&value.rpe!=null&&Math.abs((10-Number(value.rir))-Number(value.rpe))>0.5){
    refinement.addIssue({code:'custom',path:['rpe'],message:'RIR y RPE no son coherentes entre sí.'});
  }
});

const performanceQuerySchema = z.object({
  memberId: z.string().min(10),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

const epleyEstimate = (load:number,reps:number) => reps>=1&&reps<=12&&load>0
  ? Number((load*(1+reps/30)).toFixed(2))
  : null;

const routineSchema = z.object({
  memberId: z.string().min(10),
  trainerId: z.string().optional().nullable(),
  name: z.string().trim().min(2).max(180),
  goal: optionalText,
  level: z.enum(['beginner','intermediate','advanced']).default('beginner'),
  trainingMode: z.enum(['strength','hypertrophy','pump','endurance','power','conditioning','mobility']),
  startsAt: z.string().optional().nullable(),
  endsAt: z.string().optional().nullable(),
  daysPerWeek: z.coerce.number().int().min(1).max(7).default(3),
  notes: optionalText,
  exercises: z.array(routineExerciseSchema).default([])
).superRefine((value, refinement) => {
  if(!value.exercises.length)return;
  const scheduledDays=new Set(value.exercises.map((exercise)=>exercise.dayOfWeek));
  if(value.daysPerWeek!==scheduledDays.size){
    refinement.addIssue({
      code:'custom',
      path:['daysPerWeek'],
      message:'La frecuencia semanal debe coincidir con los días programados.'
    });
  }

  const grouped=new Map<string,{technique:string;indexes:number[]}>();
  value.exercises.forEach((exercise,index)=>{
    if(!['superset','giant_set'].includes(exercise.intensityTechnique))return;
    const groupKey=String(exercise.techniqueConfig?.groupKey||'').trim();
    if(!groupKey)return;
    const key=`${exercise.dayOfWeek}:${groupKey}`;
    const current=grouped.get(key)||{technique:exercise.intensityTechnique,indexes:[]};
    if(current.technique!==exercise.intensityTechnique){
      refinement.addIssue({code:'custom',path:['exercises',index,'techniqueConfig','groupKey'],message:'Una clave de grupo no puede mezclar superset y giant set el mismo día.'});
    }
    current.indexes.push(index);
    grouped.set(key,current);
  });
  for(const group of grouped.values()){
    if(group.technique==='superset'&&group.indexes.length!==2){
      refinement.addIssue({code:'custom',path:['exercises',group.indexes[0]??0,'techniqueConfig','groupKey'],message:'Un superset requiere exactamente 2 ejercicios con la misma clave y día.'});
    }
    if(group.technique==='giant_set'&&group.indexes.length<3){
      refinement.addIssue({code:'custom',path:['exercises',group.indexes[0]??0,'techniqueConfig','groupKey'],message:'Un giant set requiere al menos 3 ejercicios con la misma clave y día.'});
    }
  }
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

router.get('/gym/exercises', requirePermission('gym.manage'), asyncHandler(async (req, res) => {
  const tenantId=ctx(req).tenantId;
  const q=String(req.query.q||'').trim();
  const muscleGroup=String(req.query.muscleGroup||'').trim();
  const equipment=String(req.query.equipment||'').trim();
  const category=String(req.query.category||'').trim();
  const active=String(req.query.active||'').trim();
  const rows=await prisma.$queryRawUnsafe<any[]>(`
    SELECT *
    FROM public."GymExercise"
    WHERE "tenantId"=$1
      AND ($2='' OR "name" ILIKE '%'||$2||'%' OR COALESCE("instructions",'') ILIKE '%'||$2||'%')
      AND ($3='' OR COALESCE("muscleGroup",'')=$3)
      AND ($4='' OR COALESCE("equipment",'')=$4)
      AND ($5='' OR COALESCE("category",'')=$5)
      AND ($6='' OR "active"=($6='true'))
    ORDER BY "active" DESC,"muscleGroup" NULLS LAST,"name"
    LIMIT 1000
  `,tenantId,q,muscleGroup,equipment,category,active);
  ok(res,rows);
}));

router.post('/gym/exercises', requirePermission('gym.manage'), asyncHandler(async (req, res) => {
  const tenantId=ctx(req).tenantId;
  const b=exerciseLibrarySchema.parse(req.body||{});
  const existing=await prisma.$queryRawUnsafe<any[]>(`
    SELECT "id" FROM public."GymExercise"
    WHERE "tenantId"=$1 AND lower("name")=lower($2)
    LIMIT 1
  `,tenantId,b.name);
  if(existing.length)throw new HttpError(409,'Ya existe un ejercicio con ese nombre.');
  const rows=await prisma.$queryRawUnsafe<any[]>(`
    INSERT INTO public."GymExercise"
      ("id","tenantId","name","category","muscleGroup","equipment","instructions","mediaUrl","defaultSets","defaultReps","active","createdAt","updatedAt")
    VALUES
      (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now(),now())
    ON CONFLICT ("tenantId","name") DO NOTHING
    RETURNING *
  `,tenantId,b.name,b.category||null,b.muscleGroup||null,b.equipment||null,b.instructions||null,b.mediaUrl||null,b.defaultSets??null,b.defaultReps||null,b.active);
  if(!rows.length)throw new HttpError(409,'Ya existe un ejercicio con ese nombre.');
  ok(res,one(rows),201);
}));

router.patch('/gym/exercises/:id', requirePermission('gym.manage'), asyncHandler(async (req, res) => {
  const tenantId=ctx(req).tenantId;
  const b=exerciseLibraryPatchSchema.parse(req.body||{});
  if(b.name){
    const duplicate=await prisma.$queryRawUnsafe<any[]>(`
      SELECT "id" FROM public."GymExercise"
      WHERE "tenantId"=$1 AND lower("name")=lower($2) AND "id"<>$3
      LIMIT 1
    `,tenantId,b.name,String(req.params.id));
    if(duplicate.length)throw new HttpError(409,'Ya existe otro ejercicio con ese nombre.');
  }
  const currentRows=await prisma.$queryRawUnsafe<any[]>(`
    SELECT * FROM public."GymExercise"
    WHERE "tenantId"=$1 AND "id"=$2
    LIMIT 1
  `,tenantId,String(req.params.id));
  const current=one(currentRows,'Ejercicio no encontrado.');
  const next={...current,...b};
  const rows=await prisma.$queryRawUnsafe<any[]>(`
    UPDATE public."GymExercise"
    SET "name"=$3,"category"=$4,"muscleGroup"=$5,"equipment"=$6,"instructions"=$7,
        "mediaUrl"=$8,"defaultSets"=$9,"defaultReps"=$10,"active"=$11,"updatedAt"=now()
    WHERE "tenantId"=$1 AND "id"=$2
    RETURNING *
  `,tenantId,current.id,next.name,next.category||null,next.muscleGroup||null,next.equipment||null,next.instructions||null,next.mediaUrl||null,next.defaultSets??null,next.defaultReps||null,Boolean(next.active));
  ok(res,one(rows));
}));

router.post('/gym/progression/evaluate', requirePermission('gym.manage'), asyncHandler(async (req, res) => {
  const b=progressionEvaluationSchema.parse(req.body||{});
  const result=evaluateGymProgression(b);
  ok(res,result);
}));

router.get('/gym/periodization/templates', requirePermission('gym.manage'), asyncHandler(async (req, res) => {
  const rows=await prisma.$queryRawUnsafe<any[]>(`
    SELECT *
    FROM public."GymPeriodizationTemplate"
    WHERE "tenantId"=$1
    ORDER BY "createdAt" DESC, "name" ASC
  `,ctx(req).tenantId);
  ok(res,rows);
}));

router.post('/gym/periodization/templates', requirePermission('gym.manage'), asyncHandler(async (req, res) => {
  const b=periodizationTemplateSchema.parse(req.body||{});
  const tenantId=ctx(req).tenantId;
  const created=await prisma.$transaction(async(tx)=>{
    const lockKey=`gym-periodization-template:${tenantId}:${b.name.trim().toLocaleLowerCase('es')}`;
    await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',lockKey);
    const duplicate=await tx.$queryRawUnsafe<any[]>(`
      SELECT "id" FROM public."GymPeriodizationTemplate"
      WHERE "tenantId"=$1 AND lower(btrim("name"))=lower(btrim($2))
      LIMIT 1
    `,tenantId,b.name);
    if(duplicate.length)throw new HttpError(409,'Ya existe una plantilla de periodización con ese nombre.');
    const rows=await tx.$queryRawUnsafe<any[]>(`
      INSERT INTO public."GymPeriodizationTemplate"
        ("id","tenantId","name","description","structure","createdBy","createdAt")
      VALUES (gen_random_uuid()::text,$1,$2,$3,$4::jsonb,$5,now())
      RETURNING *
    `,tenantId,b.name,b.description||null,JSON.stringify(b.structure),ctx(req).userId||null);
    return one(rows);
  });
  ok(res,created,201);
}));

router.get('/gym/periodization/programs', requirePermission('gym.manage'), asyncHandler(async (req, res) => {
  const routineId=String(req.query.routineId||'').trim();
  if(!routineId)throw new HttpError(422,'routineId es obligatorio.');
  const tenantId=ctx(req).tenantId;
  const routineRows=await prisma.$queryRawUnsafe<any[]>(`
    SELECT "id" FROM public."GymRoutine"
    WHERE "tenantId"=$1 AND "id"=$2
    LIMIT 1
  `,tenantId,routineId);
  if(!routineRows.length)throw new HttpError(404,'La rutina no pertenece al tenant activo.');
  const rows=await prisma.$queryRawUnsafe<any[]>(`
    SELECT p.*, t."name" AS "sourceTemplateName"
    FROM public."GymPeriodizationProgram" p
    LEFT JOIN public."GymPeriodizationTemplate" t
      ON t."tenantId"=p."tenantId" AND t."id"=p."sourceTemplateId"
    WHERE p."tenantId"=$1 AND p."routineId"=$2
    ORDER BY p."createdAt" DESC, p."programKey" ASC, p."version" DESC
  `,tenantId,routineId);
  ok(res,rows.map(decoratePeriodizationProgram));
}));

router.post('/gym/periodization/programs', requirePermission('gym.manage'), asyncHandler(async (req, res) => {
  const b=periodizationProgramSchema.parse(req.body||{});
  const tenantId=ctx(req).tenantId;
  const created=await prisma.$transaction(async(tx)=>{
    const routineRows=await tx.$queryRawUnsafe<any[]>(`
      SELECT "id" FROM public."GymRoutine"
      WHERE "tenantId"=$1 AND "id"=$2
      LIMIT 1
    `,tenantId,b.routineId);
    if(!routineRows.length)throw new HttpError(422,'La rutina no pertenece al tenant activo.');
    if(b.sourceTemplateId){
      const templateRows=await tx.$queryRawUnsafe<any[]>(`
        SELECT "id" FROM public."GymPeriodizationTemplate"
        WHERE "tenantId"=$1 AND "id"=$2
        LIMIT 1
      `,tenantId,b.sourceTemplateId);
      if(!templateRows.length)throw new HttpError(422,'La plantilla no pertenece al tenant activo.');
    }
    const rows=await tx.$queryRawUnsafe<any[]>(`
      INSERT INTO public."GymPeriodizationProgram"
        ("id","tenantId","routineId","programKey","version","name","startsAt","structure","sourceTemplateId","supersedesId","notes","createdBy","createdAt")
      VALUES (gen_random_uuid()::text,$1,$2,gen_random_uuid()::text,1,$3,$4::date,$5::jsonb,$6,NULL,$7,$8,now())
      RETURNING *
    `,tenantId,b.routineId,b.name,b.startsAt||null,JSON.stringify(b.structure),b.sourceTemplateId||null,b.notes||null,ctx(req).userId||null);
    return one(rows);
  });
  ok(res,decoratePeriodizationProgram(created),201);
}));

router.post('/gym/periodization/programs/:id/version', requirePermission('gym.manage'), asyncHandler(async (req, res) => {
  const b=periodizationProgramSchema.parse(req.body||{});
  const tenantId=ctx(req).tenantId;
  const sourceId=String(req.params.id);
  const created=await prisma.$transaction(async(tx)=>{
    const sourceRows=await tx.$queryRawUnsafe<any[]>(`
      SELECT * FROM public."GymPeriodizationProgram"
      WHERE "tenantId"=$1 AND "id"=$2
      LIMIT 1
    `,tenantId,sourceId);
    const source=one(sourceRows,'Programa de periodización no encontrado.');
    if(source.routineId!==b.routineId)throw new HttpError(422,'Una versión debe conservar la misma rutina.');

    const routineRows=await tx.$queryRawUnsafe<any[]>(`
      SELECT "id" FROM public."GymRoutine"
      WHERE "tenantId"=$1 AND "id"=$2
      LIMIT 1
    `,tenantId,b.routineId);
    if(!routineRows.length)throw new HttpError(422,'La rutina no pertenece al tenant activo.');

    if(b.sourceTemplateId){
      const templateRows=await tx.$queryRawUnsafe<any[]>(`
        SELECT "id" FROM public."GymPeriodizationTemplate"
        WHERE "tenantId"=$1 AND "id"=$2
        LIMIT 1
      `,tenantId,b.sourceTemplateId);
      if(!templateRows.length)throw new HttpError(422,'La plantilla no pertenece al tenant activo.');
    }

    const lockKey=`gym-periodization-program:${tenantId}:${source.programKey}`;
    await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',lockKey);
    const versionRows=await tx.$queryRawUnsafe<any[]>(`
      SELECT COALESCE(MAX("version"),0)::int AS "maxVersion"
      FROM public."GymPeriodizationProgram"
      WHERE "tenantId"=$1 AND "programKey"=$2
    `,tenantId,source.programKey);
    const maxVersion=Number(versionRows[0]?.maxVersion||0);
    if(Number(source.version)!==maxVersion)throw new HttpError(409,'Solo la versión más reciente puede generar una nueva revisión.');
    const nextVersion=maxVersion+1;
    const rows=await tx.$queryRawUnsafe<any[]>(`
      INSERT INTO public."GymPeriodizationProgram"
        ("id","tenantId","routineId","programKey","version","name","startsAt","structure","sourceTemplateId","supersedesId","notes","createdBy","createdAt")
      VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6::date,$7::jsonb,$8,$9,$10,$11,now())
      RETURNING *
    `,tenantId,b.routineId,source.programKey,nextVersion,b.name,b.startsAt||null,JSON.stringify(b.structure),b.sourceTemplateId||null,source.id,b.notes||null,ctx(req).userId||null);
    return one(rows);
  });
  ok(res,decoratePeriodizationProgram(created),201);
}));

router.get('/gym/workout-sessions', requirePermission('gym.manage'), asyncHandler(async (req, res) => {
  const memberId=String(req.query.memberId||'').trim();
  if(!memberId)throw new HttpError(422,'memberId es obligatorio.');
  const tenantId=ctx(req).tenantId;
  const memberRows=await prisma.$queryRawUnsafe<any[]>(`
    SELECT "id" FROM public."GymMember"
    WHERE "tenantId"=$1 AND "id"=$2
    LIMIT 1
  `,tenantId,memberId);
  if(!memberRows.length)throw new HttpError(404,'El cliente no pertenece al tenant activo.');
  const rows=await prisma.$queryRawUnsafe<any[]>(`
    SELECT s.*,
      COALESCE((
        SELECT json_agg(ws ORDER BY ws."recordedAt",ws."routineExerciseId",ws."setNumber")
        FROM public."GymWorkoutSet" ws
        WHERE ws."tenantId"=s."tenantId" AND ws."sessionId"=s."id"
      ),'[]') AS sets
    FROM public."GymWorkoutSession" s
    WHERE s."tenantId"=$1 AND s."memberId"=$2
    ORDER BY (s."status"='in_progress') DESC,s."startedAt" DESC
    LIMIT 200
  `,tenantId,memberId);
  ok(res,rows);
}));

router.post('/gym/workout-sessions', requirePermission('gym.manage'), asyncHandler(async (req, res) => {
  const b=workoutSessionSchema.parse(req.body||{});
  const tenantId=ctx(req).tenantId;
  const created=await prisma.$transaction(async(tx)=>{
    const routineRows=await tx.$queryRawUnsafe<any[]>(`
      SELECT "id","memberId"
      FROM public."GymRoutine"
      WHERE "tenantId"=$1 AND "id"=$2 AND "active"=true
      LIMIT 1
    `,tenantId,b.routineId);
    if(!routineRows.length)throw new HttpError(422,'La rutina no pertenece al tenant activo.');
    const routine=routineRows[0];
    const lockKey=`gym-workout-session:${tenantId}:${routine.memberId}`;
    await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',lockKey);
    const activeRows=await tx.$queryRawUnsafe<any[]>(`
      SELECT "id" FROM public."GymWorkoutSession"
      WHERE "tenantId"=$1 AND "memberId"=$2 AND "status"='in_progress'
      LIMIT 1
    `,tenantId,routine.memberId);
    if(activeRows.length)throw new HttpError(409,'El cliente ya tiene una sesión activa.');
    const rows=await tx.$queryRawUnsafe<any[]>(`
      INSERT INTO public."GymWorkoutSession"
        ("id","tenantId","routineId","memberId","status","startedAt","completedAt","notes","createdBy","createdAt","updatedAt")
      VALUES (gen_random_uuid()::text,$1,$2,$3,'in_progress',now(),NULL,$4,$5,now(),now())
      RETURNING *
    `,tenantId,b.routineId,routine.memberId,b.notes||null,ctx(req).userId||null);
    return one(rows);
  });
  ok(res,{...created,sets:[]},201);
}));

router.post('/gym/workout-sessions/:id/sets', requirePermission('gym.manage'), asyncHandler(async (req, res) => {
  const b=workoutSetSchema.parse(req.body||{});
  const tenantId=ctx(req).tenantId;
  const sessionId=String(req.params.id);
  const created=await prisma.$transaction(async(tx)=>{
    const sessionRows=await tx.$queryRawUnsafe<any[]>(`
      SELECT s.*
      FROM public."GymWorkoutSession" s
      WHERE s."tenantId"=$1 AND s."id"=$2
      LIMIT 1
      FOR UPDATE OF s
    `,tenantId,sessionId);
    const session=one(sessionRows,'Sesión de entrenamiento no encontrada.');
    if(session.status!=='in_progress')throw new HttpError(409,'La sesión ya está completada.');

    const exerciseRows=await tx.$queryRawUnsafe<any[]>(`
      SELECT re."id",re."routineId",re."exerciseId",e."muscleGroup"
      FROM public."GymRoutineExercise" re
      JOIN public."GymExercise" e
        ON e."tenantId"=re."tenantId" AND e."id"=re."exerciseId"
      WHERE re."tenantId"=$1 AND re."id"=$2 AND re."routineId"=$3
      LIMIT 1
    `,tenantId,b.routineExerciseId,session.routineId);
    if(!exerciseRows.length)throw new HttpError(422,'El ejercicio no pertenece a la rutina de esta sesión.');
    const prescribedExercise=exerciseRows[0];

    let performedExerciseId:string|null=null;
    let substitutionReason:string|null=null;
    if(b.status==='completed'&&b.performedExerciseId&&b.performedExerciseId!==prescribedExercise.exerciseId){
      const substituteRows=await tx.$queryRawUnsafe<any[]>(`
        SELECT "id","muscleGroup"
        FROM public."GymExercise"
        WHERE "tenantId"=$1 AND "id"=$2 AND "active"=true
        LIMIT 1
      `,tenantId,b.performedExerciseId);
      if(!substituteRows.length)throw new HttpError(422,'El ejercicio sustituto no pertenece al tenant activo.');
      const substitute=substituteRows[0];
      const prescribedMuscle=String(prescribedExercise.muscleGroup||'').trim().toLocaleLowerCase('es');
      const substituteMuscle=String(substitute.muscleGroup||'').trim().toLocaleLowerCase('es');
      if(!prescribedMuscle||!substituteMuscle||prescribedMuscle!==substituteMuscle){
        throw new HttpError(422,'El ejercicio sustituto debe conservar el mismo grupo muscular.');
      }
      performedExerciseId=String(substitute.id);
      substitutionReason=String(b.substitutionReason||'').trim()||'explicit_session_substitution';
    }

    const duplicate=await tx.$queryRawUnsafe<any[]>(`
      SELECT "id" FROM public."GymWorkoutSet"
      WHERE "sessionId"=$1 AND "routineExerciseId"=$2 AND "setNumber"=$3
      LIMIT 1
    `,session.id,b.routineExerciseId,b.setNumber);
    if(duplicate.length)throw new HttpError(409,'La serie indicada ya fue registrada.');

    const completed=b.status==='completed';
    const rows=await tx.$queryRawUnsafe<any[]>(`
      INSERT INTO public."GymWorkoutSet"
        ("id","tenantId","sessionId","routineExerciseId","setNumber","status","loadKg","reps","rir","rpe","restSeconds","notes","performedExerciseId","substitutionReason","recordedAt","createdBy")
      VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now(),$14)
      RETURNING *
    `,tenantId,session.id,b.routineExerciseId,b.setNumber,b.status,
      completed?(b.loadKg??null):null,
      completed?(b.reps??null):null,
      completed?(b.rir??null):null,
      completed?(b.rpe??null):null,
      b.restSeconds,b.notes||null,
      completed?performedExerciseId:null,
      completed?substitutionReason:null,
      ctx(req).userId||null);
    return one(rows);
  });
  ok(res,created,201);
}));

router.post('/gym/workout-sessions/:id/complete', requirePermission('gym.manage'), asyncHandler(async (req, res) => {
  const tenantId=ctx(req).tenantId;
  const sessionId=String(req.params.id);
  const completed=await prisma.$transaction(async(tx)=>{
    const sessionRows=await tx.$queryRawUnsafe<any[]>(`
      SELECT s.*
      FROM public."GymWorkoutSession" s
      WHERE s."tenantId"=$1 AND s."id"=$2
      LIMIT 1
      FOR UPDATE OF s
    `,tenantId,sessionId);
    const session=one(sessionRows,'Sesión de entrenamiento no encontrada.');
    if(session.status!=='in_progress')throw new HttpError(409,'La sesión ya está completada.');
    const rows=await tx.$queryRawUnsafe<any[]>(`
      UPDATE public."GymWorkoutSession"
      SET "status"='completed',"completedAt"=now(),"updatedAt"=now()
      WHERE "tenantId"=$1 AND "id"=$2
      RETURNING *
    `,tenantId,session.id);
    return one(rows);
  });
  ok(res,completed);
}));

router.get('/gym/performance', requirePermission('gym.manage'), asyncHandler(async (req, res) => {
  const today=new Date();
  const defaultTo=today.toISOString().slice(0,10);
  const defaultFrom=new Date(today.getTime()-89*86400000).toISOString().slice(0,10);
  const q=performanceQuerySchema.parse({
    memberId:String(req.query.memberId||''),
    from:req.query.from?String(req.query.from):undefined,
    to:req.query.to?String(req.query.to):undefined
  });
  const from=q.from||defaultFrom;
  const to=q.to||defaultTo;
  const fromDate=new Date(`${from}T00:00:00.000Z`);
  const toDate=new Date(`${to}T00:00:00.000Z`);
  if(!Number.isFinite(fromDate.getTime())||!Number.isFinite(toDate.getTime())||toDate<fromDate)throw new HttpError(422,'El período de performance no es válido.');
  const toExclusive=new Date(toDate.getTime()+86400000);
  const periodDays=Math.ceil((toExclusive.getTime()-fromDate.getTime())/86400000);
  if(periodDays>366)throw new HttpError(422,'El período de performance no puede superar 366 días.');

  const tenantId=ctx(req).tenantId;
  const memberRows=await prisma.$queryRawUnsafe<any[]>(`
    SELECT "id" FROM public."GymMember"
    WHERE "tenantId"=$1 AND "id"=$2
    LIMIT 1
  `,tenantId,q.memberId);
  if(!memberRows.length)throw new HttpError(404,'El cliente no pertenece al tenant activo.');

  const sessions=await prisma.$queryRawUnsafe<any[]>(`
    SELECT s."id",s."routineId",s."startedAt",s."completedAt",r."daysPerWeek"
    FROM public."GymWorkoutSession" s
    JOIN public."GymRoutine" r
      ON r."tenantId"=s."tenantId" AND r."id"=s."routineId"
    WHERE s."tenantId"=$1 AND s."memberId"=$2 AND s."status"='completed'
      AND s."startedAt">=$3::timestamptz AND s."startedAt"<$4::timestamptz
    ORDER BY s."startedAt" ASC
  `,tenantId,q.memberId,fromDate.toISOString(),toExclusive.toISOString());

  const setRows=await prisma.$queryRawUnsafe<any[]>(`
    SELECT ws."id",ws."sessionId",ws."routineExerciseId",ws."status",ws."loadKg",ws."reps",ws."rir",ws."rpe",ws."restSeconds",ws."recordedAt",
           s."routineId",s."startedAt",
           COALESCE(ws."performedExerciseId",re."exerciseId") AS "exerciseId",
           e."name" AS "exerciseName",
           e."muscleGroup"
    FROM public."GymWorkoutSet" ws
    JOIN public."GymWorkoutSession" s
      ON s."tenantId"=ws."tenantId" AND s."id"=ws."sessionId"
    JOIN public."GymRoutineExercise" re
      ON re."tenantId"=ws."tenantId" AND re."id"=ws."routineExerciseId"
    JOIN public."GymExercise" e
      ON e."tenantId"=re."tenantId" AND e."id"=COALESCE(ws."performedExerciseId",re."exerciseId")
    WHERE ws."tenantId"=$1 AND s."memberId"=$2 AND s."status"='completed'
      AND s."startedAt">=$3::timestamptz AND s."startedAt"<$4::timestamptz
    ORDER BY ws."recordedAt" ASC
  `,tenantId,q.memberId,fromDate.toISOString(),toExclusive.toISOString());

  const planRows=await prisma.$queryRawUnsafe<any[]>(`
    SELECT r."id" AS "routineId",COALESCE(sum(re."sets"),0)::int AS "plannedSets"
    FROM public."GymRoutine" r
    LEFT JOIN public."GymRoutineExercise" re
      ON re."tenantId"=r."tenantId" AND re."routineId"=r."id"
    WHERE r."tenantId"=$1 AND r."memberId"=$2
    GROUP BY r."id"
  `,tenantId,q.memberId);
  const plannedByRoutine=new Map(planRows.map((row:any)=>[String(row.routineId),Number(row.plannedSets||0)]));
  const plannedSets=sessions.reduce((total:any,session:any)=>total+Number(plannedByRoutine.get(String(session.routineId))||0),0);

  const byExerciseMap=new Map<string,any>();
  const byMuscleMap=new Map<string,any>();
  const dailyMap=new Map<string,any>();
  let totalVolume=0;
  let completedSets=0;
  let skippedSets=0;

  for(const row of setRows){
    const exerciseId=String(row.exerciseId);
    const exerciseName=String(row.exerciseName||'Ejercicio');
    const muscleGroup=String(row.muscleGroup||'Sin grupo');
    if(!byExerciseMap.has(exerciseId))byExerciseMap.set(exerciseId,{
      exerciseId,exerciseName,muscleGroup,completedSets:0,skippedSets:0,totalVolume:0,maxLoadKg:0,maxReps:0,bestEstimated1RmKg:null,lastPerformedAt:null
    });
    if(!byMuscleMap.has(muscleGroup))byMuscleMap.set(muscleGroup,{muscleGroup,completedSets:0,skippedSets:0,totalVolume:0});
    const exercise=byExerciseMap.get(exerciseId);
    const muscle=byMuscleMap.get(muscleGroup);

    if(row.status==='skipped'){
      skippedSets+=1;exercise.skippedSets+=1;muscle.skippedSets+=1;
      continue;
    }
    if(row.status!=='completed')continue;
    completedSets+=1;exercise.completedSets+=1;muscle.completedSets+=1;
    const load=Number(row.loadKg||0);
    const reps=Number(row.reps||0);
    const volume=load>0&&reps>0?load*reps:0;
    const estimated=epleyEstimate(load,reps);
    totalVolume+=volume;
    exercise.totalVolume+=volume;
    muscle.totalVolume+=volume;
    exercise.maxLoadKg=Math.max(exercise.maxLoadKg,load);
    exercise.maxReps=Math.max(exercise.maxReps,reps);
    exercise.bestEstimated1RmKg=estimated==null?exercise.bestEstimated1RmKg:Math.max(Number(exercise.bestEstimated1RmKg||0),estimated);
    exercise.lastPerformedAt=row.recordedAt;

    const date=new Date(row.recordedAt).toISOString().slice(0,10);
    if(!dailyMap.has(date))dailyMap.set(date,{date,completedSets:0,totalVolume:0});
    const day=dailyMap.get(date);
    day.completedSets+=1;
    day.totalVolume+=volume;
  }

  const trainingDays=new Set(sessions.map((session:any)=>new Date(session.startedAt).toISOString().slice(0,10))).size;
  const completedSessions=sessions.length;
  const sessionsPerWeek=periodDays>0?Number((completedSessions/(periodDays/7)).toFixed(2)):0;
  const setAdherencePct=plannedSets>0?Number((Math.min(1,completedSets/plannedSets)*100).toFixed(1)):0;
  const roundMetrics=(item:any)=>({...item,totalVolume:Number(Number(item.totalVolume||0).toFixed(2))});

  const byExercise=[...byExerciseMap.values()]
    .map((item)=>({...roundMetrics(item),bestEstimated1RmKg:item.bestEstimated1RmKg==null?null:Number(Number(item.bestEstimated1RmKg).toFixed(2))}))
    .sort((a,b)=>b.totalVolume-a.totalVolume||a.exerciseName.localeCompare(b.exerciseName));
  const byMuscleGroup=[...byMuscleMap.values()].map(roundMetrics).sort((a,b)=>b.totalVolume-a.totalVolume||a.muscleGroup.localeCompare(b.muscleGroup));
  const dailyTrend=[...dailyMap.values()].map(roundMetrics).sort((a,b)=>a.date.localeCompare(b.date));

  ok(res,{
    period:{from,to,days:periodDays},
    summary:{
      completedSessions,
      trainingDays,
      sessionsPerWeek,
      plannedSets,
      completedSets,
      skippedSets,
      setAdherencePct,
      totalVolume:Number(totalVolume.toFixed(2))
    },
    byExercise,
    byMuscleGroup,
    dailyTrend
  });
}));

router.post('/gym/exercise-substitutions/suggest', requirePermission('gym.manage'), asyncHandler(async (req, res) => {
  const b=exerciseSubstitutionSchema.parse(req.body||{});
  const tenantId=ctx(req).tenantId;
  const sourceRows=await prisma.$queryRawUnsafe<any[]>(`
    SELECT re."id" AS "routineExerciseId",re."exerciseId",
           e."name",e."category",e."muscleGroup",e."equipment"
    FROM public."GymRoutineExercise" re
    JOIN public."GymExercise" e
      ON e."tenantId"=re."tenantId" AND e."id"=re."exerciseId"
    WHERE re."tenantId"=$1 AND re."id"=$2
    LIMIT 1
  `,tenantId,b.routineExerciseId);
  const source=one(sourceRows,'El ejercicio prescrito no pertenece al tenant activo.');

  if(b.declaredLimitations.length>0){
    ok(res,{
      source,
      humanReviewRequired:true,
      healthAutomationBlocked:true,
      limitationsApplied:false,
      declaredLimitationsCount:b.declaredLimitations.length,
      suggestions:[]
    });
    return;
  }

  const rows=await prisma.$queryRawUnsafe<any[]>(`
    SELECT "id","name","category","muscleGroup","equipment"
    FROM public."GymExercise"
    WHERE "tenantId"=$1
      AND "active"=true
      AND "id"<>$2
      AND lower(COALESCE("muscleGroup",''))=lower(COALESCE($3,''))
    ORDER BY "name" ASC
    LIMIT 500
  `,tenantId,source.exerciseId,source.muscleGroup||'');

  const availableEquipment=new Set(b.availableEquipment.map((value)=>value.trim().toLocaleLowerCase('es')));
  const preferred=new Set(b.preferredExerciseIds);
  const excluded=new Set(b.excludedExerciseIds);
  const sourceCategory=String(source.category||'').trim().toLocaleLowerCase('es');

  const suggestions=rows
    .filter((candidate)=>!excluded.has(String(candidate.id)))
    .filter((candidate)=>{
      if(!availableEquipment.size)return true;
      const equipment=String(candidate.equipment||'').trim().toLocaleLowerCase('es');
      return !equipment||availableEquipment.has(equipment);
    })
    .map((candidate)=>{
      const reasons=['same_muscle_group'];
      let score=100;
      if(preferred.has(String(candidate.id))){score+=30;reasons.push('preferred_exercise');}
      const equipment=String(candidate.equipment||'').trim().toLocaleLowerCase('es');
      if(availableEquipment.size&&equipment&&availableEquipment.has(equipment)){score+=15;reasons.push('equipment_match');}
      if(sourceCategory&&String(candidate.category||'').trim().toLocaleLowerCase('es')===sourceCategory){score+=10;reasons.push('same_category');}
      if(!equipment){score+=5;reasons.push('no_equipment_required');}
      return {...candidate,score,reasons};
    })
    .sort((left,right)=>right.score-left.score||String(left.name).localeCompare(String(right.name),'es'))
    .slice(0,b.limit);

  ok(res,{
    source,
    humanReviewRequired:false,
    healthAutomationBlocked:false,
    limitationsApplied:false,
    suggestions
  });
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
  const tenantId = ctx(req).tenantId;

  const routine = await prisma.$transaction(async (tx) => {
    const memberRows = await tx.$queryRawUnsafe<any[]>(`
      SELECT "id" FROM public."GymMember"
      WHERE "tenantId"=$1 AND "id"=$2
      LIMIT 1
    `, tenantId, b.memberId);
    if (!memberRows.length) throw new HttpError(422, 'El cliente no pertenece al tenant activo.');

    if (b.trainerId) {
      const trainerRows = await tx.$queryRawUnsafe<any[]>(`
        SELECT "id" FROM public."GymTrainer"
        WHERE "tenantId"=$1 AND "id"=$2
        LIMIT 1
      `, tenantId, b.trainerId);
      if (!trainerRows.length) throw new HttpError(422, 'El instructor no pertenece al tenant activo.');
    }

    const routineRows = await tx.$queryRawUnsafe<any[]>(`
      INSERT INTO public."GymRoutine" ("id","tenantId","memberId","trainerId","name","goal","level","trainingMode","startsAt","endsAt","daysPerWeek","notes","active","createdAt","updatedAt")
      VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8::date,$9::date,$10,$11,true,now(),now())
      RETURNING *
    `, tenantId,b.memberId,b.trainerId||null,b.name,b.goal||null,b.level,b.trainingMode,b.startsAt||null,b.endsAt||null,b.daysPerWeek,b.notes||null);
    const createdRoutine = one(routineRows);

    for (const item of b.exercises) {
      let exerciseId = item.exerciseId || null;
      if (exerciseId) {
        const exerciseRows = await tx.$queryRawUnsafe<any[]>(`
          SELECT "id" FROM public."GymExercise"
          WHERE "tenantId"=$1 AND "id"=$2
          LIMIT 1
        `, tenantId, exerciseId);
        if (!exerciseRows.length) throw new HttpError(422, 'El ejercicio seleccionado no pertenece al tenant activo.');
      } else {
        const exerciseRows = await tx.$queryRawUnsafe<any[]>(`
          INSERT INTO public."GymExercise" AS existing ("id","tenantId","name","muscleGroup","equipment","instructions","active","createdAt","updatedAt")
          VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,true,now(),now())
          ON CONFLICT ("tenantId","name")
          DO UPDATE SET
            "muscleGroup"=COALESCE(EXCLUDED."muscleGroup", existing."muscleGroup"),
            "equipment"=COALESCE(EXCLUDED."equipment", existing."equipment"),
            "instructions"=COALESCE(EXCLUDED."instructions", existing."instructions"),
            "updatedAt"=now()
          RETURNING "id"
        `, tenantId,item.exerciseName,item.muscleGroup||null,item.equipment||null,item.instructions||null);
        exerciseId = exerciseRows[0]?.id;
      }

      await tx.$executeRawUnsafe(`
        INSERT INTO public."GymRoutineExercise" ("id","tenantId","routineId","exerciseId","dayOfWeek","sortOrder","sets","reps","loadKg","restSeconds","tempo","notes","intensityTechnique","techniqueConfig","progressionStrategy","progressionConfig")
        VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15::jsonb)
      `, tenantId,createdRoutine.id,exerciseId,item.dayOfWeek,item.sortOrder,item.sets,item.reps,item.loadKg??null,item.restSeconds,item.tempo||null,item.notes||null,item.intensityTechnique,JSON.stringify(item.techniqueConfig||{}),item.progressionStrategy,JSON.stringify(item.progressionConfig||{}));
    }

    return createdRoutine;
  });

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

export default router;
