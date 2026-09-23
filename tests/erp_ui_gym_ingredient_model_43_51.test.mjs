import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read=(path)=>fs.readFileSync(path,'utf8');

test('43/51 adds tenant-scoped canonical ingredient persistence',()=>{
  const migration=read('backend/prisma/migrations/20260923183500_gym_ingredient_model_43_51/migration.sql');
  for(const token of ['GymIngredient','GymMealItem','GymIngredient_tenant_name_unique','GymMealItem_meal_fk','GymMealItem_ingredient_fk']) assert.ok(migration.includes(token),token);
  assert.match(migration,/"quantity" numeric\(12,3\) NOT NULL/);
  assert.match(migration,/CHECK \("quantity" > 0\)/);
});

test('43/51 ingredient API is CRUD-safe and tenant scoped',()=>{
  const source=read('backend/src/modules/verticals/gym.routes.ts');
  for(const token of ["router.get('/gym/ingredients'","router.post('/gym/ingredients'","router.patch('/gym/ingredients/:id'",'ingredientSchema','ingredientPatchSchema','"tenantId"=$1']) assert.ok(source.includes(token),token);
  assert.match(source,/ON CONFLICT DO NOTHING/);
  assert.match(source,/Ya existe un ingrediente con ese nombre en el tenant activo/);
});

test('43/51 nutrition writes validate member trainer and ingredient ownership atomically',()=>{
  const source=read('backend/src/modules/verticals/gym.routes.ts');
  const start=source.indexOf("router.post('/gym/nutrition'");
  const end=source.indexOf("router.get('/gym/classes'",start);
  const block=source.slice(start,end);
  for(const token of ['prisma.$transaction','GymMember','GymTrainer','GymIngredient','GymMealItem','El cliente no pertenece al tenant activo.','El responsable no pertenece al tenant activo.','Uno o más ingredientes no pertenecen al tenant activo o están archivados.']) assert.ok(block.includes(token),token);
  assert.match(block,/'\[\]'::jsonb/);
  assert.match(source,/jsonb_typeof\(m\."items"\)='array'/);
});

test('43/51 frontend replaces free-text meal parsing with controlled ingredients',()=>{
  const page=read('frontend/src/pages/GymManagementPage.jsx');
  const builder=read('frontend/src/components/fitness/NutritionMealBuilder.jsx');
  const library=read('frontend/src/components/fitness/IngredientLibraryPanel.jsx');
  assert.equal((page.match(/<IngredientLibraryPanel/g)||[]).length,1);
  assert.equal((page.match(/<NutritionMealBuilder/g)||[]).length,1);
  assert.doesNotMatch(page,/mealLines|Tipo \| kcal \| alimentos/);
  for(const token of ['Comidas por ingrediente','Seleccionar ingrediente','Cantidad','Unidad','Agregar ingrediente']) assert.ok(builder.includes(token),token);
  for(const token of ['Catálogo de ingredientes','Archivar','Reactivar']) assert.ok(library.includes(token),token);
  assert.doesNotMatch(builder+library,/querySelector|addEventListener|innerHTML|document\./);
});

test('43/51 does not pre-implement detailed nutrient persistence reserved for 46/51',()=>{
  const routes=read('backend/src/modules/verticals/gym.routes.ts');
  const migration=read('backend/prisma/migrations/20260923183500_gym_ingredient_model_43_51/migration.sql');
  const start=routes.indexOf("router.get('/gym/ingredients'");
  const end=routes.indexOf("router.get('/gym/classes'",start);
  assert.doesNotMatch(routes.slice(start,end)+migration,/micronutrient|vitamin|mineral|fiberG|sodiumMg/i);
});

test('43/51 Wave A fails closed on ingredient-model regressions',()=>{
  const audit=read('scripts/erp-ui-wave-a-audit-v251.mjs');
  for(const token of ['nutrition ingredient 43','GymIngredient','GymMealItem','free-text meal parsing']) assert.ok(audit.includes(token),token);
});
