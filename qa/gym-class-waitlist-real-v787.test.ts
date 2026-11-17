import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRealBackendHarness } from './support/real-backend-harness.ts';

test('Gym #787 PG17: capacity, FIFO waitlist and promotion',async(t)=>{
  assert.notEqual(String(process.env.NODE_ENV||'').toLowerCase(),'production');
  const h=await createRealBackendHarness();
  const run=randomUUID(), members:string[]=[], classIds:string[]=[];
  let trainerId='',planId='';
  t.after(async()=>{
    await h.close().catch(()=>undefined);
    for(const id of classIds){
      await h.prisma.$executeRawUnsafe('DELETE FROM public."GymClassBooking" WHERE "tenantId"=$1 AND "classId"=$2',h.tenant.id,id).catch(()=>undefined);
      await h.prisma.$executeRawUnsafe('DELETE FROM public."GymClass" WHERE "tenantId"=$1 AND "id"=$2',h.tenant.id,id).catch(()=>undefined);
    }
    for(const id of members){
      await h.prisma.$executeRawUnsafe('DELETE FROM public."GymMembership" WHERE "tenantId"=$1 AND "memberId"=$2',h.tenant.id,id).catch(()=>undefined);
      await h.prisma.$executeRawUnsafe('DELETE FROM public."GymMember" WHERE "tenantId"=$1 AND "id"=$2',h.tenant.id,id).catch(()=>undefined);
    }
    if(planId)await h.prisma.$executeRawUnsafe('DELETE FROM public."GymMembershipPlan" WHERE "tenantId"=$1 AND "id"=$2',h.tenant.id,planId).catch(()=>undefined);
    if(trainerId)await h.prisma.$executeRawUnsafe('DELETE FROM public."GymTrainer" WHERE "tenantId"=$1 AND "id"=$2',h.tenant.id,trainerId).catch(()=>undefined);
  });
  const plan=await h.ok('/verticals/gym/plans',{method:'POST',
    body:JSON.stringify({name:'QA 787 '+run,durationDays:30,price:0,currency:'USD',metadata:{}})
  });
  planId=plan.id;
  const trainer=await h.ok('/verticals/gym/trainers',{method:'POST',
    body:JSON.stringify({fullName:'QA 787 Trainer',specialties:[],status:'active'})
  });
  trainerId=trainer.id;
  for(let i=0;i<3;i++){
    const member=await h.ok('/verticals/gym/members',{method:'POST',
      body:JSON.stringify({memberCode:String(i)+run,fullName:'QA 787 Member '+i,status:'active',goals:[],emergencyContact:{}})
    });
    members.push(member.id);
    await h.ok('/verticals/gym/memberships',{method:'POST',
      body:JSON.stringify({memberId:member.id,planId,startsAt:new Date(Date.now()-60000).toISOString(),autoRenew:false,balance:0})
    });
  }
  const start=new Date(Date.now()+86400000),end=new Date(start.getTime()+3600000);
  const body={name:'QA 787 '+run,trainerId,startsAt:start.toISOString(),endsAt:end.toISOString(),capacity:1,location:'QA room '+run};
  const klass=await h.ok('/verticals/gym/classes',{method:'POST',body:JSON.stringify(body)});
  classIds.push(klass.id);
  await h.status('/verticals/gym/classes',409,{method:'POST',body:JSON.stringify({...body,name:'Conflicting trainer',location:'Other'})});
  const post=(memberId:string,status='booked',allowWaitlist=true)=>h.request('/verticals/gym/classes/bookings',{
    method:'POST',body:JSON.stringify({classId:klass.id,memberId,status,allowWaitlist})
  });
  const race=await Promise.all([post(members[0]),post(members[1])]);
  assert.deepEqual(race.map(x=>x.response.status).sort(),[201,201]);
  assert.deepEqual(race.map(x=>x.data.status).sort(),['booked','waitlisted']);
  const bookedId=race.find(x=>x.data.status==='booked')!.data.memberId;
  const waitingId=race.find(x=>x.data.status==='waitlisted')!.data.memberId;
  const replay=await post(waitingId);
  assert.equal(replay.response.status,200);
  assert.equal(replay.data.id,race.find(x=>x.data.status==='waitlisted')!.data.id);
  const third=await post(members[2]);
  assert.equal(third.data.status,'waitlisted');
  const cancelled=await post(bookedId,'cancelled');
  assert.equal(cancelled.data.status,'cancelled');
  const bookings=await h.ok('/verticals/gym/classes/'+klass.id+'/bookings');
  assert.equal(bookings.find((x:any)=>x.memberId===waitingId).status,'booked');
  assert.equal(bookings.find((x:any)=>x.memberId===members[2]).status,'waitlisted');
  assert.equal(bookings.filter((x:any)=>x.status==='booked').length,1);
});
