import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync('backend/src/modules/verticals/gym-calendar-date.ts','utf8');
const helper=source.replace('export function validGymCalendarDay(value: unknown): boolean','function validGymCalendarDay(value)');
const valid=new Function(helper+';return validGymCalendarDay;')();

test('#793 valid 2024 leap day and ordinary exact ISO days',()=>{
  for(const date of ['2024-02-29','2026-10-16','2000-02-29'])assert.equal(valid(date),true,date);
});
test('#793 rejects impossible day even if JS Date would normalize it',()=>{
  for(const date of ['2026-02-30','2025-02-29','2026-04-31','2026-13-01','0000-00-00'])
    assert.equal(valid(date),false,date);
});
test('#793 no timezone, locale, timestamp or numeric coercion',()=>{
  for(const date of ['2026-1-5','16/10/2026','2026-10-16T00:00:00Z',20261016,null,{}])
    assert.equal(valid(date),false,String(date));
});
test('#793 both performance period limits are checked BEFORE route query',()=>{
  const schema=fs.readFileSync('backend/src/modules/verticals/gym.schemas.ts','utf8');
  const start=schema.indexOf('export const performanceQuerySchema');
  const end=schema.indexOf('export const routineSchema',start);
  const body=schema.slice(start,end);
  assert.match(body,/from: z.string\(\)\.refine\(validGymCalendarDay/);
  assert.match(body,/to: z.string\(\)\.refine\(validGymCalendarDay/);
  const route=fs.readFileSync('backend/src/modules/verticals/gym-training.routes.ts','utf8');
  const scope=route.slice(route.indexOf("router.get('/gym/performance'"),route.indexOf("router.post('/gym/exercise-substitutions",route.indexOf("router.get('/gym/performance'")));
  assert.ok(scope.indexOf('performanceQuerySchema.parse')<scope.indexOf('new Date('));
  assert.match(scope,/"tenantId"=\$1/);
});
