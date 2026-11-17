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
