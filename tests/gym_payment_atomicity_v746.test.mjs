import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const routes=readFileSync(new URL('../backend/src/modules/verticals/gym-extended.routes.ts',import.meta.url),'utf8');
const payment=routes.split("router.post('/gym/payments'")[1]
  .split("router.get('/gym/classes/:classId/bookings'")[0];

test('#746 payment and membership balance persist in one transaction',()=>{
  const transaction=payment.indexOf('prisma.$transaction(async tx =>');
  const lock=payment.indexOf('FOR UPDATE');
  const insert=payment.indexOf('INSERT INTO public."GymPayment"');
  const update=payment.indexOf('UPDATE public."GymMembership"');
  const returnRow=payment.indexOf('return one(rows)');
  assert.ok(transaction>=0&&lock>transaction&&insert>lock&&update>insert&&returnRow>update);
  assert.match(payment,/await tx\.\$queryRawUnsafe/);
  assert.match(payment,/await tx\.\$executeRawUnsafe/);
  assert.match(payment,/if \(changed !== 1\)/);
  assert.doesNotMatch(payment,/await prisma\.\$(?:queryRawUnsafe|executeRawUnsafe)/);
});

test('#746 cannot apply a membership payment outside its tenant and member',()=>{
  assert.match(payment,/WHERE "id"=\$1 AND "tenantId"=\$2 AND "memberId"=\$3 FOR UPDATE/);
  assert.match(payment,/WHERE "id"=\$1 AND "tenantId"=\$3 AND "memberId"=\$4/);
  assert.match(payment,/if \(!membershipRows\.length\)/);
  assert.match(payment,/throw new HttpError\(404/);
});

test('#746 pending/refunded/void entries do not decrement the membership',()=>{
  assert.match(payment,/body\.membershipId && body\.status === 'paid'/);
  assert.match(payment,/GREATEST\(0,"balance"-\$2\)/);
  assert.match(payment,/ok\(res,payment,201\)/);
});
