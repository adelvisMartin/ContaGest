import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read=(path)=>fs.readFileSync(path,'utf8');
const routeSignatures=(source)=>[...source.matchAll(/router\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)/g)]
  .map((match)=>`${match[1].toUpperCase()} ${match[2]}`);

const routeFiles=[
  'backend/src/modules/verticals/gym-core.routes.ts',
  'backend/src/modules/verticals/gym-training.routes.ts',
  'backend/src/modules/verticals/gym-nutrition.routes.ts',
  'backend/src/modules/verticals/gym-adherence.routes.ts',
  'backend/src/modules/verticals/gym-classes.routes.ts'
];

const expected=[
  'GET /gym/summary',
  'GET /gym/members','POST /gym/members',
  'GET /gym/trainers','POST /gym/trainers',
  'GET /gym/plans','POST /gym/plans',
  'POST /gym/memberships','POST /gym/checkins',
  'GET /gym/assessments','POST /gym/assessments',
  'GET /gym/exercises','POST /gym/exercises','PATCH /gym/exercises/:id',
  'POST /gym/progression/evaluate',
  'GET /gym/periodization/templates','POST /gym/periodization/templates',
  'GET /gym/periodization/programs','POST /gym/periodization/programs',
  'POST /gym/periodization/programs/:id/version',
  'GET /gym/workout-sessions','POST /gym/workout-sessions',
  'POST /gym/workout-sessions/:id/sets','POST /gym/workout-sessions/:id/complete',
  'GET /gym/performance','POST /gym/exercise-substitutions/suggest',
  'GET /gym/routines','POST /gym/routines',
  'GET /gym/ingredients','POST /gym/ingredients','PATCH /gym/ingredients/:id',
  'GET /gym/ingredients/:id/nutrition-profiles','POST /gym/ingredients/:id/nutrition-profiles',
  'GET /gym/nutrition/:id/nutrients',
  'GET /gym/nutrition-rules','POST /gym/nutrition-rules','PATCH /gym/nutrition-rules/:id',
  'GET /gym/recipes','POST /gym/recipes',
  'GET /gym/nutrition','POST /gym/nutrition','GET /gym/nutrition/:id/shopping-list',
  'GET /gym/adherence','POST /gym/adherence/meals',
  'GET /gym/classes','POST /gym/classes'
];

test('65/75 preserves all 46 Gym HTTP contracts in original registration order',()=>{
  const actual=routeFiles.flatMap((path)=>routeSignatures(read(path)));
  assert.deepEqual(actual,expected);
  assert.equal(actual.length,46);
  assert.equal(new Set(actual).size,46,'bounded contexts must not duplicate route ownership');
});

test('65/75 keeps endpoint-level gym.manage authorization and a persistence-free composition root',()=>{
  for(const path of routeFiles){
    const source=read(path);
    const routes=routeSignatures(source);
    const guards=[...source.matchAll(/requirePermission\('gym\.manage'\)/g)];
    assert.equal(guards.length,routes.length,`${path} must preserve one gym.manage guard per endpoint`);
  }
  const root=read('backend/src/modules/verticals/gym.routes.ts');
  assert.equal(routeSignatures(root).length,0);
  assert.doesNotMatch(root,/\$queryRaw|\$executeRaw|prisma\./);
  const order=['coreRoutes','trainingRoutes','nutritionRoutes','adherenceRoutes','classRoutes'];
  let previous=-1;
  for(const name of order){
    const current=root.indexOf(`router.use(${name})`);
    assert.ok(current>previous,`invalid bounded-context mount order for ${name}`);
    previous=current;
  }
});

test('65/75 preserves existing schema, progression and nutrient snapshot authorities',()=>{
  const training=read('backend/src/modules/verticals/gym-training.routes.ts');
  const nutrition=read('backend/src/modules/verticals/gym-nutrition.routes.ts');
  const schemas=read('backend/src/modules/verticals/gym.schemas.ts');
  assert.match(training,/from '.\/gym\.schemas\.js'/);
  assert.match(training,/from '.\/gym\.progression\.js'/);
  assert.match(nutrition,/from '.\/gym\.schemas\.js'/);
  assert.match(nutrition,/createPlanNutrientSnapshot/);
  assert.match(schemas,/export const routineSchema/);
  assert.match(schemas,/export const completeNutritionSchema/);
  assert.doesNotMatch(training,/z\.object\(/);
  assert.doesNotMatch(nutrition,/z\.object\(/);
});

test('65/75 keeps GymManagementPage as the only state/service orchestrator',()=>{
  const page=read('frontend/src/pages/GymManagementPage.jsx');
  const training=read('frontend/src/components/fitness/GymTrainingPanel.jsx');
  const nutrition=read('frontend/src/components/fitness/GymNutritionPanel.jsx');
  const primitives=read('frontend/src/components/fitness/GymWorkspacePrimitives.jsx');
  assert.match(page,/GymTrainingPanel/);
  assert.match(page,/GymNutritionPanel/);
  assert.match(page,/GymWorkspacePrimitives/);
  assert.doesNotMatch(page,/RoutineBuilder|ExerciseLibraryPanel|CompleteMealPlanBuilder|NutritionRulesPanel/);
  assert.doesNotMatch(training,/useState\(|useEffect\(|GymVerticalService/);
  assert.doesNotMatch(nutrition,/useState\(|useEffect\(|GymVerticalService/);
  assert.match(training,/RoutineBuilder/);
  assert.match(training,/PeriodizationPanel/);
  assert.match(nutrition,/CompleteMealPlanBuilder/);
  assert.match(nutrition,/IntegratedAdherencePanel/);
  assert.match(primitives,/export function Section/);
  assert.match(primitives,/export function RecordList/);
  assert.equal((page.match(/data-gym-panel/g)||[]).length,1,'page must retain one rendered panel owner');
});

test('65/75 does not introduce validation or browser bypasses',()=>{
  const source=[
    ...routeFiles.map(read),
    read('backend/src/modules/verticals/gym.routes.ts'),
    read('frontend/src/pages/GymManagementPage.jsx'),
    read('frontend/src/components/fitness/GymTrainingPanel.jsx'),
    read('frontend/src/components/fitness/GymNutritionPanel.jsx')
  ].join('\n');
  assert.doesNotMatch(source,/test\.skip|test\.only|waitForTimeout|force:\s*true/);
});
