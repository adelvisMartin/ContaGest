import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRealBackendHarness} from './support/real-backend-harness.ts';

test('#746 payment insert and membership debit remain one tenant-scoped transaction',async(t)=>{
  assert.notEqual(String(process.env.NODE_ENV||'').toLowerCase(),'production');
  assert.ok(!process.env.VERCEL&&!process.env.VERCEL_ENV,'Production DB forbidden for QA');
  const h=await createRealBackendHarness();
  let memberId='',otherMemberId='',planId='',foreignTenantId='',foreignMemberId='';
  t.after(async()=>{
    // All records in this fixture are run-owned; remove children before parents.
    if(memberId){
      await h.prisma.$executeRawUnsafe(
        'DELETE FROM public."GymPayment" WHERE "tenantId"=$1 AND "memberId"=$2',h.tenant.id,memberId);
      await h.prisma.$executeRawUnsafe(
        'DELETE FROM public."GymMembership" WHERE "tenantId"=$1 AND "memberId"=$2',h.tenant.id,memberId);
      await h.prisma.$executeRawUnsafe(
        'DELETE FROM public."GymMember" WHERE "tenantId"=$1 AND "id"=$2',h.tenant.id,memberId);
    }
    if(otherMemberId)await h.prisma.$executeRawUnsafe(
      'DELETE FROM public."GymMember" WHERE "tenantId"=$1 AND "id"=$2',h.tenant.id,otherMemberId);
    if(foreignMemberId)await h.prisma.$executeRawUnsafe(
      'DELETE FROM public."GymMember" WHERE "tenantId"=$1 AND "id"=$2',foreignTenantId,foreignMemberId);
    if(foreignTenantId)await h.prisma.tenant.deleteMany({where:{id:foreignTenantId}});
    if(planId)await h.prisma.$executeRawUnsafe(
      'DELETE FROM public."GymMembershipPlan" WHERE "tenantId"=$1 AND "id"=$2',h.tenant.id,planId);
    await h.close();
  });
  const run=randomUUID();
  const member=await h.ok('/verticals/gym/members',{
    method:'POST',body:JSON.stringify({
      memberCode:run,fullName:'QA 746 Pago '+run,status:'active',goals:[],emergencyContact:{}
    })
  });
  memberId=member.id;
  const otherMember=await h.ok('/verticals/gym/members',{
    method:'POST',body:JSON.stringify({
      memberCode:randomUUID(),fullName:'QA 746 Otro '+run,
      status:'active',goals:[],emergencyContact:{}
    })
  });
  otherMemberId=otherMember.id;
  const plan=await h.ok('/verticals/gym/plans',{
    method:'POST',body:JSON.stringify({
      name:'QA Payment '+run,durationDays:30,price:50,currency:'USD',
      accessLimit:10,metadata:{}
    })
  });
  planId=plan.id;
  const membership=await h.ok('/verticals/gym/memberships',{
    method:'POST',body:JSON.stringify({
      memberId,planId,startsAt:new Date(Date.now()-60000).toISOString(),
      autoRenew:false,balance:50
    })
  });
  const payment={memberId,membershipId:membership.id,amount:20,currency:'USD',
    status:'paid',method:'manual',reference:'qa-'+run};
  const post=(data:unknown)=>h.request('/verticals/gym/payments',{
    method:'POST',body:JSON.stringify(data)
  });
  const paid=await post(payment);
  assert.equal(paid.response.status,201,JSON.stringify(paid.payload));
  assert.equal(paid.data.membershipId,membership.id);

  const amount=async()=>{
    const rows=await h.prisma.$queryRawUnsafe<Array<{balance:string}>>(
      'SELECT "balance" FROM public."GymMembership" WHERE "tenantId"=$1 AND "id"=$2',
      h.tenant.id,membership.id);
    return Number(rows[0]?.balance);
  };
  assert.equal(await amount(),30);
  const pending=await post({...payment,amount:10,status:'pending',reference:'pending-'+run});
  assert.equal(pending.response.status,201);
  assert.equal(await amount(),30,'pending is not a paid balance effect');

  const rejected=await post({...payment,memberId:otherMemberId,reference:'cross-member-'+run});
  assert.equal(rejected.response.status,404);
  const missing=await post({...payment,membershipId:randomUUID(),reference:'missing-'+run});
  assert.equal(missing.response.status,404);
  assert.equal(await amount(),30);
  // A payment without membership must still validate the member's own tenant.
  const unknownMember=await post({...payment,memberId:randomUUID(),
    membershipId:null,reference:'unknown-member-'+run});
  assert.equal(unknownMember.response.status,404);
  const foreign=await h.prisma.tenant.create({data:{
    rif:'QA746-'+run.slice(0,12),name:'QA foreign Gym payment',
    legalName:'QA foreign Gym',plan:'commercial',status:'active',settings:{}
  }});
  foreignTenantId=foreign.id;
  foreignMemberId=randomUUID();
  await h.prisma.$executeRawUnsafe(`
    INSERT INTO public."GymMember"
      ("id","tenantId","memberCode","fullName","emergencyContact","goals",
       "status","joinedAt","createdAt","updatedAt")
    VALUES ($1,$2,$3,$4,'{}'::jsonb,'[]'::jsonb,'active',now(),now(),now())
  `,foreignMemberId,foreignTenantId,'QA-'+run,'QA external Gym member');
  const crossTenant=await post({...payment,memberId:foreignMemberId,
    membershipId:null,reference:'cross-tenant-'+run});
  assert.equal(crossTenant.response.status,404);
  assert.equal(await amount(),30,'invalid member references cannot debit membership');

  const concurrent=await Promise.all([
    post({...payment,amount:15,reference:'concurrent-a-'+run}),
    post({...payment,amount:15,reference:'concurrent-b-'+run})
  ]);
  assert.ok(concurrent.every(result=>result.response.status===201),
    JSON.stringify(concurrent.map(r=>r.payload)));
  assert.equal(await amount(),0,'concurrent paid events cannot lose a debit');
  const persisted=await h.prisma.$queryRawUnsafe<Array<{id:string;status:string}>>(
    'SELECT "id","status" FROM public."GymPayment" WHERE "tenantId"=$1 AND "memberId"=$2',
    h.tenant.id,memberId);
  assert.equal(persisted.length,4,'rejected references must not insert a payment');
  assert.equal(persisted.filter(row=>row.status==='paid').length,3);
});
