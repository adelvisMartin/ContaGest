import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const routes=readFileSync(new URL('../backend/src/modules/verticals/gym-extended.routes.ts',import.meta.url),'utf8');
const flow=routes.split("router.patch('/gym/memberships/:id/status'")[1]?.split('export default router')[0]||'';

test('#709 member is locked before membership, matching activation lock order',()=>{
  const member=flow.indexOf('public."GymMember" WHERE "id"=$1 AND "tenantId"=$2 FOR UPDATE');
  const membership=flow.indexOf('public."GymMembership" WHERE "id"=$1 AND "tenantId"=$2 FOR UPDATE');
  assert.ok(member>=0 && membership>member);
  assert.match(flow,/assertGymMembershipTransition\(/);
  assert.match(flow,/otherActiveCount:other\[0\]\?\.taken\?\?0/);
});

test('#709 membership transition and audit share a rollback-capable transaction',()=>{
  assert.match(flow,/prisma\.\$transaction\(async tx => \{/);
  assert.match(flow,/writeAudit\(\{tenantId,userId:actorId,action:'gym\.membership\.status'/);
  assert.match(flow,/userAgent:req\.get\('user-agent'\)\},tx\)/);
  assert.match(flow,/WHERE "id"=\$1 AND "tenantId"=\$2 RETURNING \*/);
  assert.match(flow,/requirePermission\('gym\.manage'\)/);
  assert.match(flow,/if\(!actorId\)throw new HttpError\(401/);
});

test('#709 invalid periods, cancelled resurrections and second active memberships reject',()=>{
  assert.match(flow,/endsAt<=current\.startsAt/);
  assert.match(flow,/GYM_MEMBERSHIP_/);
  assert.match(flow,/WHERE "tenantId"=\$1 AND "memberId"=\$2 AND "status"='active' AND "id"<>\$3/);
});
