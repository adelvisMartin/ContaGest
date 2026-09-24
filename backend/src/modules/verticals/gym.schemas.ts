import { z } from 'zod';
import { optionalText, dateText, jsonRecord } from './verticals.shared.js';
import { gymProgressionConfigIssues, isRirRpePairCoherent } from './gym.progression.js';

/**
 * Validation authority for the Gym vertical.
 *
 * Keep transport-independent request contracts here. Route handlers remain in
 * gym.routes.ts so RBAC, tenant boundaries, transactions and persistence
 * behavior are unchanged by this extraction.
 */
export const memberSchema = z.object({
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

export const trainerSchema = z.object({
  fullName: z.string().trim().min(2).max(180),
  email: z.string().email().optional().nullable().or(z.literal('')),
  phone: optionalText,
  specialties: z.array(z.string().max(120)).default([]),
  status: z.enum(['active','inactive','vacation']).default('active')
});

export const planSchema = z.object({
  name: z.string().trim().min(2).max(120),
  durationDays: z.coerce.number().int().min(1).max(3650).default(30),
  price: z.coerce.number().min(0).default(0),
  currency: z.string().trim().max(10).default('USD'),
  accessLimit: z.coerce.number().int().min(1).optional().nullable(),
  classLimit: z.coerce.number().int().min(1).optional().nullable(),
  active: z.boolean().default(true),
  metadata: jsonRecord
});

export const membershipSchema = z.object({
  memberId: z.string().min(10),
  planId: z.string().min(10),
  startsAt: dateText,
  endsAt: dateText.optional(),
  autoRenew: z.boolean().default(false),
  balance: z.coerce.number().default(0)
});

export const checkInSchema = z.object({
  memberId: z.string().min(10),
  method: z.enum(['manual','qr','barcode','nfc']).default('manual'),
  device: optionalText,
  notes: optionalText
});

export const assessmentSchema = z.object({
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

export const exerciseLibrarySchema = z.object({
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
export const exerciseLibraryPatchSchema = exerciseLibrarySchema.partial().refine((value)=>Object.keys(value).length>0,{message:'Indica al menos un campo para actualizar.'});

export const intensityTechniqueSchema = z.enum([
  'standard','drop_set','rest_pause','myo_reps','cluster',
  'superset','giant_set','mechanical_drop','isometric_hold'
]);
export const techniqueConfigSchema = z.object({
  rounds: z.coerce.number().int().min(1).max(12).optional().nullable(),
  intraRestSeconds: z.coerce.number().int().min(1).max(600).optional().nullable(),
  loadDropPct: z.coerce.number().min(1).max(90).optional().nullable(),
  groupKey: z.string().trim().max(80).optional().nullable(),
  holdSeconds: z.coerce.number().int().min(1).max(300).optional().nullable(),
  techniqueNotes: z.string().trim().max(500).optional().nullable()
}).default({});
export const progressionStrategySchema = z.enum(['manual','linear_load','double_progression','percent_1rm']);
export const progressionConfigSchema = z.object({
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

export const progressionEvaluationSchema = z.object({
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
  for (const issue of gymProgressionConfigIssues(value.strategy, value.config || {})) {
    refinement.addIssue({ code:'custom', path:['config', issue.field], message:issue.message });
  }
});

export const routineExerciseSchema = z.object({
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
  for (const issue of gymProgressionConfigIssues(value.progressionStrategy, value.progressionConfig || {})) {
    refinement.addIssue({ code:'custom', path:['progressionConfig', issue.field], message:issue.message });
  }
});

export const periodizationWeekSchema = z.object({
  weekType: z.enum(['load','deload']),
  volumePct: z.coerce.number().min(1).max(200),
  intensityPct: z.coerce.number().min(1).max(200),
  notes: optionalText
});
export const periodizationPhaseSchema = z.object({
  name: z.string().trim().min(2).max(120),
  kind: z.enum(['accumulation','intensification','realization','deload','custom']),
  weeks: z.array(periodizationWeekSchema).min(1).max(12),
  notes: optionalText
});
export const periodizationStructureSchema = z.object({
  phases: z.array(periodizationPhaseSchema).min(1).max(24)
});
export const periodizationTemplateSchema = z.object({
  name: z.string().trim().min(2).max(160),
  description: optionalText,
  structure: periodizationStructureSchema
});
export const periodizationProgramSchema = z.object({
  routineId: z.string().min(10),
  name: z.string().trim().min(2).max(180),
  startsAt: z.string().optional().nullable(),
  sourceTemplateId: z.string().optional().nullable(),
  notes: optionalText,
  structure: periodizationStructureSchema
});

export const workoutSessionSchema = z.object({
  routineId: z.string().min(10),
  notes: optionalText
});
export const exerciseSubstitutionSchema = z.object({
  routineExerciseId: z.string().min(10),
  availableEquipment: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
  preferredExerciseIds: z.array(z.string().min(10)).max(50).default([]),
  excludedExerciseIds: z.array(z.string().min(10)).max(50).default([]),
  declaredLimitations: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
  limit: z.coerce.number().int().min(1).max(10).default(5)
});

export const workoutSetSchema = z.object({
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
  if(!isRirRpePairCoherent(value.rir, value.rpe)){
    refinement.addIssue({code:'custom',path:['rpe'],message:'RIR y RPE no son coherentes entre sí.'});
  }
});

export const performanceQuerySchema = z.object({
  memberId: z.string().min(10),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

export const routineSchema = z.object({
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
}).superRefine((value, refinement) => {
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

export const ingredientSchema = z.object({
  name: z.string().trim().min(2).max(180),
  category: optionalText,
  defaultUnit: z.string().trim().min(1).max(40).default('g'),
  notes: optionalText,
  active: z.boolean().default(true)
});
export const ingredientPatchSchema = ingredientSchema.partial().refine((value)=>Object.keys(value).length>0,{message:'Indica al menos un campo para actualizar.'});
export const mealIngredientSchema = z.object({
  ingredientId: z.string().min(10),
  quantity: z.coerce.number().positive().max(100000),
  unit: z.string().trim().min(1).max(40),
  notes: optionalText
});

export const nutritionRuleKindSchema =z.enum(['allergy','intolerance','exclusion','preferred']);
export const nutritionRuleSchema =z.object({
  memberId:z.string().min(10),
  ingredientId:z.string().min(10),
  kind:nutritionRuleKindSchema,
  notes:optionalText
});
export const nutritionRulePatchSchema =z.object({
  active:z.boolean()
});

const requiredNutritionNumber=(max:number)=>z.preprocess(
  (value)=>value===''||value===null||value===undefined?undefined:value,
  z.coerce.number().min(0).max(max)
);
export const micronutrientSchema =z.object({
  key:z.string().trim().min(2).max(64).regex(/^[a-z0-9_]+$/,'Usa una clave estable en minúsculas, números y guion bajo.'),
  label:z.string().trim().min(2).max(120),
  amount:requiredNutritionNumber(1000000000),
  unit:z.enum(['g','mg','mcg','IU'])
});
export const ingredientNutritionProfileSchema =z.object({
  basisQuantity:z.preprocess(
    (value)=>value===''||value===null||value===undefined?undefined:value,
    z.coerce.number().positive().max(100000)
  ),
  basisUnit:z.string().trim().min(1).max(40),
  energyKcal:requiredNutritionNumber(1000000),
  proteinG:requiredNutritionNumber(1000000),
  carbsG:requiredNutritionNumber(1000000),
  fatG:requiredNutritionNumber(1000000),
  fiberG:requiredNutritionNumber(1000000),
  micronutrients:z.array(micronutrientSchema).max(100).default([])
}).superRefine((value,refinement)=>{
  const keys=value.micronutrients.map((item)=>`${item.key}:${item.unit}`);
  if(new Set(keys).size!==keys.length){
    refinement.addIssue({code:'custom',path:['micronutrients'],message:'No repitas el mismo micronutriente con la misma unidad.'});
  }
});

export const recipeSchema =z.object({
  name:z.string().trim().min(2).max(180),
  servings:z.coerce.number().positive().max(100).default(1),
  preparation:optionalText,
  items:z.array(mealIngredientSchema).min(1).max(100)
}).superRefine((value,refinement)=>{
  const ingredientIds=value.items.map((item)=>item.ingredientId);
  if(new Set(ingredientIds).size!==ingredientIds.length){
    refinement.addIssue({code:'custom',path:['items'],message:'Una receta no puede repetir el mismo ingrediente.'});
  }
});

export const nutritionMealSchema = z.object({
  dayIndex:z.coerce.number().int().min(1).max(28),
  dayOfWeek:z.coerce.number().int().min(1).max(7),
  sortOrder:z.coerce.number().int().min(1).max(50),
  mealType:z.string().trim().min(2).max(80),
  plannedAt:z.string().optional().nullable(),
  recipeId:z.string().min(10).optional().nullable(),
  servings:z.coerce.number().positive().max(100).default(1),
  preparation:optionalText,
  alternatives:z.array(z.object({
    recipeId:z.string().min(10),
    label:z.string().trim().max(120).optional().nullable(),
    servings:z.coerce.number().positive().max(100).default(1)
  })).max(8).default([]),
  items:z.array(mealIngredientSchema).max(100).default([]),
  calories:z.coerce.number().int().min(0).optional().nullable(),
  proteinG:z.coerce.number().min(0).optional().nullable(),
  carbsG:z.coerce.number().min(0).optional().nullable(),
  fatG:z.coerce.number().min(0).optional().nullable(),
  notes:optionalText
}).superRefine((value,refinement)=>{
  if(!value.recipeId&&!value.items.length)refinement.addIssue({code:'custom',path:['items'],message:'Cada comida necesita una receta o ingredientes directos.'});
  if(value.recipeId&&value.items.length)refinement.addIssue({code:'custom',path:['items'],message:'Una comida con receta principal no puede mezclar ingredientes directos.'});
  if(value.recipeId&&value.alternatives.some((item)=>item.recipeId===value.recipeId))refinement.addIssue({code:'custom',path:['alternatives'],message:'La receta principal no puede repetirse como alternativa.'});
  const alternatives=value.alternatives.map((item)=>item.recipeId);
  if(new Set(alternatives).size!==alternatives.length)refinement.addIssue({code:'custom',path:['alternatives'],message:'No repitas la misma receta alternativa.'});
});

export const completeNutritionSchema = z.object({
  memberId:z.string().min(10),
  trainerId:z.string().optional().nullable(),
  name:z.string().trim().min(2).max(180),
  goal:optionalText,
  durationDays:z.enum(['7','14','28']).transform(Number).or(z.union([z.literal(7),z.literal(14),z.literal(28)])),
  targetCalories:z.coerce.number().int().min(0).max(20000).optional().nullable(),
  proteinG:z.coerce.number().min(0).optional().nullable(),
  carbsG:z.coerce.number().min(0).optional().nullable(),
  fatG:z.coerce.number().min(0).optional().nullable(),
  waterMl:z.coerce.number().int().min(0).optional().nullable(),
  notes:optionalText,
  startsAt:z.string().optional().nullable(),
  endsAt:z.string().optional().nullable(),
  meals:z.array(nutritionMealSchema).min(1).max(1400)
}).superRefine((value, refinement) => {
  if(value.startsAt&&value.endsAt&&new Date(value.endsAt).getTime()<new Date(value.startsAt).getTime()){
    refinement.addIssue({code:'custom',path:['endsAt'],message:'La vigencia del plan no puede finalizar antes de comenzar.'});
  }
  const positions=new Set<string>();
  value.meals.forEach((meal,index)=>{
    if(meal.dayIndex>Number(value.durationDays)){
      refinement.addIssue({code:'custom',path:['meals',index,'dayIndex'],message:'Cada comida debe pertenecer al horizonte configurado del plan.'});
    }
    const expectedDay=((meal.dayIndex-1)%7)+1;
    if(meal.dayOfWeek!==expectedDay){
      refinement.addIssue({code:'custom',path:['meals',index,'dayOfWeek'],message:'El día semanal debe corresponder al día real del plan.'});
    }
    const key=`${meal.dayIndex}:${meal.sortOrder}`;
    if(positions.has(key)){
      refinement.addIssue({code:'custom',path:['meals',index,'sortOrder'],message:'Cada comida debe tener una posición única dentro de su día.'});
    }
    positions.add(key);
  });
});
export const nutritionSchema =completeNutritionSchema;
export const mealAdherenceSchema =z.object({
  memberId:z.string().min(10),
  nutritionPlanId:z.string().min(10),
  mealId:z.string().min(10),
  status:z.enum(['completed','skipped']),
  notes:optionalText
});

export const classSchema = z.object({
  trainerId: z.string().optional().nullable(),
  name: z.string().trim().min(2).max(180),
  startsAt: dateText,
  endsAt: dateText,
  capacity: z.coerce.number().int().min(1).max(1000).default(20),
  location: optionalText
});
