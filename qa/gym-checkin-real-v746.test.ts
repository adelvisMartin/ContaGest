import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRealBackendHarness } from './support/real-backend-harness.ts';

test('Gym #746: memberships atomic; check-in replay and concurrency use durable tenant-scoped identity',async(t)=>{
  assert.notEqual(String(process.env.NODE_ENV||'').toLowerCase(),'production');
  const h=await createRealBackendHarness();
  const run=randomUUID();
  let memberId='',planId='';
  t.after(async()=>{
    await h.close().catch(()=>undefined);
    if(memberId){
      await h.prisma.$executeRawUnsafe('DELETE FROM public."GymCheckIn" WHERE "tenantId"=$1 AND "memberId"=$2',h.tenant.id,memberId).catch(()=>undefined);
      await h.prisma.$executeRawUnsafe('DELETE FROM public."GymMembership" WHERE "tenantId"=$1 AND "memberId"=$2',h.tenant.id,memberId).catch(()=>undefined);
      await h.prisma.$executeRawUnsafe('DELETE FROM public."GymMember" WHERE "tenantId"=$1 AND "id"=$2',h.tenant.id,memberId).catch(()=>undefined);
    }
    if(planId)await h.prisma.$executeRawUnsafe('DELETE FROM public."GymMembershipPlan" WHERE "tenantId"=$1 AND "id"=$2',h.tenant.id,planId).catch(()=>undefined);
  });
  const member=await h.ok('/verticals/gym/members',{
    method:'POST',body:JSON.stringify({memberCode:run,fullName:'QA 746 Membership',status:'active',goals:[],emergencyContact:{}})
  });
  memberId=String(member.id);
  const plan=await h.ok('/verticals/gym/plans',{
    method:'POST',body:JSON.stringify({name:'QA 746 '+run,durationDays:30,price:0,currency:'USD',accessLimit:2,metadata:{}})
  });
  planId=String(plan.id);
  const activation=()=>h.ok('/verticals/gym/memberships',{
    method:'POST',body:JSON.stringify({memberId,planId,startsAt:new Date(Date.now()-60000).toISOString(),autoRenew:false,balance:0})
  });
  // Two concurrent activations leave one active membership because the member
  // lock serializes expire + insert. No window exists where both may be active.
  const created=await Promise.all([activation(),activation()]);
  assert.notEqual(created[0].id,created[1].id);
  const active=await h.prisma.$queryRawUnsafe<Array<{id:string}>>(
    'SELECT "id" FROM public."GymMembership" WHERE "tenantId"=$1 AND "memberId"=$2 AND "status"=\'active\'',h.tenant.id,memberId
  );
  assert.equal(active.length,1);
  const post=(requestKey:string,method='manual')=>h.request('/verticals/gym/checkins',{
    method:'POST',body:JSON.stringify({memberId,method,device:'qa-746',requestKey})
  });
  const key=randomUUID();
  const pair=await Promise.all([post(key),post(key)]);
  assert.deepEqual(pair.map(x=>x.response.status).sort(),[200,201]);
  assert.equal(pair[0].data.id,pair[1].data.id,'parallel retry must return persisted event');
  assert.deepEqual(pair.map(x=>x.data.replayed).sort(),[false,true]);
  const again=await post(key);
  assert.equal(again.response.status,200);
  assert.equal(again.data.id,pair[0].data.id);
  assert.equal(again.data.replayed,true);
  const conflict=await post(key,'qr');
  assert.equal(conflict.response.status,409,'same key and different payload must fail closed');
  const key2=randomUUID();
  const second=await post(key2);
  assert.equal(second.response.status,201);
  assert.equal(second.data.result,'accepted');
  const deniedKey=randomUUID();
  const denied=await post(deniedKey);
  assert.equal(denied.response.status,200);
  assert.equal(denied.data.result,'rejected');
  assert.equal((await post(deniedKey)).data.id,denied.data.id);
  const saved=await h.prisma.$queryRawUnsafe<Array<{result:string}>>(
    'SELECT "result" FROM public."GymCheckIn" WHERE "tenantId"=$1 AND "memberId"=$2',h.tenant.id,memberId
  );
  assert.equal(saved.length,3,'two accepted, one rejected; replay creates no fourth row');
  assert.equal(saved.filter(x=>x.result==='accepted').length,2);
  const balance=await h.prisma.$queryRawUnsafe<Array<{remainingAccesses:number}>>(
    'SELECT "remainingAccesses" FROM public."GymMembership" WHERE "tenantId"=$1 AND "id"=$2',
    h.tenant.id,active[0].id
  );
  assert.equal(balance[0].remainingAccesses,0);
  const other=await h.status('/verticals/gym/checkins',404,{
    method:'POST',body:JSON.stringify({memberId:randomUUID(),method:'manual',requestKey:randomUUID()})
  });
  assert.equal(other.response.status,404,'unowned member may not be checked in');
});
