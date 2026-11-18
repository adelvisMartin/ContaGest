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
  const prematureAttendance=await post(bookedId,'attended');
  const prematureNoShow=await post(bookedId,'no_show');
  assert.equal(prematureAttendance.response.status,409,'future class cannot be marked attended');
  assert.equal(prematureNoShow.response.status,409,'future class cannot be marked no-show');
  const unchanged=await h.ok('/verticals/gym/classes/'+klass.id+'/bookings');
  assert.equal(unchanged.find((row:any)=>row.memberId===bookedId).status,'booked');
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
  // A cancelled occurrence must not acquire fake attendance/no-show, even
  // after its original time passes. This is a run-owned disposable fixture.
  const pastStart=new Date(Date.now()-7200000).toISOString();
  const pastEnd=new Date(Date.now()-3600000).toISOString();
  await h.prisma.$executeRawUnsafe(`
    UPDATE public."GymClass"
    SET "status"='cancelled',"startsAt"=$3::timestamptz,"endsAt"=$4::timestamptz
    WHERE "tenantId"=$1 AND "id"=$2
  `,h.tenant.id,klass.id,pastStart,pastEnd);
  assert.equal((await post(waitingId,'attended')).response.status,409,
    'cancelled class cannot gain an attended event');
  assert.equal((await post(waitingId,'no_show')).response.status,409,
    'cancelled class cannot gain a fabricated absence');
  const unchangedCancelled=await h.ok('/verticals/gym/classes/'+klass.id+'/bookings');
  assert.equal(unchangedCancelled.find((x:any)=>x.memberId===waitingId).status,'booked');
  const releasedAfterClassCancelled=await post(waitingId,'cancelled');
  assert.equal(releasedAfterClassCancelled.response.status,201,
    'cancelled class must still allow releasing a booking');
  assert.equal(releasedAfterClassCancelled.data.promotedBookingId,null,
    'cancelled class must not promote waiting members');

  // New class: first-in-line loses eligibility before the confirmed seat is
  // cancelled. Do not silently promote the frozen membership; use the next
  // eligible member without overwriting the original waitlist history.
  const start2=new Date(Date.now()+3*86400000);
  const end2=new Date(start2.getTime()+3600000);
  const second=await h.ok('/verticals/gym/classes',{method:'POST',body:JSON.stringify({
    ...body,name:'QA 787 freeze '+run,
    startsAt:start2.toISOString(),endsAt:end2.toISOString(),location:'QA second room '+run
  })});
  classIds.push(second.id);
  const bookSecond=(memberId:string,status='booked')=>h.request('/verticals/gym/classes/bookings',{
    method:'POST',body:JSON.stringify({classId:second.id,memberId,status,allowWaitlist:true})
  });
  const lead=await bookSecond(members[0]);assert.equal(lead.data.status,'booked');
  const early=await bookSecond(members[1]);assert.equal(early.data.status,'waitlisted');
  const later=await bookSecond(members[2]);assert.equal(later.data.status,'waitlisted');
  await h.prisma.$executeRawUnsafe(
    'UPDATE public."GymMembership" SET "status"=\'frozen\' WHERE "tenantId"=$1 AND "memberId"=$2',
    h.tenant.id,members[1]
  );
  const freed=await bookSecond(members[0],'cancelled');
  assert.equal(freed.response.status,201);
  assert.equal(freed.data.promotedBookingId,later.data.id);
  const all=await h.ok('/verticals/gym/classes/'+second.id+'/bookings');
  assert.equal(all.find((x:any)=>x.memberId===members[1]).status,'waitlisted');
  assert.equal(all.find((x:any)=>x.memberId===members[2]).status,'booked');
});
