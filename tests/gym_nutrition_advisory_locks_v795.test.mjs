import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../backend/src/modules/verticals/gym-nutrition.routes.ts',import.meta.url),'utf8');

test('#795 nutrition profile, rule and recipe locks run as SELECT queries in the same transaction',()=>{
  const boundaries=[
    ["router.post('/gym/ingredients/:id/nutrition-profiles'","router.get('/gym/nutrition/:id/nutrients'","GymIngredientNutritionProfile"],
    ["router.post('/gym/nutrition-rules'","router.patch('/gym/nutrition-rules/:id'","GymNutritionRule"],
    ["router.post('/gym/recipes'","router.get('/gym/nutrition'","GymRecipe"]
  ];
  let locks=0;
  for(const [begin,end,table] of boundaries){
    const start=source.indexOf(begin),finish=source.indexOf(end,start+begin.length);
    assert.ok(start>0&&finish>start,`route bounds absent: ${table}`);
    const body=source.slice(start,finish);
    assert.match(body,/prisma\.\$transaction\(async\(tx\)=>\{/);
    assert.match(body,/await tx\.\$queryRawUnsafe(?:<[^\n]+>)?\('SELECT pg_advisory_xact_lock\(hashtextextended\(\$1,0\)\)::text AS locked'/);
    assert.doesNotMatch(body,/\$executeRawUnsafe\s*\(\s*['"`]SELECT pg_advisory_xact_lock/);
    const lockAt=body.indexOf('SELECT pg_advisory_xact_lock');
    const nextRead=body.indexOf('SELECT ',lockAt+35);
    const insert=body.indexOf('INSERT INTO public."'+table+'"');
    assert.ok(lockAt>=0&&insert>lockAt&&nextRead>lockAt,
      `lock must precede read and write for ${table}`);
    assert.match(body,/requirePermission\('gym\.manage'\)/);
    locks++;
  }
  assert.equal(locks,3);
});
