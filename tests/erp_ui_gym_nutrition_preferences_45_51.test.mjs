import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read=(path)=>fs.readFileSync(path,'utf8');

test('45/51 persists explicit tenant-scoped nutrition preferences without medical inference',()=>{
  const sql=read('backend/prisma/migrations/20260923195000_gym_nutrition_preferences_45_51/migration.sql');
  for(const token of ['GymNutritionProfile','preferredTags','avoidedTags','allergenTags','excludedIngredientIds','GymNutritionProfile_tenant_member_unique','dietaryTags']) assert.ok(sql.includes(token),token);
  assert.doesNotMatch(sql,/diagnosis|disease|contraindication|micronutrient|adherence/i);
});

test('45/51 profile API validates member and excluded ingredients in the active tenant',()=>{
  const source=read('backend/src/modules/verticals/gym.routes.ts');
  for(const token of ["router.get('/gym/nutrition-profile/:memberId'","router.put('/gym/nutrition-profile/:memberId'",'nutritionProfileSchema','GymNutritionProfile','GymMember','GymIngredient','Los ingredientes excluidos deben pertenecer al tenant activo.']) assert.ok(source.includes(token),token);
});

test('45/51 compatibility is deterministic explainable and fail closed for declared restrictions',()=>{
  const source=read('backend/src/modules/verticals/gym.routes.ts');
  for(const token of ['evaluateNutritionCompatibility','declared_allergen','excluded_ingredient','avoided_tag','preferred_tag_missing','NUTRITION_RESTRICTION_CONFLICT']) assert.ok(source.includes(token),token);
  assert.match(source,/conflicts\.length/);
  assert.doesNotMatch(source,/diagnos|medicalRisk|recommendDiet|autoSubstitut/i);
});

test('45/51 ingredient API stores explicit dietary and allergen tags only',()=>{
  const source=read('backend/src/modules/verticals/gym.routes.ts');
  for(const token of ['dietaryTags','allergenTags','ingredientSchema','ingredientPatchSchema']) assert.ok(source.includes(token),token);
});

test('45/51 UI has one preference owner and compatibility review before save',()=>{
  const page=read('frontend/src/pages/GymManagementPage.jsx');
  const panel=read('frontend/src/components/fitness/NutritionPreferencePanel.jsx');
  assert.equal((page.match(/<NutritionPreferencePanel/g)||[]).length,1);
  for(const token of ['Preferencias y restricciones','Alergias declaradas','Etiquetas a evitar','Ingredientes excluidos','Preferencias','Health disclaimer']) assert.ok(panel.includes(token),token);
  for(const token of ['nutritionProfile(','saveNutritionProfile(','checkNutritionCompatibility(']) assert.ok(read('frontend/src/services/verticalService.js').includes(token),token);
  assert.doesNotMatch(panel,/querySelector|addEventListener|innerHTML|document\./);
});

test('45/51 does not pre-implement nutrient composition or adherence',()=>{
  const sql=read('backend/prisma/migrations/20260923195000_gym_nutrition_preferences_45_51/migration.sql');
  const panel=read('frontend/src/components/fitness/NutritionPreferencePanel.jsx');
  assert.doesNotMatch(sql+panel,/micronutrient|vitamin|mineral|fiberG|sodiumMg|adherence|compliance/i);
});

test('45/51 Wave A fails closed on preference/restriction regressions',()=>{
  const source=read('scripts/erp-ui-wave-a-audit-v251.mjs');
  for(const token of ['nutrition preferences 45','GymNutritionProfile','evaluateNutritionCompatibility','NutritionPreferencePanel','NUTRITION_RESTRICTION_CONFLICT']) assert.ok(source.includes(token),token);
});
