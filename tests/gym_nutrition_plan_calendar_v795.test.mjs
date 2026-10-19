import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const calendar=fs.readFileSync('backend/src/modules/verticals/gym-calendar-date.ts','utf8');
const schema=fs.readFileSync('backend/src/modules/verticals/gym.schemas.ts','utf8');
const fn=new Function(calendar.replace('export function validGymCalendarDay(value: unknown): boolean',
  'function validGymCalendarDay(value)')+';return validGymCalendarDay;')();
const optional=value=>value===''||fn(value);
const plan=schema.slice(schema.indexOf('export const completeNutritionSchema'),
  schema.indexOf('export const nutritionSchema'));

test('#795 valid diet plan dates remain valid',()=>{
  for(const value of ['2024-02-29','2026-10-16','2026-12-31'])assert.equal(optional(value),true);
});
test('#795 impossible and timezone-ambiguous plan days rejected',()=>{
  for(const value of ['2026-02-30','2025-02-29','2026-04-31','16/10/2026',
    '2026-10-16T12:00:00Z','2026-13-01'])assert.equal(optional(value),false);
});
test('#795 existing optional blank and omitted end date are compatible',()=>{
  assert.equal(optional(''),true);
  assert.equal(fn(''),false);
  assert.match(plan,/endsAt:z.string\(\)\.refine/);
  assert.match(plan,/\.optional\(\)\.nullable\(\)/);
});
test('#795 nutrition authority guards both dates before writes',()=>{
  assert.match(plan,/startsAt:z.string\(\)\.refine\(\(value\)=>value===''\|\|validGymCalendarDay\(value\)/);
  assert.match(plan,/endsAt:z.string\(\)\.refine\(\(value\)=>value===''\|\|validGymCalendarDay\(value\)/);
  assert.match(plan,/if\(value.startsAt&&value.endsAt/);
  const route=fs.readFileSync('backend/src/modules/verticals/gym-nutrition.routes.ts','utf8');
  const begin=route.indexOf("router.post('/gym/nutrition'");
  const end=route.indexOf("router.get('/gym/nutrition/:id/shopping-list'",begin);
  const section=route.slice(begin,end);
  assert.ok(section.indexOf('completeNutritionSchema.parse')>=0);
  assert.match(section,/"tenantId"=\$1/);
});
