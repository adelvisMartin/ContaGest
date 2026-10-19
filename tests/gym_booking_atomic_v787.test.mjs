import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../backend/src/modules/verticals/gym-extended.routes.ts',import.meta.url),'utf8');
const route=source.split("router.post('/gym/classes/bookings',")[1].split("router.patch('/gym/memberships/:id/status'")[0];
test('#787 class row is locked BEFORE counting seats in same transaction',()=>{
  assert.match(route,/prisma\.\$transaction\(async tx =>/);
  assert.match(route,/FROM public\."GymClass"[\s\S]*?"tenantId"=\$2[\s\S]*?FOR UPDATE/);
  const lock=route.indexOf('FOR UPDATE'),count=route.indexOf('count(*)::int AS taken');
  assert.ok(lock>=0&&count>lock);
  assert.doesNotMatch(route,/await prisma\.\$queryRawUnsafe/);
});
test('#787 occupancy and booking rows are tenant scoped',()=>{
  assert.match(route,/FROM public\."GymClassBooking"[\s\S]*?"tenantId"=\$1 AND "classId"=\$2 AND "memberId"=\$3 LIMIT 1 FOR UPDATE/);
  assert.match(route,/WHERE "tenantId"=\$1 AND "classId"=\$2 AND "status" IN \('booked','attended'\)/);
  assert.match(route,/WHERE public\."GymClassBooking"\."tenantId" = EXCLUDED\."tenantId"/);
});
test('#787 repeated existing booking returns without occupying an extra seat',()=>{
  assert.match(route,/existing\?\.status === body\.status/);
  assert.match(route,/replayed:true/);
  assert.match(route,/outcome\.replayed \? 200 : 201/);
});
test('#787 pre-existing attended record cannot be rewritten, no phantom attendance',()=>{
  assert.match(route,/existing\?\.status === 'attended'/);
  assert.match(route,/else if \(!existing \|\| existing\.status !== 'booked'\)/);
  assert.match(route,/throw new HttpError\(409/);
});
test('#787 membership server gate precedes capacity reserve and insert',()=>{
  const member=route.indexOf('FROM public."GymMembership"');
  const occupancy=route.indexOf('count(*)::int AS taken');
  const insert=route.indexOf('INSERT INTO public."GymClassBooking"');
  assert.ok(member>0&&occupancy>member&&insert>occupancy);
  assert.match(route,/gymClass\.status !== 'scheduled'/);
  assert.match(route,/requirePermission\('gym.manage'\)/);
});
