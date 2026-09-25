import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requirePermission } from '../../shared/middleware/context.js';
import { ctx, one } from './verticals.shared.js';
import {
  ingredientSchema,
  ingredientPatchSchema,
  nutritionRuleSchema,
  nutritionRulePatchSchema,
  ingredientNutritionProfileSchema,
  recipeSchema,
  completeNutritionSchema
} from './gym.schemas.js';

const router = Router();

const createPlanNutrientSnapshot=async(tx:Prisma.TransactionClient,tenantId:string,planId:string,createdBy:string|null)=>{
  const occurrences=await tx.$queryRawUnsafe<any[]>(`
    SELECT m."id" AS "mealId",mi."ingredientId",mi."quantity"::numeric AS "quantity",mi."unit"
    FROM public."GymMeal" m
    JOIN public."GymMealItem" mi ON mi."tenantId"=m."tenantId" AND mi."mealId"=m."id"
    WHERE m."tenantId"=$1 AND m."nutritionPlanId"=$2
    UNION ALL
    SELECT m."id" AS "mealId",ri."ingredientId",
           (ri."quantity"::numeric*m."servings"::numeric/r."servings"::numeric) AS "quantity",
           ri."unit"
    FROM public."GymMeal" m
    JOIN public."GymRecipe" r ON r."tenantId"=m."tenantId" AND r."id"=m."recipeId"
    JOIN public."GymRecipeItem" ri ON ri."tenantId"=r."tenantId" AND ri."recipeId"=r."id"
    WHERE m."tenantId"=$1 AND m."nutritionPlanId"=$2
  `,tenantId,planId);

  const ingredientIds=[...new Set(occurrences.map((row:any)=>String(row.ingredientId)))];
  const profiles=ingredientIds.length?await tx.$queryRawUnsafe<any[]>(`
    SELECT DISTINCT ON (p."ingredientId")
      p.*,i."name" AS "ingredientName"
    FROM public."GymIngredientNutritionProfile" p
    JOIN public."GymIngredient" i ON i."tenantId"=p."tenantId" AND i."id"=p."ingredientId"
    WHERE p."tenantId"=$1 AND p."ingredientId"=ANY($2::text[])
    ORDER BY p."ingredientId",p."version" DESC
  `,tenantId,ingredientIds):[];
  const profileByIngredient=new Map(profiles.map((row:any)=>[String(row.ingredientId),row]));
  const profileIds=profiles.map((row:any)=>String(row.id));
  const micronutrients=profileIds.length?await tx.$queryRawUnsafe<any[]>(`
    SELECT * FROM public."GymIngredientMicronutrient"
    WHERE "tenantId"=$1 AND "profileId"=ANY($2::text[])
    ORDER BY "profileId","key","unit"
  `,tenantId,profileIds):[];
  const microByProfile=new Map<string,any[]>();
  for(const row of micronutrients){
    const key=String(row.profileId);
    const list=microByProfile.get(key)||[];
    list.push(row);
    microByProfile.set(key,list);
  }

  const totals={energyKcal:0,proteinG:0,carbsG:0,fatG:0,fiberG:0};
  const microTotals=new Map<string,{key:string;label:string;unit:string;amount:number}>();
  const issues:any[]=[];
  const profileRefs:any[]=[];
  const seenRefs=new Set<string>();

  for(const occurrence of occurrences){
    const ingredientId=String(occurrence.ingredientId);
    const profile:any=profileByIngredient.get(ingredientId);
    if(!profile){
      issues.push({code:'MISSING_PROFILE',mealId:String(occurrence.mealId),ingredientId,unit:String(occurrence.unit)});
      continue;
    }
    if(String(occurrence.unit)!==String(profile.basisUnit)){
      issues.push({
        code:'UNIT_MISMATCH',
        mealId:String(occurrence.mealId),
        ingredientId,
        ingredientName:String(profile.ingredientName||'Ingrediente'),
        itemUnit:String(occurrence.unit),
        profileUnit:String(profile.basisUnit)
      });
      continue;
    }
    const basis=Number(profile.basisQuantity);
    const quantity=Number(occurrence.quantity);
    if(!Number.isFinite(basis)||basis<=0||!Number.isFinite(quantity)||quantity<0){
      issues.push({code:'INVALID_QUANTITY',mealId:String(occurrence.mealId),ingredientId});
      continue;
    }
    const factor=quantity/basis;
    totals.energyKcal+=Number(profile.energyKcal)*factor;
    totals.proteinG+=Number(profile.proteinG)*factor;
    totals.carbsG+=Number(profile.carbsG)*factor;
    totals.fatG+=Number(profile.fatG)*factor;
    totals.fiberG+=Number(profile.fiberG)*factor;
    for(const micro of microByProfile.get(String(profile.id))||[]){
      const microKey=`${micro.key}:${micro.unit}`;
      const current=microTotals.get(microKey)||{key:String(micro.key),label:String(micro.label),unit:String(micro.unit),amount:0};
      current.amount+=Number(micro.amount)*factor;
      microTotals.set(microKey,current);
    }
    if(!seenRefs.has(String(profile.id))){
      seenRefs.add(String(profile.id));
      profileRefs.push({
        profileId:String(profile.id),
        ingredientId,
        ingredientName:String(profile.ingredientName||'Ingrediente'),
        version:Number(profile.version),
        basisQuantity:Number(profile.basisQuantity),
        basisUnit:String(profile.basisUnit)
      });
    }
  }

  const rounded=(value:number)=>Math.round((value+Number.EPSILON)*1000)/1000;
  const complete=issues.length===0;
  const snapshotRows=await tx.$queryRawUnsafe<any[]>(`
    INSERT INTO public."GymNutritionPlanNutrientSnapshot"
      ("id","tenantId","planId","complete","energyKcal","proteinG","carbsG","fatG","fiberG","micronutrients","issues","profileRefs","createdBy","createdAt")
    VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12,now())
    RETURNING *
  `,tenantId,planId,complete,rounded(totals.energyKcal),rounded(totals.proteinG),rounded(totals.carbsG),rounded(totals.fatG),rounded(totals.fiberG),
    JSON.stringify([...microTotals.values()].map((item)=>({...item,amount:rounded(item.amount)}))),
    JSON.stringify(issues),JSON.stringify(profileRefs),createdBy);
  return one(snapshotRows);
};

router.get('/gym/ingredients', requirePermission('gym.manage'), asyncHandler(async (req, res) => {
  const q=`%${String(req.query.q||'').trim()}%`;
  const category=String(req.query.category||'').trim();
  const active=String(req.query.active||'').trim();
  const rows=await prisma.$queryRawUnsafe<any[]>(`
    SELECT *
    FROM public."GymIngredient"
    WHERE "tenantId"=$1
      AND ($2='%%' OR "name" ILIKE $2)
      AND ($3='' OR COALESCE("category",'')=$3)
      AND ($4='' OR "active"=$4::boolean)
    ORDER BY "active" DESC,"name" ASC
    LIMIT 1000
  `,ctx(req).tenantId,q,category,active);
  ok(res,rows);
}));

router.post('/gym/ingredients', requirePermission('gym.manage'), asyncHandler(async (req, res) => {
  const b=ingredientSchema.parse(req.body||{});
  const rows=await prisma.$queryRawUnsafe<any[]>(`
    INSERT INTO public."GymIngredient" ("id","tenantId","name","category","defaultUnit","notes","active","createdAt","updatedAt")
    VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,now(),now())
    ON CONFLICT DO NOTHING
    RETURNING *
  `,ctx(req).tenantId,b.name,b.category||null,b.defaultUnit,b.notes||null,b.active);
  if(!rows.length)throw new HttpError(409,'Ya existe un ingrediente con ese nombre en el tenant activo.');
  ok(res,one(rows),201);
}));

router.patch('/gym/ingredients/:id', requirePermission('gym.manage'), asyncHandler(async (req, res) => {
  const b=ingredientPatchSchema.parse(req.body||{});
  const tenantId=ctx(req).tenantId;
  const id=String(req.params.id);
  const currentRows=await prisma.$queryRawUnsafe<any[]>(`
    SELECT * FROM public."GymIngredient" WHERE "tenantId"=$1 AND "id"=$2 LIMIT 1
  `,tenantId,id);
  const current=one(currentRows,'Ingrediente no encontrado.');
  const next={...current,...b};
  const duplicateRows=await prisma.$queryRawUnsafe<any[]>(`
    SELECT "id" FROM public."GymIngredient"
    WHERE "tenantId"=$1 AND "id"<>$2 AND lower(btrim("name"))=lower(btrim($3))
    LIMIT 1
  `,tenantId,id,next.name);
  if(duplicateRows.length)throw new HttpError(409,'Ya existe un ingrediente con ese nombre en el tenant activo.');
  const rows=await prisma.$queryRawUnsafe<any[]>(`
    UPDATE public."GymIngredient"
    SET "name"=$3,"category"=$4,"defaultUnit"=$5,"notes"=$6,"active"=$7,"updatedAt"=now()
    WHERE "tenantId"=$1 AND "id"=$2
    RETURNING *
  `,tenantId,id,next.name,next.category||null,next.defaultUnit,next.notes||null,next.active);
  ok(res,one(rows));
}));

router.get('/gym/ingredients/:id/nutrition-profiles', requirePermission('gym.manage'), asyncHandler(async(req,res)=>{
  const tenantId=ctx(req).tenantId;
  const ingredientId=String(req.params.id);
  const ingredientRows=await prisma.$queryRawUnsafe<any[]>(`
    SELECT "id","name","defaultUnit","active"
    FROM public."GymIngredient"
    WHERE "tenantId"=$1 AND "id"=$2
    LIMIT 1
  `,tenantId,ingredientId);
  const ingredient=one(ingredientRows,'Ingrediente no encontrado.');
  const profiles=await prisma.$queryRawUnsafe<any[]>(`
    SELECT p.*,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id',m."id",'key',m."key",'label',m."label",'amount',m."amount",'unit',m."unit"
        ) ORDER BY m."key",m."unit")
        FROM public."GymIngredientMicronutrient" m
        WHERE m."tenantId"=p."tenantId" AND m."profileId"=p."id"
      ),'[]'::jsonb) AS micronutrients
    FROM public."GymIngredientNutritionProfile" p
    WHERE p."tenantId"=$1 AND p."ingredientId"=$2
    ORDER BY p."version" DESC
    LIMIT 50
  `,tenantId,ingredientId);
  ok(res,{ingredient,latest:profiles[0]||null,history:profiles});
}));

router.post('/gym/ingredients/:id/nutrition-profiles', requirePermission('gym.manage'), asyncHandler(async(req,res)=>{
  const tenantId=ctx(req).tenantId;
  const ingredientId=String(req.params.id);
  const b=ingredientNutritionProfileSchema.parse(req.body||{});
  const created=await prisma.$transaction(async(tx)=>{
    const ingredientRows=await tx.$queryRawUnsafe<any[]>(`
      SELECT "id","name","defaultUnit"
      FROM public."GymIngredient"
      WHERE "tenantId"=$1 AND "id"=$2 AND "active"=true
      LIMIT 1
    `,tenantId,ingredientId);
    if(!ingredientRows.length)throw new HttpError(422,'El ingrediente no pertenece al tenant activo o está archivado.');
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`,`gym-nutrient-profile-46:${tenantId}:${ingredientId}`);
    const versionRows=await tx.$queryRawUnsafe<any[]>(`
      SELECT COALESCE(MAX("version"),0)::int+1 AS "nextVersion"
      FROM public."GymIngredientNutritionProfile"
      WHERE "tenantId"=$1 AND "ingredientId"=$2
    `,tenantId,ingredientId);
    const version=Number(versionRows[0]?.nextVersion||1);
    const rows=await tx.$queryRawUnsafe<any[]>(`
      INSERT INTO public."GymIngredientNutritionProfile"
        ("id","tenantId","ingredientId","version","basisQuantity","basisUnit","energyKcal","proteinG","carbsG","fatG","fiberG","createdBy","createdAt")
      VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())
      RETURNING *
    `,tenantId,ingredientId,version,b.basisQuantity,b.basisUnit,b.energyKcal,b.proteinG,b.carbsG,b.fatG,b.fiberG,ctx(req).userId||null);
    const profile=one(rows);
    for(const micro of b.micronutrients){
      await tx.$executeRawUnsafe(`
        INSERT INTO public."GymIngredientMicronutrient"
          ("id","tenantId","profileId","key","label","amount","unit","createdAt")
        VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,now())
      `,tenantId,profile.id,micro.key,micro.label,micro.amount,micro.unit);
    }
    return {...profile,micronutrients:b.micronutrients};
  });
  ok(res,created,201);
}));

router.get('/gym/nutrition/:id/nutrients', requirePermission('gym.manage'), asyncHandler(async(req,res)=>{
  const tenantId=ctx(req).tenantId;
  const planId=String(req.params.id);
  const planRows=await prisma.$queryRawUnsafe<any[]>(`
    SELECT "id","name","memberId","durationDays"
    FROM public."GymNutritionPlan"
    WHERE "tenantId"=$1 AND "id"=$2
    LIMIT 1
  `,tenantId,planId);
  const plan=one(planRows,'Plan nutricional no encontrado.');
  const snapshots=await prisma.$queryRawUnsafe<any[]>(`
    SELECT *
    FROM public."GymNutritionPlanNutrientSnapshot"
    WHERE "tenantId"=$1 AND "planId"=$2
    LIMIT 1
  `,tenantId,planId);
  ok(res,{plan,snapshot:snapshots[0]||null});
}));

router.get('/gym/nutrition-rules', requirePermission('gym.manage'), asyncHandler(async(req,res)=>{
  const tenantId=ctx(req).tenantId;
  const memberId=String(req.query.memberId||'').trim();
  if(!memberId)throw new HttpError(400,'memberId es obligatorio.');
  const memberRows=await prisma.$queryRawUnsafe<any[]>(`
    SELECT "id" FROM public."GymMember" WHERE "tenantId"=$1 AND "id"=$2 LIMIT 1
  `,tenantId,memberId);
  if(!memberRows.length)throw new HttpError(404,'El cliente no pertenece al tenant activo.');
  const rows=await prisma.$queryRawUnsafe<any[]>(`
    SELECT r.*,i."name" AS "ingredientName",i."active" AS "ingredientActive"
    FROM public."GymNutritionRule" r
    JOIN public."GymIngredient" i ON i."tenantId"=r."tenantId" AND i."id"=r."ingredientId"
    WHERE r."tenantId"=$1 AND r."memberId"=$2
    ORDER BY r."active" DESC,r."kind",i."name"
  `,tenantId,memberId);
  ok(res,rows);
}));

router.post('/gym/nutrition-rules', requirePermission('gym.manage'), asyncHandler(async(req,res)=>{
  const tenantId=ctx(req).tenantId;
  const b=nutritionRuleSchema.parse(req.body||{});
  const created=await prisma.$transaction(async(tx)=>{
    const memberRows=await tx.$queryRawUnsafe<any[]>(`
      SELECT "id" FROM public."GymMember" WHERE "tenantId"=$1 AND "id"=$2 LIMIT 1
    `,tenantId,b.memberId);
    if(!memberRows.length)throw new HttpError(422,'El cliente no pertenece al tenant activo.');
    const ingredientRows=await tx.$queryRawUnsafe<any[]>(`
      SELECT "id","name" FROM public."GymIngredient"
      WHERE "tenantId"=$1 AND "id"=$2 AND "active"=true
      LIMIT 1
    `,tenantId,b.ingredientId);
    if(!ingredientRows.length)throw new HttpError(422,'El ingrediente no pertenece al tenant activo o está archivado.');
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`,`gym-nutrition-rule-45:${tenantId}:${b.memberId}:${b.ingredientId}:${b.kind}`);
    const existing=await tx.$queryRawUnsafe<any[]>(`
      SELECT "id" FROM public."GymNutritionRule"
      WHERE "tenantId"=$1 AND "memberId"=$2 AND "ingredientId"=$3 AND "kind"=$4
      LIMIT 1
    `,tenantId,b.memberId,b.ingredientId,b.kind);
    if(existing.length)throw new HttpError(409,'Esta regla ya existe para el cliente e ingrediente.');
    const rows=await tx.$queryRawUnsafe<any[]>(`
      INSERT INTO public."GymNutritionRule" ("id","tenantId","memberId","ingredientId","kind","notes","active","createdBy","createdAt","updatedAt")
      VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,true,$6,now(),now())
      RETURNING *
    `,tenantId,b.memberId,b.ingredientId,b.kind,b.notes||null,ctx(req).userId||null);
    return one(rows);
  });
  ok(res,created,201);
}));

router.patch('/gym/nutrition-rules/:id', requirePermission('gym.manage'), asyncHandler(async(req,res)=>{
  const tenantId=ctx(req).tenantId;
  const b=nutritionRulePatchSchema.parse(req.body||{});
  const rows=await prisma.$queryRawUnsafe<any[]>(`
    UPDATE public."GymNutritionRule"
    SET "active"=$3,"updatedAt"=now()
    WHERE "tenantId"=$1 AND "id"=$2
    RETURNING *
  `,tenantId,String(req.params.id),b.active);
  ok(res,one(rows,'Regla nutricional no encontrada.'));
}));

router.get('/gym/recipes', requirePermission('gym.manage'), asyncHandler(async (req,res)=>{
  const tenantId=ctx(req).tenantId;
  const rows=await prisma.$queryRawUnsafe<any[]>(`
    SELECT r.*,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id',ri."id",'ingredientId',ri."ingredientId",'ingredientName',i."name",
          'quantity',ri."quantity",'unit',ri."unit",'notes',ri."notes",'sortOrder',ri."sortOrder"
        ) ORDER BY ri."sortOrder")
        FROM public."GymRecipeItem" ri
        JOIN public."GymIngredient" i ON i."tenantId"=ri."tenantId" AND i."id"=ri."ingredientId"
        WHERE ri."tenantId"=r."tenantId" AND ri."recipeId"=r."id"
      ),'[]'::jsonb) AS items
    FROM public."GymRecipe" r
    WHERE r."tenantId"=$1
    ORDER BY r."active" DESC,r."name"
    LIMIT 500
  `,tenantId);
  ok(res,rows);
}));

router.post('/gym/recipes', requirePermission('gym.manage'), asyncHandler(async (req,res)=>{
  const tenantId=ctx(req).tenantId;
  const b=recipeSchema.parse(req.body||{});
  const created=await prisma.$transaction(async(tx)=>{
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`,`gym-recipe-44:${tenantId}:${b.name.toLowerCase()}`);
    const ids=[...new Set(b.items.map((item)=>item.ingredientId))];
    const ingredients=await tx.$queryRawUnsafe<any[]>(`
      SELECT "id" FROM public."GymIngredient"
      WHERE "tenantId"=$1 AND "active"=true AND "id"=ANY($2::text[])
    `,tenantId,ids);
    if(ingredients.length!==ids.length)throw new HttpError(422,'Los ingredientes de la receta deben estar activos y pertenecer al tenant.');
    const duplicates=await tx.$queryRawUnsafe<any[]>(`
      SELECT "id" FROM public."GymRecipe"
      WHERE "tenantId"=$1 AND lower(btrim("name"))=lower(btrim($2))
      LIMIT 1
    `,tenantId,b.name);
    if(duplicates.length)throw new HttpError(409,'Ya existe una receta con ese nombre.');
    const rows=await tx.$queryRawUnsafe<any[]>(`
      INSERT INTO public."GymRecipe" ("id","tenantId","name","servings","preparation","active","createdBy","createdAt","updatedAt")
      VALUES (gen_random_uuid()::text,$1,$2,$3,$4,true,$5,now(),now())
      RETURNING *
    `,tenantId,b.name,b.servings,b.preparation||null,ctx(req).userId||null);
    const recipe=one(rows);
    for(let index=0;index<b.items.length;index+=1){
      const item=b.items[index];
      await tx.$executeRawUnsafe(`
        INSERT INTO public."GymRecipeItem" ("id","tenantId","recipeId","ingredientId","quantity","unit","sortOrder","notes")
        VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7)
      `,tenantId,recipe.id,item.ingredientId,item.quantity,item.unit,index+1,item.notes||null);
    }
    return recipe;
  });
  ok(res,created,201);
}));

router.get('/gym/nutrition', requirePermission('gym.manage'), asyncHandler(async (req, res) => {
  const memberId = String(req.query.memberId || '');
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT p.*,
      COALESCE((
        SELECT jsonb_agg(
          to_jsonb(m) || jsonb_build_object(
            'recipeName',(SELECT r."name" FROM public."GymRecipe" r WHERE r."tenantId"=m."tenantId" AND r."id"=m."recipeId"),
            'alternatives',COALESCE((
              SELECT jsonb_agg(jsonb_build_object('recipeId',a."recipeId",'recipeName',r."name",'label',a."label",'servings',a."servings",'sortOrder',a."sortOrder") ORDER BY a."sortOrder")
              FROM public."GymMealAlternative" a
              JOIN public."GymRecipe" r ON r."tenantId"=a."tenantId" AND r."id"=a."recipeId"
              WHERE a."tenantId"=m."tenantId" AND a."mealId"=m."id"
            ),'[]'::jsonb),
            'items',COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'id',mi."id",
                'ingredientId',mi."ingredientId",
                'ingredientName',i."name",
                'quantity',mi."quantity",
                'unit',mi."unit",
                'notes',mi."notes",
                'sortOrder',mi."sortOrder"
              ) ORDER BY mi."sortOrder")
              FROM public."GymMealItem" mi
              JOIN public."GymIngredient" i
                ON i."tenantId"=mi."tenantId" AND i."id"=mi."ingredientId"
              WHERE mi."tenantId"=m."tenantId" AND mi."mealId"=m."id"
            ),CASE WHEN jsonb_typeof(m."items")='array' THEN m."items" ELSE '[]'::jsonb END)
          )
          ORDER BY m."dayIndex" NULLS LAST,m."sortOrder",m."dayOfWeek" NULLS LAST,m."plannedAt",m."id"
        )
        FROM public."GymMeal" m
        WHERE m."tenantId"=p."tenantId" AND m."nutritionPlanId"=p."id"
      ),'[]'::jsonb) AS meals
    FROM public."GymNutritionPlan" p
    WHERE p."tenantId"=$1 AND ($2='' OR p."memberId"=$2)
    ORDER BY p."active" DESC,p."createdAt" DESC
    LIMIT 500
  `, ctx(req).tenantId,memberId);
  ok(res, rows);
}));

router.post('/gym/nutrition', requirePermission('gym.manage'), asyncHandler(async (req, res) => {
  const b = completeNutritionSchema.parse(req.body || {});
  const tenantId=ctx(req).tenantId;
  const plan=await prisma.$transaction(async(tx)=>{
    const memberRows=await tx.$queryRawUnsafe<any[]>(`
      SELECT "id" FROM public."GymMember" WHERE "tenantId"=$1 AND "id"=$2 LIMIT 1
    `,tenantId,b.memberId);
    if(!memberRows.length)throw new HttpError(422,'El cliente no pertenece al tenant activo.');
    if(b.trainerId){
      const trainerRows=await tx.$queryRawUnsafe<any[]>(`
        SELECT "id" FROM public."GymTrainer" WHERE "tenantId"=$1 AND "id"=$2 LIMIT 1
      `,tenantId,b.trainerId);
      if(!trainerRows.length)throw new HttpError(422,'El responsable no pertenece al tenant activo.');
    }

    const ingredientIds=[...new Set(b.meals.flatMap((meal)=>meal.items.map((item)=>item.ingredientId)))];
    const recipeIds=[...new Set(b.meals.flatMap((meal)=>[meal.recipeId,...meal.alternatives.map((item)=>item.recipeId)].filter(Boolean) as string[]))];
    if(ingredientIds.length){
      const ingredientRows=await tx.$queryRawUnsafe<any[]>(`
        SELECT "id" FROM public."GymIngredient"
        WHERE "tenantId"=$1 AND "active"=true AND "id"=ANY($2::text[])
      `,tenantId,ingredientIds);
      const valid=new Set(ingredientRows.map((row:any)=>String(row.id)));
      const invalid=ingredientIds.filter((id)=>!valid.has(id));
      if(invalid.length)throw new HttpError(422,'Uno o más ingredientes no pertenecen al tenant activo o están archivados.');
    }

    if(recipeIds.length){
      const recipeRows=await tx.$queryRawUnsafe<any[]>(`
        SELECT "id" FROM public."GymRecipe"
        WHERE "tenantId"=$1 AND "active"=true AND "id"=ANY($2::text[])
      `,tenantId,recipeIds);
      if(recipeRows.length!==recipeIds.length)throw new HttpError(422,'Las recetas del plan deben estar activas y pertenecer al tenant.');
    }

    const directIngredientIds=[...new Set(ingredientIds)];
    const recipeIngredientRows=recipeIds.length?await tx.$queryRawUnsafe<any[]>(`
      SELECT DISTINCT ri."ingredientId"
      FROM public."GymRecipeItem" ri
      WHERE ri."tenantId"=$1 AND ri."recipeId"=ANY($2::text[])
    `,tenantId,recipeIds):[];
    const planIngredientIds=[...new Set([...directIngredientIds,...recipeIngredientRows.map((row:any)=>String(row.ingredientId))])];
    if(planIngredientIds.length){
      const restricted=await tx.$queryRawUnsafe<any[]>(`
        SELECT r."kind",i."name" AS "ingredientName"
        FROM public."GymNutritionRule" r
        JOIN public."GymIngredient" i ON i."tenantId"=r."tenantId" AND i."id"=r."ingredientId"
        WHERE r."tenantId"=$1
          AND r."memberId"=$2
          AND r."active"=true
          AND r."kind" IN ('allergy','intolerance','exclusion')
          AND r."ingredientId"=ANY($3::text[])
        ORDER BY i."name",r."kind"
      `,tenantId,b.memberId,planIngredientIds);
      if(restricted.length){
        const conflicts=restricted.map((row:any)=>`${row.ingredientName} (${row.kind})`).join(', ');
        throw new HttpError(422,`El plan contiene ingredientes restringidos declarados para el cliente: ${conflicts}.`);
      }
    }

    const planRows = await tx.$queryRawUnsafe<any[]>(`
      INSERT INTO public."GymNutritionPlan" ("id","tenantId","memberId","trainerId","name","goal","durationDays","targetCalories","proteinG","carbsG","fatG","waterMl","notes","startsAt","endsAt","active","createdAt","updatedAt")
      VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::date,$14::date,true,now(),now()) RETURNING *
    `, tenantId,b.memberId,b.trainerId||null,b.name,b.goal||null,b.durationDays,b.targetCalories||null,b.proteinG||null,b.carbsG||null,b.fatG||null,b.waterMl||null,b.notes||null,b.startsAt||null,b.endsAt||null);
    const createdPlan = one(planRows);
    for (const meal of b.meals) {
      const mealRows=await tx.$queryRawUnsafe<any[]>(`
        INSERT INTO public."GymMeal" ("id","tenantId","nutritionPlanId","dayIndex","dayOfWeek","sortOrder","mealType","plannedAt","recipeId","servings","preparation","items","calories","proteinG","carbsG","fatG","notes")
        VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7::time,$8,$9,$10,'[]'::jsonb,$11,$12,$13,$14,$15)
        RETURNING "id"
      `, tenantId,createdPlan.id,meal.dayIndex,meal.dayOfWeek,meal.sortOrder,meal.mealType,meal.plannedAt||null,meal.recipeId||null,meal.servings,meal.preparation||null,meal.calories||null,meal.proteinG||null,meal.carbsG||null,meal.fatG||null,meal.notes||null);
      const mealId=String(mealRows[0]?.id||'');
      for(let index=0;index<meal.items.length;index+=1){
        const item=meal.items[index];
        await tx.$executeRawUnsafe(`
          INSERT INTO public."GymMealItem" ("id","tenantId","mealId","ingredientId","quantity","unit","notes","sortOrder","createdAt")
          VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,now())
        `,tenantId,mealId,item.ingredientId,item.quantity,item.unit,item.notes||null,index+1);
      }
      for(let index=0;index<meal.alternatives.length;index+=1){
        const alternative=meal.alternatives[index];
        await tx.$executeRawUnsafe(`
          INSERT INTO public."GymMealAlternative" ("id","tenantId","mealId","recipeId","label","servings","sortOrder","createdAt")
          VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,now())
        `,tenantId,mealId,alternative.recipeId,alternative.label||null,alternative.servings,index+1);
      }
    }
    await createPlanNutrientSnapshot(tx,tenantId,createdPlan.id,ctx(req).userId||null);
    return createdPlan;
  });
  ok(res, plan, 201);
}));

router.get('/gym/nutrition/:id/shopping-list', requirePermission('gym.manage'), asyncHandler(async(req,res)=>{
  const tenantId=ctx(req).tenantId;
  const planId=String(req.params.id||'');
  const planRows=await prisma.$queryRawUnsafe<any[]>(`
    SELECT "id","durationDays" FROM public."GymNutritionPlan"
    WHERE "tenantId"=$1 AND "id"=$2
    LIMIT 1
  `,tenantId,planId);
  const plan=one(planRows,'Plan nutricional no encontrado.');
  const shoppingList=await prisma.$queryRawUnsafe<any[]>(`
    SELECT x."ingredientId",i."name",x."unit",ROUND(SUM(x."quantity")::numeric,3) AS "quantity"
    FROM (
      SELECT mi."ingredientId",mi."unit",mi."quantity"::numeric AS "quantity"
      FROM public."GymMeal" m
      JOIN public."GymMealItem" mi ON mi."tenantId"=m."tenantId" AND mi."mealId"=m."id"
      WHERE m."tenantId"=$1 AND m."nutritionPlanId"=$2
      UNION ALL
      SELECT ri."ingredientId",ri."unit",(ri."quantity"::numeric*m."servings"::numeric/r."servings"::numeric) AS "quantity"
      FROM public."GymMeal" m
      JOIN public."GymRecipe" r ON r."tenantId"=m."tenantId" AND r."id"=m."recipeId"
      JOIN public."GymRecipeItem" ri ON ri."tenantId"=r."tenantId" AND ri."recipeId"=r."id"
      WHERE m."tenantId"=$1 AND m."nutritionPlanId"=$2
    ) x
    JOIN public."GymIngredient" i ON i."tenantId"=$1 AND i."id"=x."ingredientId"
    GROUP BY x."ingredientId",i."name",x."unit"
    ORDER BY i."name",x."unit"
  `,tenantId,planId);
  ok(res,{planId:plan.id,durationDays:plan.durationDays,shoppingList});
}));


export default router;
