import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read=(path)=>fs.readFileSync(path,'utf8');

test('38/51 defines explicit progression strategies on routine exercises',()=>{
  const catalog=read('frontend/src/data/fitnessProgressionStrategies.js');
  for(const token of ['manual','linear_load','double_progression','percent_1rm','Doble progresión','%1RM']) assert.ok(catalog.includes(token),token);
  const migration=read('backend/prisma/migrations/20260923170000_gym_progression_engine_38_51/migration.sql');
  assert.match(migration,/ADD COLUMN IF NOT EXISTS "progressionStrategy"/);
  assert.match(migration,/ADD COLUMN IF NOT EXISTS "progressionConfig" jsonb/);
});

test('38/51 backend validates RIR RPE double progression and percent 1RM config',()=>{
  const routes=read('backend/src/modules/verticals/gym.routes.ts');
  const domain=read('backend/src/modules/verticals/gym.progression.ts');
  for(const token of ['progressionStrategySchema','progressionConfigSchema','targetRir','targetRpe','repRangeMin','repRangeMax','oneRepMaxKg','percent1Rm','stallAfter','resetPct']) assert.ok(routes.includes(token),token);
  for(const token of ['gymProgressionConfigIssues','isRirRpePairCoherent','RPE y RIR no son coherentes','La doble progresión requiere un rango de repeticiones','La progresión por %1RM requiere 1RM y porcentaje']) assert.ok(domain.includes(token),token);
  assert.match(routes,/gymProgressionConfigIssues\(value\.strategy/);
  assert.match(routes,/gymProgressionConfigIssues\(value\.progressionStrategy/);
  assert.match(routes,/isRirRpePairCoherent\(value\.rir, value\.rpe\)/);
});

test('38/51 deterministic engine recommends without mutating the routine',()=>{
  const source=read('backend/src/modules/verticals/gym.progression.ts');
  for(const token of ['evaluateGymProgression','gym-progression-38-v1','increase_load','increase_reps','target_percent_1rm','reset_load','missing_effort_evidence','stall_threshold_reached','applied:false']) assert.ok(source.includes(token),token);
  assert.doesNotMatch(source,/prisma|UPDATE public|INSERT INTO public/);
});

test('38/51 exposes evaluation endpoint and preserves explicit non-applied semantics',()=>{
  const routes=read('backend/src/modules/verticals/gym.routes.ts');
  assert.match(routes,/router\.post\('\/gym\/progression\/evaluate'/);
  assert.match(routes,/evaluateGymProgression\(/);
  const service=read('frontend/src/services/verticalService.js');
  assert.match(service,/evaluateProgression\(payload\)/);
  assert.match(service,/\/api\/v1\/verticals\/gym\/progression\/evaluate/);
});

test('38/51 RoutineBuilder persists strategy configuration without auto-applying it',()=>{
  const builder=read('frontend/src/components/fitness/RoutineBuilder.jsx');
  for(const token of ['FITNESS_PROGRESSION_STRATEGIES','progressionStrategy','progressionConfig','Estrategia de progresión','RIR objetivo','RPE objetivo','1RM de referencia','Estancamiento tras']) assert.ok(builder.includes(token),token);
  const page=read('frontend/src/pages/GymManagementPage.jsx');
  assert.match(page,/progressionStrategy:String\(exercise\.progressionStrategy/);
  assert.match(page,/progressionConfig:exercise\.progressionStrategy/);
  assert.doesNotMatch(page,/evaluateProgression\([\s\S]{0,300}(updateExercise|setRoutineForm)/);
});

test('38/51 stays separate from periodization and workout session execution',()=>{
  const domain=read('backend/src/modules/verticals/gym.progression.ts');
  assert.doesNotMatch(domain,/mesocycle|periodization|GymWorkoutSession|GymWorkoutSet/);
  const audit=read('scripts/erp-ui-wave-a-audit-v251.mjs');
  for(const token of ['fitnessProgressionStrategies.js','progressionStrategy','progressionConfig','progression engine']) assert.ok(audit.includes(token),token);
});
