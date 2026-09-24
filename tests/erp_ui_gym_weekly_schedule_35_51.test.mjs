import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const backend=()=>fs.readFileSync('backend/src/modules/verticals/gym.routes.ts','utf8');
const page=()=>fs.readFileSync('frontend/src/pages/GymManagementPage.jsx','utf8');
const builder=()=>fs.readFileSync('frontend/src/components/fitness/RoutineBuilder.jsx','utf8');
const schedule=()=>fs.readFileSync('frontend/src/components/fitness/WeeklyRoutineSchedule.jsx','utf8');
const days=()=>fs.readFileSync('frontend/src/data/fitnessWeekDays.js','utf8');

test('35/51 uses explicit Monday-Sunday dayOfWeek semantics',()=>{
  const source=days();
  for(const token of ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo']) assert.ok(source.includes(token),token);
  assert.match(source,/value:1/);
  assert.match(source,/value:7/);
  const ui=builder();
  assert.match(ui,/FITNESS_WEEK_DAYS/);
  assert.doesNotMatch(ui,/label:\s*`Día \$\{index\+1\}`/);
});

test('35/51 derives daysPerWeek from the actual programmed days',()=>{
  const source=page();
  assert.match(source,/scheduledDays/);
  assert.match(source,/new Set\(routineForm\.exercises\.map/);
  assert.match(source,/daysPerWeek:scheduledDays\.length/);
  assert.doesNotMatch(source,/label="Días\/semana"/);
});

test('35/51 backend rejects mismatched declared frequency and scheduled weekdays',()=>{
  const source=backend();
  const start=source.indexOf('const routineSchema = z.object');
  const end=source.indexOf('const ingredientSchema',start);
  const block=source.slice(start,end);
  assert.match(block,/\)\.superRefine\(\(value, refinement\)/);
  assert.match(block,/scheduledDays/);
  assert.match(block,/value\.daysPerWeek!==scheduledDays\.size/);
  assert.match(block,/La frecuencia semanal debe coincidir con los días programados/);
});

test('35/51 weekly schedule renders seven days and groups structured exercises',()=>{
  const source=schedule();
  assert.match(source,/FITNESS_WEEK_DAYS/);
  assert.match(source,/exercisesByDay/);
  assert.match(source,/Día de descanso/);
  assert.match(source,/CgEmptyState/);
  assert.doesNotMatch(source,/querySelector|addEventListener|innerHTML|document\./);
});

test('35/51 page composes one weekly schedule owner',()=>{
  const source=page();
  assert.equal((source.match(/<WeeklyRoutineSchedule/g)||[]).length,1);
  assert.match(source,/exercises=\{routineForm\.exercises\}/);
});
