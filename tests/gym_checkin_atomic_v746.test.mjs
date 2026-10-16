import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../backend/src/modules/verticals/gym-core.routes.ts',import.meta.url),'utf8');
const route=source.split("router.post('/gym/checkins',")[1].split("router.get('/gym/assessments'")[0];
test('#746 check-in has one transaction joining ledger insert and access decrement',()=>{
  assert.match(route,/prisma\.\$transaction\(async \(tx\) =>/);
  assert.match(route,/tx\.\$queryRawUnsafe/);
  assert.match(route,/tx\.\$executeRawUnsafe/);
  assert.doesNotMatch(route,/await prisma\.\$(?:queryRawUnsafe|executeRawUnsafe)/);
});
test('#746 row-level locking serializes same-tenant member and membership before read',()=>{
  assert.match(route,/FROM public\."GymMember"[\s\S]*?WHERE "tenantId"=\$1 AND "id"=\$2 FOR UPDATE/);
  assert.match(route,/FROM public\."GymMembership"[\s\S]*?AND "memberId"=\$2[\s\S]*?LIMIT 1 FOR UPDATE/);
});
test('#746 access decrement is tenant-scoped and conditional, never clamped after race',()=>{
  assert.match(route,/"remainingAccesses"="remainingAccesses"-1/);
  assert.match(route,/AND "tenantId"=\$2 AND "memberId"=\$3/);
  assert.match(route,/AND "remainingAccesses">0/);
  assert.doesNotMatch(route,/GREATEST\(0,"remainingAccesses"-1\)/);
  assert.match(route,/if \(changed !== 1\) throw new HttpError\(409/);
});
test('#746 zero/invalid access cannot produce a fabricated accepted check-in',()=>{
  assert.match(route,/Number\.isSafeInteger\(Number\(membership\.remainingAccesses\)\)/);
  assert.match(route,/Number\(membership\.remainingAccesses\) > 0/);
  assert.match(route,/accessValid\?'accepted':'rejected'/);
  assert.match(route,/accessValid\?membership\.id:null/);
});
test('#746 preserve permission and no implicit finance posting',()=>{
  assert.match(route,/requirePermission\('gym.manage'\)/);
  assert.match(route,/memberRows\.length\) throw new HttpError\(404/);
  assert.doesNotMatch(route,/GymPayment|JournalEntry|AccountLedger/);
});
