import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync('backend/src/modules/verticals/gym-exercise-filters.ts','utf8');
const executable=source
  .replace('export function parseGymExerciseFilters(query: unknown)', 'function parseGymExerciseFilters(query)')
  .replace(' as Record<string, unknown>','')
  .replace('(name: string, limit: number)', '(name, limit)');
const parse=new Function(executable+'; return parseGymExerciseFilters;')();

test('#789 accepts and trims ordinary filters',()=>{
  assert.deepEqual(parse({q:'  press  ',equipment:' machine ',active:'true'}),
    {q:'press',muscleGroup:'',equipment:'machine',category:'',active:'true'});
});
test('#789 rejects arbitrary active selectors instead of treating as false',()=>{
  for(const active of ['yes','TRUE','0','maybe','undefined',null,['true']])
    assert.throws(()=>parse({active}),/GYM_EXERCISE_FILTER_INVALID/);
});
test('#789 rejects wildcard-length abuse and expression-shaped queries',()=>{
  for(const q of ['x'.repeat(121),['press'],{regex:'x'},0])
    assert.throws(()=>parse({q}),/GYM_EXERCISE_FILTER_INVALID/);
});
test('#789 rejects unknown keys and prohibited tenant-scoping from callers',()=>{
  for(const value of [{tenantId:'different'}, {sort:'createdAt'}, {take:'100000'},[]])
    assert.throws(()=>parse(value),/GYM_EXERCISE_FILTER_INVALID/);
});
test('#789 rejects NUL and CRLF in search filters',()=>{
  assert.throws(()=>parse({q:'example\u0000'}),/GYM_EXERCISE_FILTER_INVALID/);
  assert.throws(()=>parse({category:'class\r\nother'}),/GYM_EXERCISE_FILTER_INVALID/);
});
test('#789 exact limits and all valid boolean options remain accepted',()=>{
  for(const active of ['','true','false'])
    assert.equal(parse({q:'x'.repeat(120),active}).active,active);
});
test('#789 SQL consumer remains scoped to authenticated tenant',()=>{
  const route=fs.readFileSync('backend/src/modules/verticals/gym-training.routes.ts','utf8');
  const begin=route.indexOf("router.get('/gym/exercises'");
  const end=route.indexOf("router.post('/gym/exercises'",begin);
  const section=route.slice(begin,end);
  assert.match(section,/parseGymExerciseFilters\(req\.query\)/);
  assert.match(section,/new HttpError\(422/);
  assert.match(section,/"tenantId"=\$1/);
  assert.doesNotMatch(section,/req\.query\.tenantId/);
});
