import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read=(path)=>fs.readFileSync(path,'utf8');

test('45/51 persists only explicit member ingredient rules',()=>{
  const migration=read('backend/prisma/migrations/20260923203000_gym_nutrition_rules_45_51/migration.sql');
  for(const token of ['GymNutritionRule','GymNutritionRule_kind_check','GymNutritionRule_tenant_member_ingredient_kind_unique',"'allergy','intolerance','exclusion','preferred'"]) assert.ok(migration.includes(token),token);
  assert.doesNotMatch(migration,/diagnos|conditionInference|autoSelect/i);
});

test('45/51 rule CRUD stays tenant scoped and archive/reactivate based',()=>{
  const source=read('backend/src/modules/verticals/gym.routes.ts');
  for(const token of ["router.get('/gym/nutrition-rules'","router.post('/gym/nutrition-rules'","router.patch('/gym/nutrition-rules/:id'",'nutritionRuleSchema','El cliente no pertenece al tenant activo.','El ingrediente no pertenece al tenant activo o está archivado.']) assert.ok(source.includes(token),token);
  assert.doesNotMatch(source,/router\.delete\('\/gym\/nutrition-rules/);
});

test('45/51 new plans inspect direct and recipe ingredients against blocking rules',()=>{
  const source=read('backend/src/modules/verticals/gym.routes.ts');
  const start=source.indexOf("router.post('/gym/nutrition'");
  const end=source.indexOf("router.get('/gym/nutrition/:id/shopping-list'",start);
  const block=source.slice(start,end);
  for(const token of ['directIngredientIds','recipeIngredientRows','GymRecipeItem','planIngredientIds',"r."kind" IN ('allergy','intolerance','exclusion')",'El plan contiene ingredientes restringidos declarados para el cliente:']) assert.ok(block.includes(token),token);
  assert.doesNotMatch(block,/preferred[^\n]{0,100}throw new HttpError/);
});

test('45/51 UI exposes declared rules without automatic plan rewriting',()=>{
  const page=read('frontend/src/pages/GymManagementPage.jsx');
  const panel=read('frontend/src/components/fitness/NutritionRulesPanel.jsx');
  assert.equal((page.match(/<NutritionRulesPanel/g)||[]).length,1);
  for(const token of ['Restricciones y preferencias','Alergia declarada','Intolerancia declarada','Exclusión','Preferido','nunca modifica el plan automáticamente']) assert.ok(panel.includes(token),token);
  assert.doesNotMatch(panel,/querySelector|addEventListener|innerHTML|document\.|autoSelect|automaticSubstitut|inferAllerg|diagnos/i);
});

test('45/51 service uses canonical rule endpoints',()=>{
  const service=read('frontend/src/services/verticalService.js');
  for(const token of ['nutritionRules(memberId)','createNutritionRule(payload)','updateNutritionRule(id, payload)']) assert.ok(service.includes(token),token);
});

test('45/51 does not pre-implement nutrient composition or adherence',()=>{
  const routes=read('backend/src/modules/verticals/gym.routes.ts');
  const migration=read('backend/prisma/migrations/20260923203000_gym_nutrition_rules_45_51/migration.sql');
  const start=routes.indexOf('const nutritionRuleKindSchema');
  const end=routes.indexOf('const recipeSchema',start);
  assert.doesNotMatch(routes.slice(start,end)+migration,/micronutrient|vitamin|mineral|adherence|compliance/i);
});

test('45/51 Wave A fails closed on nutrition-rule regressions',()=>{
  const audit=read('scripts/erp-ui-wave-a-audit-v251.mjs');
  for(const token of ['nutrition rules 45','GymNutritionRule','planIngredientIds','must block only explicit blocking kinds']) assert.ok(audit.includes(token),token);
});
