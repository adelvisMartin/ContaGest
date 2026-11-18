import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRealBackendHarness} from './support/real-backend-harness.ts';

// Uses only the disposable isolated DB validated by createRealBackendHarness.
// No shared dev/production state, no fake Prisma responses.
test('#795 PostgreSQL: nutrition advisory locks serialize profile versions and duplicate writes',async t=>{
  assert.notEqual(String(process.env.NODE_ENV||'').toLowerCase(),'production');
  assert.ok(!process.env.VERCEL&&!process.env.VERCEL_ENV,'Production DB prohibited');
  const h=await createRealBackendHarness();
  const tag=randomUUID();
  let memberId='',ingredientId='';
  t.after(async()=>{
    try{
      if(ingredientId){
        await h.prisma.$executeRawUnsafe(`
          DELETE FROM public."GymIngredientMicronutrient"
          WHERE "tenantId"=$1 AND "profileId" IN (
            SELECT "id" FROM public."GymIngredientNutritionProfile"
            WHERE "tenantId"=$1 AND "ingredientId"=$2
          )`,h.tenant.id,ingredientId);
        await h.prisma.$executeRawUnsafe(
          'DELETE FROM public."GymIngredientNutritionProfile" WHERE "tenantId"=$1 AND "ingredientId"=$2',
          h.tenant.id,ingredientId);
        await h.prisma.$executeRawUnsafe(`
          DELETE FROM public."GymRecipeItem"
          WHERE "tenantId"=$1 AND "recipeId" IN (
            SELECT "id" FROM public."GymRecipe"
            WHERE "tenantId"=$1 AND "name"=$2
          )`,h.tenant.id,'QA recipe '+tag);
        await h.prisma.$executeRawUnsafe(
          'DELETE FROM public."GymRecipe" WHERE "tenantId"=$1 AND "name"=$2',
          h.tenant.id,'QA recipe '+tag);
      }
      if(memberId&&ingredientId){
        await h.prisma.$executeRawUnsafe(
          'DELETE FROM public."GymNutritionRule" WHERE "tenantId"=$1 AND "memberId"=$2 AND "ingredientId"=$3',
          h.tenant.id,memberId,ingredientId);
      }
      if(ingredientId)await h.prisma.$executeRawUnsafe(
        'DELETE FROM public."GymIngredient" WHERE "tenantId"=$1 AND "id"=$2',
        h.tenant.id,ingredientId);
      if(memberId)await h.prisma.$executeRawUnsafe(
        'DELETE FROM public."GymMember" WHERE "tenantId"=$1 AND "id"=$2',
        h.tenant.id,memberId);
    }finally{await h.close();}
  });
  const member=await h.ok('/verticals/gym/members',{method:'POST',body:JSON.stringify({
    memberCode:tag,fullName:'QA nutrition lock '+tag,
    status:'active',goals:[],emergencyContact:{}
  })});
  memberId=member.id;
  const ingredient=await h.ok('/verticals/gym/ingredients',{method:'POST',body:JSON.stringify({
    name:'QA ingredient '+tag,defaultUnit:'g',active:true
  })});
  ingredientId=ingredient.id;
  const post=(uri:string,body:unknown)=>h.request(uri,{method:'POST',body:JSON.stringify(body)});
  const profile={
    basisQuantity:100,basisUnit:'g',energyKcal:120,proteinG:2,
    carbsG:24,fatG:1,fiberG:3,micronutrients:[]
  };
  const profileResults=await Promise.all([
    post('/verticals/gym/ingredients/'+ingredientId+'/nutrition-profiles',profile),
    post('/verticals/gym/ingredients/'+ingredientId+'/nutrition-profiles',
      {...profile,energyKcal:130})
  ]);
  assert.deepEqual(profileResults.map(x=>x.response.status),[201,201],
    JSON.stringify(profileResults.map(x=>x.payload)));
  assert.deepEqual(profileResults.map(x=>Number(x.data.version)).sort((a,b)=>a-b),[1,2]);
  const persisted=await h.ok('/verticals/gym/ingredients/'+ingredientId+'/nutrition-profiles');
  assert.deepEqual(persisted.history.map((x:any)=>Number(x.version)),[2,1]);

  const rule={memberId,ingredientId,kind:'exclusion',notes:'QA rule '+tag};
  const rules=await Promise.all([
    post('/verticals/gym/nutrition-rules',rule),
    post('/verticals/gym/nutrition-rules',rule)
  ]);
  assert.deepEqual(rules.map(x=>x.response.status).sort((a,b)=>a-b),[201,409],
    JSON.stringify(rules.map(x=>x.payload)));
  const persistedRules=await h.ok('/verticals/gym/nutrition-rules?memberId='+memberId);
  assert.equal(persistedRules.filter((x:any)=>x.ingredientId===ingredientId).length,1);

  const recipe={name:'QA recipe '+tag,servings:2,
    items:[{ingredientId,quantity:150,unit:'g'}]};
  const recipes=await Promise.all([
    post('/verticals/gym/recipes',recipe),
    post('/verticals/gym/recipes',recipe)
  ]);
  assert.deepEqual(recipes.map(x=>x.response.status).sort((a,b)=>a-b),[201,409],
    JSON.stringify(recipes.map(x=>x.payload)));
  const stored=await h.ok('/verticals/gym/recipes');
  assert.equal(stored.filter((x:any)=>x.name===recipe.name).length,1);
});
