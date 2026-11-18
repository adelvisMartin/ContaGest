import { createHash } from 'node:crypto';
import { Router } from 'express';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requirePermission } from '../../shared/middleware/context.js';
import { ctx, one } from './verticals.shared.js';
import { evaluateGymProgression } from './gym.progression.js';
import { nextPeriodizationVersion } from './gym-program-version.js';
import { parseGymExerciseFilters } from './gym-exercise-filters.js';
import { gymPerformanceSessionDay } from './gym-performance-day.mjs';
import { gymEpleyEstimate } from './gym-performance-estimate.mjs';
import { gymHistoricalPlanCoverage, gymHistoricalSetAdherence } from './gym-performance-adherence.mjs';
import { parseGymMemberQuery } from './gym-member-query.js';
import {
  exerciseLibrarySchema,
  exerciseLibraryPatchSchema,
  progressionEvaluationSchema,
  periodizationTemplateSchema,
  periodizationProgramSchema,
  workoutSessionSchema,
  workoutSessionTransitionSchema,
  exerciseSubstitutionSchema,
  workoutSetSchema,
  performanceQuerySchema,
  routineSchema
} from './gym.schemas.js';

const router = Router();

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




// Inventory planning input only: an exercise's equipment label is not
// proof that a physical asset is safe, working, available or reservable.
router.get('/gym/equipment-requirements', requirePermission('gym.manage'), asyncHandler(async (req, res) => {
  const tenantId=ctx(req).tenantId;
  const rows=await prisma.$queryRawUnsafe<Array<{equipment:string;exerciseCount:number}>>(`
    SELECT btrim("equipment") AS "equipment",count(*)::int AS "exerciseCount"
    FROM public."GymExercise"
    WHERE "tenantId"=$1 AND "active"=true AND NULLIF(btrim("equipment"),'') IS NOT NULL
    GROUP BY btrim("equipment")
    ORDER BY "exerciseCount" DESC,"equipment" ASC
    LIMIT 201
  `,tenantId);
  ok(res,{items:rows.slice(0,200),truncated:rows.length>200,
    authority:'exercise_equipment_requirements',assetAvailabilityVerified:false});
}));

router.get('/gym/exercises', requirePermission('gym.manage'), asyncHandler(async (req, res) => {
  const tenantId=ctx(req).tenantId;
  let filters: ReturnType<typeof parseGymExerciseFilters>;
  try { filters=parseGymExerciseFilters(req.query); }
  catch { throw new HttpError(422,'Filtros de ejercicios inválidos.'); }
  const {q,muscleGroup,equipment,category,active,take,skip}=filters;
  const rows=await prisma.$queryRawUnsafe<any[]>(`
    SELECT *
    FROM public."GymExercise"
    WHERE "tenantId"=$1
      AND ($2='' OR "name" ILIKE '%'||$2||'%' OR COALESCE("instructions",'') ILIKE '%'||$2||'%')
      AND ($3='' OR COALESCE("muscleGroup",'')=$3)
      AND ($4='' OR COALESCE("equipment",'')=$4)
      AND ($5='' OR COALESCE("category",'')=$5)
      AND ($6='' OR "active"=($6='true'))
    ORDER BY "active" DESC,"muscleGroup" NULLS LAST,"name","id"
    LIMIT $7 OFFSET $8
  `,tenantId,q,muscleGroup,equipment,category,active,take+1,skip);
  const hasMore=rows.length>take;
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('X-Pagination-Has-More',hasMore?'true':'false');
  if(hasMore)res.setHeader('X-Pagination-Next-Skip',String(skip+take));
  ok(res,rows.slice(0,take));
}));

router.post('/gym/exercises', requirePermission('gym.manage'), asyncHandler(async (req, res) => {
  const tenantId=ctx(req).tenantId;
  const b=exerciseLibrarySchema.parse(req.body||{});
  const created=await prisma.$transaction(async tx=>{
    await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(hashtextextended($1,0))::text AS locked',
      'gym-exercise-name:'+tenantId+':'+b.name.trim().toLowerCase());
    const existing=await tx.$queryRawUnsafe<any[]>(`
    SELECT "id" FROM public."GymExercise"
    WHERE "tenantId"=$1 AND lower("name")=lower($2)
    LIMIT 1
  `,tenantId,b.name);
  if(existing.length)throw new HttpError(409,'Ya existe un ejercicio con ese nombre.');
  const rows=await tx.$queryRawUnsafe<any[]>(`
    INSERT INTO public."GymExercise"
      ("id","tenantId","name","category","muscleGroup","equipment","instructions","mediaUrl","defaultSets","defaultReps","active","createdAt","updatedAt")
    VALUES
      (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now(),now())
    ON CONFLICT ("tenantId","name") DO NOTHING
    RETURNING *
  `,tenantId,b.name,b.category||null,b.muscleGroup||null,b.equipment||null,b.instructions||null,b.mediaUrl||null,b.defaultSets??null,b.defaultReps||null,b.active);
  if(!rows.length)throw new HttpError(409,'Ya existe un ejercicio con ese nombre.');
    return one(rows);
  });
  ok(res,created,201);
}));

router.patch('/gym/exercises/:id', requirePermission('gym.manage'), asyncHandler(async (req, res) => {
  const tenantId=ctx(req).tenantId;
  const b=exerciseLibraryPatchSchema.parse(req.body||{});
  const updated=await prisma.$transaction(async tx=>{
  if(b.name){
    await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(hashtextextended($1,0))::text AS locked',
      'gym-exercise-name:'+tenantId+':'+b.name.trim().toLowerCase());
    const duplicate=await tx.$queryRawUnsafe<any[]>(`
      SELECT "id" FROM public."GymExercise"
      WHERE "tenantId"=$1 AND lower("name")=lower($2) AND "id"<>$3
      LIMIT 1
    `,tenantId,b.name,String(req.params.id));
    if(duplicate.length)throw new HttpError(409,'Ya existe otro ejercicio con ese nombre.');
  }
  const currentRows=await tx.$queryRawUnsafe<any[]>(`
    SELECT * FROM public."GymExercise"
    WHERE "tenantId"=$1 AND "id"=$2
    LIMIT 1
  `,tenantId,String(req.params.id));
  const current=one(currentRows,'Ejercicio no encontrado.');
  const next={...current,...b};
  const rows=await tx.$queryRawUnsafe<any[]>(`
    UPDATE public."GymExercise"
    SET "name"=$3,"category"=$4,"muscleGroup"=$5,"equipment"=$6,"instructions"=$7,
        "mediaUrl"=$8,"defaultSets"=$9,"defaultReps"=$10,"active"=$11,"updatedAt"=now()
    WHERE "tenantId"=$1 AND "id"=$2
    RETURNING *
  `,tenantId,current.id,next.name,next.category||null,next.muscleGroup||null,next.equipment||null,next.instructions||null,next.mediaUrl||null,next.defaultSets??null,next.defaultReps||null,Boolean(next.active));
  return one(rows);
  });
  ok(res,updated);
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
    await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(hashtextextended($1,0))::text AS locked',lockKey);
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
    await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(hashtextextended($1,0))::text AS locked',lockKey);
    const versionRows=await tx.$queryRawUnsafe<any[]>(`
      SELECT COALESCE(MAX("version"),0)::int AS "maxVersion"
      FROM public."GymPeriodizationProgram"
      WHERE "tenantId"=$1 AND "programKey"=$2
    `,tenantId,source.programKey);
    const maxVersion=Number(versionRows[0]?.maxVersion);
    let nextVersion:number;
    try {
      nextVersion=nextPeriodizationVersion(Number(source.version),maxVersion);
    } catch(error) {
      if(!(error instanceof TypeError))throw error;
      throw new HttpError(409,error.message==='GYM_PERIODIZATION_STALE_VERSION'
        ?'Solo la versión más reciente puede generar una nueva revisión.'
        :'La numeración de versiones del programa no es segura.');
    }
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
    ORDER BY (s."status" IN ('in_progress','paused')) DESC,s."startedAt" DESC
    LIMIT 200
  `,tenantId,memberId);
  ok(res,rows);
}));

router.post('/gym/workout-sessions', requirePermission('gym.manage'), asyncHandler(async (req, res) => {
  const b=workoutSessionSchema.parse(req.body||{});
  const tenantId=ctx(req).tenantId;
  const created=await prisma.$transaction(async(tx)=>{
    const routineRows=await tx.$queryRawUnsafe<Array<{id:string;memberId:string}>>(`
      SELECT "id","memberId" FROM public."GymRoutine"
      WHERE "tenantId"=$1 AND "id"=$2 AND "active"=true LIMIT 1
    `,tenantId,b.routineId);
    if(!routineRows.length)throw new HttpError(422,'La rutina no pertenece al tenant activo.');
    const routine=routineRows[0];
    const lockKey=`gym-workout-session:${tenantId}:${routine.memberId}`;
    await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(hashtextextended($1,0))::text AS locked',lockKey);
    const activeRows=await tx.$queryRawUnsafe<Array<{id:string}>>(`
      SELECT "id" FROM public."GymWorkoutSession"
      WHERE "tenantId"=$1 AND "memberId"=$2 AND "status" IN ('in_progress','paused') LIMIT 1
    `,tenantId,routine.memberId);
    if(activeRows.length)throw new HttpError(409,'El cliente ya tiene una sesión activa.');
    // Preserve the exact effective program revision and prescribed exercises.
    // Both are selected server-side, never from an untrusted client payload.
    const programs=await tx.$queryRawUnsafe<Array<{
      id:string;programKey:string;version:number;name:string;structure:unknown;
      startsAt:Date|null
    }>>(`
      SELECT "id","programKey","version","name","structure","startsAt"
      FROM public."GymPeriodizationProgram"
      WHERE "tenantId"=$1 AND "routineId"=$2
        AND ("startsAt" IS NULL OR "startsAt"<=CURRENT_DATE)
      ORDER BY "startsAt" DESC NULLS LAST,"createdAt" DESC,"version" DESC,"id" DESC
      LIMIT 1
    `,tenantId,routine.id);
    const program=programs[0]||null;
    const programSnapshot=program ? {
      programKey:program.programKey,version:program.version,name:program.name,
      startsAt:program.startsAt,structure:program.structure
    } : null;
    const prescription=await tx.$queryRawUnsafe<any[]>(`
      SELECT re."id",re."routineId",re."exerciseId",
        COALESCE(e."name",'Ejercicio retirado') AS "exerciseName",e."muscleGroup",
        re."dayOfWeek",re."sortOrder",re."sets",re."reps",
        re."loadKg",re."restSeconds",re."tempo",re."notes",
        re."intensityTechnique",re."techniqueConfig",
        re."progressionStrategy",re."progressionConfig"
      FROM public."GymRoutineExercise" re
      LEFT JOIN public."GymExercise" e
        ON e."tenantId"=re."tenantId" AND e."id"=re."exerciseId"
      WHERE re."tenantId"=$1 AND re."routineId"=$2
      ORDER BY re."dayOfWeek",re."sortOrder",re."id"
    `,tenantId,routine.id);
    const rows=await tx.$queryRawUnsafe<any[]>(`
      INSERT INTO public."GymWorkoutSession"
        ("id","tenantId","routineId","memberId","status","startedAt","completedAt",
         "notes","createdBy","createdAt","updatedAt",
         "programVersionId","programSnapshot","routineSnapshot")
      VALUES (gen_random_uuid()::text,$1,$2,$3,'in_progress',now(),NULL,
        $4,$5,now(),now(),$6,$7::jsonb,$8::jsonb)
      RETURNING *
    `,tenantId,routine.id,routine.memberId,b.notes||null,ctx(req).userId||null,
      program?.id||null,programSnapshot?JSON.stringify(programSnapshot):null,JSON.stringify(prescription));
    return one(rows);
  });
  ok(res,{...created,sets:[]},201);
}));

// #792: audit events and state changes share one canonical session row.
router.get('/gym/workout-sessions/:id/transitions', requirePermission('gym.manage'), asyncHandler(async(req,res)=>{
  const tenantId=ctx(req).tenantId;
  const sessionId=String(req.params.id);
  const owned=await prisma.$queryRawUnsafe<Array<{id:string}>>(
    'SELECT "id" FROM public."GymWorkoutSession" WHERE "tenantId"=$1 AND "id"=$2',
    tenantId,sessionId
  );
  if(!owned.length)throw new HttpError(404,'Sesión no encontrada en la empresa.');
  const events=await prisma.$queryRawUnsafe<any[]>(`
    SELECT "id","sessionId","action","fromStatus","toStatus","reason","actorId","createdAt"
    FROM public."GymWorkoutSessionTransition"
    WHERE "tenantId"=$1 AND "sessionId"=$2
    ORDER BY "createdAt" ASC,"id" ASC LIMIT 200
  `,tenantId,sessionId);
  res.setHeader('Cache-Control','private, no-store');
  ok(res,events);
}));

router.post('/gym/workout-sessions/:id/transition', requirePermission('gym.manage'), asyncHandler(async(req,res)=>{
  const b=workoutSessionTransitionSchema.parse(req.body||{});
  const tenantId=ctx(req).tenantId;
  const actorId=ctx(req).userId;
  if(!actorId)throw new HttpError(403,'No hay un usuario autorizado para la transición.');
  const sessionId=String(req.params.id);
  const reason=b.reason?.trim()||null;
  const result=await prisma.$transaction(async tx=>{
    // The event key also serializes requests that accidentally reuse the same
    // key across different session IDs. No conflicting 500 from unique races.
    await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(hashtextextended($1,0))::text AS locked',
      `gym-workout-transition:${tenantId}:${b.eventKey}`);
    const sessions=await tx.$queryRawUnsafe<Array<{id:string;status:string}>>(`
      SELECT "id","status" FROM public."GymWorkoutSession"
      WHERE "tenantId"=$1 AND "id"=$2 FOR UPDATE
    `,tenantId,sessionId);
    const session=one(sessions,'Sesión de entrenamiento no encontrada.');
    const prior=await tx.$queryRawUnsafe<Array<{
      id:string;sessionId:string;action:string;reason:string|null;
      fromStatus:string;toStatus:string;actorId:string;createdAt:Date;
    }>>(`
      SELECT "id","sessionId","action","reason","fromStatus","toStatus","actorId","createdAt"
      FROM public."GymWorkoutSessionTransition"
      WHERE "tenantId"=$1 AND "eventKey"=$2
    `,tenantId,b.eventKey);
    if(prior.length){
      if(prior[0].sessionId!==sessionId||prior[0].action!==b.action||(prior[0].reason||null)!==reason)
        throw new HttpError(409,'La clave de transición pertenece a otra operación.');
      const current=await tx.$queryRawUnsafe<any[]>(
        'SELECT * FROM public."GymWorkoutSession" WHERE "tenantId"=$1 AND "id"=$2',
        tenantId,sessionId
      );
      return {session:one(current),transition:prior[0],replayed:true};
    }
    const allowed=b.action==='pause'
      ? session.status==='in_progress'
      : b.action==='resume'
        ? session.status==='paused'
        : ['in_progress','paused'].includes(session.status);
    if(!allowed)throw new HttpError(409,'El estado actual no permite esta transición.');
    const nextStatus=b.action==='pause'?'paused':b.action==='resume'?'in_progress':'abandoned';
    const changed=await tx.$queryRawUnsafe<any[]>(`
      UPDATE public."GymWorkoutSession"
      SET "status"=$3,"abandonedAt"=CASE WHEN $3='abandoned' THEN now() ELSE "abandonedAt" END,
        "updatedAt"=now()
      WHERE "tenantId"=$1 AND "id"=$2 AND "status"=$4
      RETURNING *
    `,tenantId,sessionId,nextStatus,session.status);
    if(changed.length!==1)throw new HttpError(409,'Conflicto de transición de entrenamiento.');
    const transitions=await tx.$queryRawUnsafe<any[]>(`
      INSERT INTO public."GymWorkoutSessionTransition"
        ("id","tenantId","sessionId","eventKey","action","fromStatus","toStatus","reason","actorId","createdAt")
      VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8,now())
      RETURNING "id","sessionId","action","fromStatus","toStatus","reason","actorId","createdAt"
    `,tenantId,sessionId,b.eventKey,b.action,session.status,nextStatus,reason,actorId);
    return {session:one(changed),transition:one(transitions),replayed:false};
  });
  ok(res,result,result.replayed?200:201);
}));

router.post('/gym/workout-sessions/:id/sets', requirePermission('gym.manage'), asyncHandler(async (req, res) => {
  const b=workoutSetSchema.parse(req.body||{});
  const tenantId=ctx(req).tenantId;
  const sessionId=String(req.params.id);
  const {eventKey,...eventData}=b;
  const fingerprint=eventKey?createHash('sha256').update(JSON.stringify(eventData)).digest('hex'):null;
  const created=await prisma.$transaction(async(tx)=>{
    if(eventKey){
      // Lock identity before the session row; concurrent and cross-session
      // replays cannot race the unique constraint or debit twice.
      await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(hashtextextended($1,0))::text AS locked',
        `gym-workout-set-event:${tenantId}:${eventKey}`);
      const previous=await tx.$queryRawUnsafe<any[]>(`
        SELECT * FROM public."GymWorkoutSet"
        WHERE "tenantId"=$1 AND "eventKey"=$2 LIMIT 1
      `,tenantId,eventKey);
      if(previous.length){
        if(previous[0].sessionId!==sessionId||previous[0].requestFingerprint!==fingerprint)
          throw new HttpError(409,'La clave de serie ya pertenece a otra operación.');
        return {set:previous[0],replayed:true};
      }
    }
    const sessionRows=await tx.$queryRawUnsafe<any[]>(`
      SELECT s.*
      FROM public."GymWorkoutSession" s
      WHERE s."tenantId"=$1 AND s."id"=$2
      LIMIT 1
      FOR UPDATE OF s
    `,tenantId,sessionId);
    const session=one(sessionRows,'Sesión de entrenamiento no encontrada.');
    if(session.status!=='in_progress')throw new HttpError(409,'La sesión ya está completada.');
    // Session prescription was captured server-side at start. Do not let
    // later edits to the routine silently reinterpret a performed set.
    // Legacy sessions created before snapshots can still use the former
    // live-routine lookup, but a present snapshot is authoritative.
    const snapshot=Array.isArray(session.routineSnapshot)?session.routineSnapshot:null;
    const prescribedSnapshot=snapshot?.find((entry:any)=>
      entry&&entry.id===b.routineExerciseId&&entry.routineId===session.routineId)||null;
    if(snapshot&&!prescribedSnapshot)
      throw new HttpError(409,'El ejercicio no forma parte de la prescripción inicial de esta sesión.');

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
    if(prescribedSnapshot&&prescribedSnapshot.exerciseId!==prescribedExercise.exerciseId)
      throw new HttpError(409,'La rutina cambió después de iniciar la sesión; revisa la prescripción original.');

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
      const originalMuscle=prescribedSnapshot&&Object.hasOwn(prescribedSnapshot,'muscleGroup')
        ?prescribedSnapshot.muscleGroup:prescribedExercise.muscleGroup;
      const prescribedMuscle=String(originalMuscle||'').trim().toLocaleLowerCase('es');
      const substituteMuscle=String(substitute.muscleGroup||'').trim().toLocaleLowerCase('es');
      if(!prescribedMuscle||!substituteMuscle||prescribedMuscle!==substituteMuscle){
        throw new HttpError(422,'El ejercicio sustituto debe conservar el mismo grupo muscular.');
      }
      performedExerciseId=String(substitute.id);
      substitutionReason=String(b.substitutionReason||'').trim()||'explicit_session_substitution';
    }

    const duplicate=await tx.$queryRawUnsafe<any[]>(`
      SELECT "id" FROM public."GymWorkoutSet"
      WHERE "tenantId"=$4 AND "sessionId"=$1 AND "routineExerciseId"=$2 AND "setNumber"=$3
      LIMIT 1
    `,session.id,b.routineExerciseId,b.setNumber,tenantId);
    if(duplicate.length)throw new HttpError(409,'La serie indicada ya fue registrada.');

    const completed=b.status==='completed';
    const rows=await tx.$queryRawUnsafe<any[]>(`
      INSERT INTO public."GymWorkoutSet"
        ("id","tenantId","sessionId","routineExerciseId","setNumber","status","loadKg","reps","rir","rpe","restSeconds","notes","performedExerciseId","substitutionReason","recordedAt","createdBy","eventKey","requestFingerprint")
      VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now(),$14,$15,$16)
      RETURNING *
    `,tenantId,session.id,b.routineExerciseId,b.setNumber,b.status,
      completed?(b.loadKg??null):null,
      completed?(b.reps??null):null,
      completed?(b.rir??null):null,
      completed?(b.rpe??null):null,
      b.restSeconds,b.notes||null,
      completed?performedExerciseId:null,
      completed?substitutionReason:null,
      ctx(req).userId||null,eventKey||null,fingerprint);
    return {set:one(rows),replayed:false};
  });
  ok(res,{...created.set,replayed:created.replayed},created.replayed?200:201);
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
    // Only recorded session sets constitute workout completion evidence.
    // Checked under the same transaction and row lock as the status change.
    const setCountRows=await tx.$queryRawUnsafe<Array<{recorded:number}>>(`
      SELECT COUNT(*)::int AS recorded FROM public."GymWorkoutSet"
      WHERE "tenantId"=$1 AND "sessionId"=$2 AND "status" IN ('completed','skipped')
    `,tenantId,session.id);
    if(!Number.isSafeInteger(setCountRows[0]?.recorded)||setCountRows[0].recorded<1)
      throw new HttpError(409,'Registra al menos una serie realizada u omitida antes de completar la sesión.');
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
  let transport:ReturnType<typeof parseGymMemberQuery>;
  try { transport=parseGymMemberQuery(req.query,{requireMember:true,allowDates:true}); }
  catch { throw new HttpError(422,'Filtros de performance inválidos.'); }
  const q=performanceQuerySchema.parse(transport);
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
    SELECT "id","goals" FROM public."GymMember"
    WHERE "tenantId"=$1 AND "id"=$2
    LIMIT 1
  `,tenantId,q.memberId);
  if(!memberRows.length)throw new HttpError(404,'El cliente no pertenece al tenant activo.');

  const sessions=await prisma.$queryRawUnsafe<any[]>(`
    SELECT s."id",s."routineId",s."startedAt",s."completedAt",s."routineSnapshot",r."daysPerWeek"
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
    ORDER BY ws."recordedAt" ASC,ws."id" ASC
  `,tenantId,q.memberId,fromDate.toISOString(),toExclusive.toISOString());

  // #789 captured prescriptions when the session started. Do not recalculate
  // historical adherence from today's mutable routine or invent legacy plans.
  const coverage=gymHistoricalPlanCoverage(sessions);
  const {plannedSets,unknownPlanSessions,planComplete}=coverage;

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
      exerciseId,exerciseName,muscleGroup,completedSets:0,skippedSets:0,totalVolume:0,maxLoadKg:0,maxReps:0,bestEstimated1RmKg:null,bestEstimated1RmSource:null,lastPerformedAt:null
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
    const estimated=gymEpleyEstimate(load,reps);
    totalVolume+=volume;
    exercise.totalVolume+=volume;
    muscle.totalVolume+=volume;
    exercise.maxLoadKg=Math.max(exercise.maxLoadKg,load);
    exercise.maxReps=Math.max(exercise.maxReps,reps);
    if(estimated!=null && (exercise.bestEstimated1RmKg==null || estimated>exercise.bestEstimated1RmKg)){
      exercise.bestEstimated1RmKg=estimated;
      exercise.bestEstimated1RmSource={
        setId:String(row.id),sessionId:String(row.sessionId),
        recordedAt:row.recordedAt,loadKg:load,reps
      };
    }
    exercise.lastPerformedAt=row.recordedAt;

    const date=gymPerformanceSessionDay(row.startedAt);
    if(!dailyMap.has(date))dailyMap.set(date,{date,completedSets:0,totalVolume:0});
    const day=dailyMap.get(date);
    day.completedSets+=1;
    day.totalVolume+=volume;
  }

  const trainingDays=new Set(sessions.map((session:any)=>gymPerformanceSessionDay(session.startedAt))).size;
  const completedSessions=sessions.length;
  const sessionsPerWeek=periodDays>0?Number((completedSessions/(periodDays/7)).toFixed(2)):0;
  const setAdherencePct=gymHistoricalSetAdherence(completedSets,coverage);
  const roundMetrics=(item:any)=>({...item,totalVolume:Number(Number(item.totalVolume||0).toFixed(2))});

  const byExercise=[...byExerciseMap.values()]
    .map((item)=>({...roundMetrics(item),bestEstimated1RmKg:item.bestEstimated1RmKg==null?null:Number(Number(item.bestEstimated1RmKg).toFixed(2))}))
    .sort((a,b)=>b.totalVolume-a.totalVolume||a.exerciseName.localeCompare(b.exerciseName));
  const byMuscleGroup=[...byMuscleMap.values()].map(roundMetrics).sort((a,b)=>b.totalVolume-a.totalVolume||a.muscleGroup.localeCompare(b.muscleGroup));
  const dailyTrend=[...dailyMap.values()].map(roundMetrics).sort((a,b)=>a.date.localeCompare(b.date));

  // Assessment is the existing authoritative longitudinal source. Never
  // mirror medical notes or issue clinical interpretations from Gym metrics.
  const assessmentRows=await prisma.$queryRawUnsafe<any[]>(`
    SELECT "id","measuredAt","weightKg","heightCm","bodyFatPct","muscleMassKg",
      "waistCm","hipCm","chestCm","armCm","thighCm"
    FROM public."GymAssessment"
    WHERE "tenantId"=$1 AND "memberId"=$2
      AND "measuredAt">=$3::timestamptz AND "measuredAt"<$4::timestamptz
    ORDER BY "measuredAt" DESC,"id" DESC LIMIT 201
  `,tenantId,q.memberId,fromDate.toISOString(),toExclusive.toISOString());
  const measurements=assessmentRows.slice(0,200).reverse().map((row:any)=>({
    assessmentId:String(row.id),measuredAt:row.measuredAt,
    ...Object.fromEntries(
      ['weightKg','heightCm','bodyFatPct','muscleMassKg','waistCm','hipCm',
        'chestCm','armCm','thighCm'].map((key)=>[key,row[key]==null?null:Number(row[key])])
    )
  }));

  ok(res,{
    period:{from,to,days:periodDays},
    summary:{
      completedSessions,
      trainingDays,
      sessionsPerWeek,
      plannedSets,
      unknownPlanSessions,
      planComplete,
      completedSets,
      skippedSets,
      setAdherencePct,
      totalVolume:Number(totalVolume.toFixed(2))
    },
    byExercise,
    byMuscleGroup,
    dailyTrend,
    provenance:{
      timeZone:'UTC',
      estimated1Rm:{formula:'Epley',version:1,validReps:{min:1,max:12},unit:'kg'},
      totalVolume:{formula:'sum(loadKg * reps) over completed sets',unit:'kg·rep'},
      setAdherence:{formula:'completedSets / sum(snapshot exercise sets)',source:'GymWorkoutSession.routineSnapshot',legacy:'unavailable'},
      source:'GymWorkoutSet / completed GymWorkoutSession',
      dates:'WorkoutSession.startedAt'
    },
    measurements:{items:measurements,truncated:assessmentRows.length>200,
      source:'GymAssessment',timeZone:'UTC'},
    goals:{current:Array.isArray(memberRows[0]?.goals)?memberRows[0].goals:[],historical:false}
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

  if(!String(source.muscleGroup||'').trim()){
    ok(res,{
      source,
      humanReviewRequired:false,
      healthAutomationBlocked:false,
      limitationsApplied:false,
      contextInsufficient:true,
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


export default router;
