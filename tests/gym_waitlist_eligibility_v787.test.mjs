import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync('backend/src/modules/verticals/gym-extended.routes.ts','utf8');
const block=source.slice(source.indexOf("router.post('/gym/classes/bookings'"),source.indexOf("router.patch('/gym/memberships"));
test('#787 seat promotion and FIFO must both require active member and date-valid membership',()=>{
  const checks=block.match(/SELECT b\."id" FROM public\."GymClassBooking" b/g)||[];
  assert.equal(checks.length,2);
  assert.equal((block.match(/m\."status"='active'/g)||[]).length>=2,true);
  assert.equal((block.match(/ms\."status"='active'/g)||[]).length>=2,true);
  assert.equal((block.match(/ms\."startsAt"<\=\$3::timestamptz/g)||[]).length,2);
  assert.match(block,/klass\.startsAt>new Date\(\)/);
  assert.match(block,/FOR UPDATE OF b/);
});

test('#787 attendance cannot be claimed before start or no-show before class ends',()=>{
  const start=block.indexOf('const now = new Date()');
  const insertion=block.indexOf('INSERT INTO public."GymClassBooking"');
  assert.ok(start>0&&insertion>start,'temporal validation must precede booking mutation');
  assert.match(block,/body\.status==='attended'&&klass\.startsAt>now/);
  assert.match(block,/body\.status==='no_show'&&klass\.endsAt>now/);
  assert.match(block,/throw new HttpError\(409,'No se puede registrar asistencia/);
  assert.match(block,/throw new HttpError\(409,'No se puede marcar ausencia/);
});


test('#787 cancelled classes cannot gain attended or no-show facts, but remain cancellable',()=>{
  const guard=block.indexOf("if(klass.status==='cancelled'&&['attended','no_show'].includes(body.status))");
  const write=block.indexOf('INSERT INTO public."GymClassBooking"');
  const temporal=block.indexOf('const now = new Date()');
  assert.ok(guard>0&&guard<temporal&&temporal<write,'reject fabricated attendance before changing booking');
  assert.match(block,/throw new HttpError\(409,'Una clase cancelada no admite asistencia ni ausencia\.'/);
  // Do not prevent cleanup of a cancelled class's existing reservations.
  assert.doesNotMatch(block,/klass\.status==='cancelled'&&body\.status==='cancelled'/);
});
