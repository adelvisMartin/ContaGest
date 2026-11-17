import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRealBackendHarness } from './support/real-backend-harness.ts';

test('Gym #795 real PostgreSQL: new plan version preserves historical meals and snapshots',async(t)=>{
  assert.notEqual(String(process.env.NODE_ENV||'').toLowerCase(),'production');
  const h=await createRealBackendHarness();
  const tag=randomUUID();
  let memberId='',ingredientId='';
  const planIds:string[]=[];
  t.after(async()=>{
    await h.close().catch(()=>undefined);
    for(const planId of planIds){
      await h.prisma.$executeRawUnsafe('DELETE FROM public."GymNutritionPlanNutrientSnapshot" WHERE "tenantId"=$1 AND "planId"=$2',h.tenant.id,planId).catch(()=>undefined);
      await h.prisma.$executeRawUnsafe('DELETE FROM public."GymMealItem" WHERE "tenantId"=$1 AND "mealId" IN (SELECT "id" FROM public."GymMeal" WHERE "tenantId"=$1 AND "nutritionPlanId"=$2)',h.tenant.id,planId).catch(()=>undefined);
      await h.prisma.$executeRawUnsafe('DELETE FROM public."GymMealAlternative" WHERE "tenantId"=$1 AND "mealId" IN (SELECT "id" FROM public."GymMeal" WHERE "tenantId"=$1 AND "nutritionPlanId"=$2)',h.tenant.id,planId).catch(()=>undefined);
      await h.prisma.$executeRawUnsafe('DELETE FROM public."GymMeal" WHERE "tenantId"=$1 AND "nutritionPlanId"=$2',h.tenant.id,planId).catch(()=>undefined);
    }
    for(const planId of planIds.slice().reverse())await h.prisma.$executeRawUnsafe('DELETE FROM public."GymNutritionPlan" WHERE "tenantId"=$1 AND "id"=$2',h.tenant.id,planId).catch(()=>undefined);
    if(ingredientId)await h.prisma.$executeRawUnsafe('DELETE FROM public."GymIngredient" WHERE "tenantId"=$1 AND "id"=$2',h.tenant.id,ingredientId).catch(()=>undefined);
    if(memberId)await h.prisma.$executeRawUnsafe('DELETE FROM public."GymMember" WHERE "tenantId"=$1 AND "id"=$2',h.tenant.id,memberId).catch(()=>undefined);
  });
  const member=await h.ok('/verticals/gym/members',{method:'POST',body:JSON.stringify({
    memberCode:tag,fullName:'QA 795 Versioned Plan',status:'active',goals:[],emergencyContact:{}
  })});
  memberId=member.id;
  const ingredient=await h.ok('/verticals/gym/ingredients',{method:'POST',body:JSON.stringify({
    name:'QA 795 Ingredient '+tag,defaultUnit:'g',active:true
  })});
  ingredientId=ingredient.id;
  const meal=(qty:number)=>({
    dayIndex:1,dayOfWeek:1,sortOrder:1,mealType:'Desayuno',servings:1,
    items:[{ingredientId,quantity:qty,unit:'g'}],alternatives:[]
  });
  const payload=(qty:number)=>({memberId,name:'QA 795 Plan '+tag,durationDays:7,
    startsAt:'2026-11-16',meals:[meal(qty)]
  });
  const first=await h.ok('/verticals/gym/nutrition',{method:'POST',body:JSON.stringify(payload(100))});
  planIds.push(first.id);
  assert.equal(first.version,1);
  const second=await h.ok('/verticals/gym/nutrition',{method:'POST',
    body:JSON.stringify({...payload(200),supersedesId:first.id})});
  planIds.push(second.id);
  assert.equal(second.version,2);
  assert.equal(second.supersedesId,first.id);
  assert.equal(second.planKey,first.planKey);
  await h.status('/verticals/gym/nutrition',409,{method:'POST',
    body:JSON.stringify({...payload(300),supersedesId:first.id})});
  const plans=await h.ok('/verticals/gym/nutrition?memberId='+memberId);
  const v1=plans.find((p:any)=>p.id===first.id);
  const v2=plans.find((p:any)=>p.id===second.id);
  assert.equal(v1.active,false);
  assert.equal(v2.active,true);
  assert.equal(Number(v1.meals[0].items[0].quantity),100);
  assert.equal(Number(v2.meals[0].items[0].quantity),200);
  const snapshot1=await h.ok('/verticals/gym/nutrition/'+first.id+'/nutrients');
  const snapshot2=await h.ok('/verticals/gym/nutrition/'+second.id+'/nutrients');
  assert.equal(snapshot1.snapshot.planId,first.id);
  assert.equal(snapshot2.snapshot.planId,second.id);
  await h.status('/verticals/gym/nutrition',422,{method:'POST',
    body:JSON.stringify({...payload(50),memberId:randomUUID(),supersedesId:second.id})});
});
