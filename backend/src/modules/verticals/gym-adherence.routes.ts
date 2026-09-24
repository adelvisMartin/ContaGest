import { Router } from 'express';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requirePermission } from '../../shared/middleware/context.js';
import { ctx, one } from './verticals.shared.js';
import { mealAdherenceSchema } from './gym.schemas.js';

const router = Router();

router.get('/gym/adherence', requirePermission('gym.manage'), asyncHandler(async(req,res)=>{
  const tenantId=ctx(req).tenantId;
  const memberId=String(req.query.memberId||'').trim();
  if(!memberId)throw new HttpError(422,'memberId es obligatorio.');

  const memberRows=await prisma.$queryRawUnsafe<any[]>(`
    SELECT "id","fullName","goals"
    FROM public."GymMember"
    WHERE "tenantId"=$1 AND "id"=$2
    LIMIT 1
  `,tenantId,memberId);
  const member=one(memberRows,'El cliente no pertenece al tenant activo.');

  const mealRows=await prisma.$queryRawUnsafe<any[]>(`
    SELECT p."id" AS "nutritionPlanId",p."name" AS "planName",p."startsAt",p."endsAt",p."active",
           m."id" AS "mealId",m."dayIndex",m."dayOfWeek",m."sortOrder",m."mealType",m."plannedAt",
           CASE WHEN p."startsAt" IS NULL THEN NULL
                ELSE (p."startsAt"::date + (m."dayIndex"-1))::date END AS "plannedDate"
    FROM public."GymNutritionPlan" p
    JOIN public."GymMeal" m
      ON m."tenantId"=p."tenantId" AND m."nutritionPlanId"=p."id"
    WHERE p."tenantId"=$1 AND p."memberId"=$2
    ORDER BY p."createdAt" DESC,m."dayIndex",m."sortOrder"
  `,tenantId,memberId);

  const eventRows=await prisma.$queryRawUnsafe<any[]>(`
    SELECT DISTINCT ON (e."mealId")
      e.*
    FROM public."GymMealAdherenceEvent" e
    WHERE e."tenantId"=$1 AND e."memberId"=$2
    ORDER BY e."mealId",e."recordedAt" DESC,e."id" DESC
  `,tenantId,memberId);
  const latestEventByMeal=new Map(eventRows.map((event:any)=>[String(event.mealId),event]));

  const today=new Date().toISOString().slice(0,10);
  const meals=mealRows.map((meal:any)=>{
    const latest:any=latestEventByMeal.get(String(meal.mealId))||null;
    const plannedDate=meal.plannedDate?new Date(meal.plannedDate).toISOString().slice(0,10):null;
    const due=Boolean(plannedDate&&plannedDate<=today);
    return {
      ...meal,
      plannedDate,
      due,
      latestEvent:latest,
      latestStatus:latest?.status||'pending'
    };
  });
  const dueMeals=meals.filter((meal:any)=>meal.due);
  const completedMeals=dueMeals.filter((meal:any)=>meal.latestStatus==='completed').length;
  const skippedMeals=dueMeals.filter((meal:any)=>meal.latestStatus==='skipped').length;
  const pendingMeals=Math.max(0,dueMeals.length-completedMeals-skippedMeals);
  const adherencePct=dueMeals.length?Number(((completedMeals/dueMeals.length)*100).toFixed(1)):0;

  const byDate=new Map<string,any[]>();
  for(const meal of dueMeals){
    const key=String(meal.plannedDate);
    const list=byDate.get(key)||[];
    list.push(meal);
    byDate.set(key,list);
  }
  const dates=[...byDate.keys()].sort((a,b)=>b.localeCompare(a));
  let nutritionCompletionStreakDays=0;
  for(const date of dates){
    const dayMeals=byDate.get(date)||[];
    if(dayMeals.length&&dayMeals.every((meal:any)=>meal.latestStatus==='completed'))nutritionCompletionStreakDays+=1;
    else break;
  }

  const trainingRows=await prisma.$queryRawUnsafe<any[]>(`
    SELECT "id","startedAt","completedAt"
    FROM public."GymWorkoutSession"
    WHERE "tenantId"=$1 AND "memberId"=$2
      AND "status"='completed'
      AND COALESCE("completedAt","startedAt")>=now()-interval '28 days'
    ORDER BY COALESCE("completedAt","startedAt") DESC
  `,tenantId,memberId);
  const trainingDays=new Set(trainingRows.map((row:any)=>new Date(row.completedAt||row.startedAt).toISOString().slice(0,10))).size;
  const trainingCompletedSessions=trainingRows.length;

  const assessmentRows=await prisma.$queryRawUnsafe<any[]>(`
    SELECT *
    FROM public."GymAssessment"
    WHERE "tenantId"=$1 AND "memberId"=$2
    ORDER BY "measuredAt" DESC,"createdAt" DESC
    LIMIT 2
  `,tenantId,memberId);
  const latestAssessment=assessmentRows[0]||null;
  const previousAssessment=assessmentRows[1]||null;
  const weightDeltaKg=latestAssessment?.weightKg!=null&&previousAssessment?.weightKg!=null
    ? Number((Number(latestAssessment.weightKg)-Number(previousAssessment.weightKg)).toFixed(2))
    : null;

  ok(res,{
    member,
    nutrition:{
      plannedMeals:meals.length,
      dueMeals:dueMeals.length,
      completedMeals,
      skippedMeals,
      pendingMeals,
      adherencePct,
      nutritionCompletionStreakDays,
      meals
    },
    training:{
      periodDays:28,
      trainingCompletedSessions,
      trainingDays
    },
    evolution:{
      latestAssessment,
      previousAssessment,
      weightDeltaKg
    }
  });
}));

router.post('/gym/adherence/meals', requirePermission('gym.manage'), asyncHandler(async(req,res)=>{
  const tenantId=ctx(req).tenantId;
  const b=mealAdherenceSchema.parse(req.body||{});
  const created=await prisma.$transaction(async(tx)=>{
    const memberRows=await tx.$queryRawUnsafe<any[]>(`
      SELECT "id"
      FROM public."GymMember"
      WHERE "tenantId"=$1 AND "id"=$2
      LIMIT 1
    `,tenantId,b.memberId);
    if(!memberRows.length)throw new HttpError(422,'El cliente no pertenece al tenant activo.');

    const planRows=await tx.$queryRawUnsafe<any[]>(`
      SELECT "id","memberId","startsAt","active"
      FROM public."GymNutritionPlan"
      WHERE "tenantId"=$1 AND "id"=$2 AND "memberId"=$3
      LIMIT 1
    `,tenantId,b.nutritionPlanId,b.memberId);
    if(!planRows.length)throw new HttpError(422,'El plan nutricional no pertenece al cliente activo.');
    const plan=planRows[0];
    if(!plan.startsAt)throw new HttpError(409,'El plan necesita fecha de inicio para registrar adherencia temporal.');

    const mealRows=await tx.$queryRawUnsafe<any[]>(`
      SELECT "id","nutritionPlanId","dayIndex"
      FROM public."GymMeal"
      WHERE "tenantId"=$1 AND "id"=$2 AND "nutritionPlanId"=$3
      LIMIT 1
    `,tenantId,b.mealId,b.nutritionPlanId);
    if(!mealRows.length)throw new HttpError(422,'La comida planificada no pertenece al plan seleccionado.');
    const meal=mealRows[0];
    const plannedDate=new Date(plan.startsAt);
    plannedDate.setUTCDate(plannedDate.getUTCDate()+Number(meal.dayIndex||1)-1);
    const today=new Date();
    const todayUtc=new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),today.getUTCDate()));
    if(plannedDate.getTime()>todayUtc.getTime())throw new HttpError(409,'No se puede registrar adherencia de una comida futura.');

    await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',`gym-meal-adherence-47:${tenantId}:${b.mealId}`);
    const rows=await tx.$queryRawUnsafe<any[]>(`
      INSERT INTO public."GymMealAdherenceEvent"
        ("id","tenantId","memberId","nutritionPlanId","mealId","status","notes","recordedBy","recordedAt")
      VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,now())
      RETURNING *
    `,tenantId,b.memberId,b.nutritionPlanId,b.mealId,b.status,b.notes||null,ctx(req).userId||null);
    return one(rows);
  });
  ok(res,created,201);
}));


export default router;
