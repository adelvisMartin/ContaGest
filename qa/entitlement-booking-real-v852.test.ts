import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRealBackendHarness} from './support/real-backend-harness.ts';
import {runWithRuntimeTenant} from '../backend/src/database/runtime-tenant-context.ts';
import {consumeCustomerRightInBookingTransaction} from '../backend/src/modules/entitlements/customer-entitlement.service.ts';

/**
 * Real PostgreSQL17 + RLS + #848 GiST, disposable *_v852 ONLY.
 * CG_ENTITLEMENT_QA_ISOLATED=true npm run test:backend:entitlement:real
 * Leaves synthetic records for database-level audit; destroy DB afterwards.
 */
test('#852 manual grant → unique right → booking/consume same tx → rollback safety',async(t)=>{
  assert.equal(process.env.CG_ENTITLEMENT_QA_ISOLATED,'true','BLOCKED: disposable PG17 QA flag required');
  assert.notEqual(process.env.NODE_ENV,'production');
  assert.ok(!process.env.VERCEL&&!process.env.VERCEL_ENV,'BLOCKED: deployment database forbidden');
  const {prisma}=await import('../backend/src/database/prisma.ts');
  const db=await prisma.$queryRaw<Array<{db:string;major:number}>>`
    SELECT current_database() AS db,current_setting('server_version_num')::int/10000 AS major
  `;
  assert.match(db[0]?.db||'',/_v852$/);
  assert.equal(db[0]?.major,17);

  const h=await createRealBackendHarness();
  t.after(async()=>h.close());
  const label=randomUUID().slice(0,8);
  const client=await h.prisma.client.create({data:{
    tenantId:h.tenant.id,rif:'J-852-'+label,name:'Beneficiario QA '+label
  }});
  const product=await h.prisma.product.create({data:{
    tenantId:h.tenant.id,sku:'BEN-'+label,name:'Producto de derecho QA '+label
  }});
  const location=await h.prisma.businessLocation.create({data:{
    tenantId:h.tenant.id,code:'B-'+label,name:'Sede QA '+label,timezone:'America/Caracas'
  }});
  const resource=await h.prisma.schedulingResource.create({data:{
    id:randomUUID(),tenantId:h.tenant.id,locationId:location.id,
    code:'BEN-'+label.toUpperCase(),kind:'room',status:'active',capacity:1
  }});
  const benefit=await h.ok('/customer-entitlements/benefits',{method:'POST',body:JSON.stringify({
    productId:product.id,name:'Sesiones QA '+label,scope:'ALL',quantity:'3.000'
  })});
  assert.match(String(benefit.quantity),/^3(?:\.0{1,3})?$/);

  const effectKey='qa852:grant:'+label;
  const validFrom='2026-10-01T00:00:00.000Z';
  const validUntil='2027-03-01T00:00:00.000Z';
  const body={benefitId:benefit.id,beneficiaryId:client.id,effectKey,
    reason:'Cortesía de pruebas controladas',validFrom,validUntil,locationId:location.id};
  const grant=await h.ok('/customer-entitlements/manual-grants',{
    method:'POST',body:JSON.stringify(body)
  });
  const replay=await h.request('/customer-entitlements/manual-grants',{
    method:'POST',body:JSON.stringify(body)
  });
  assert.equal(replay.response.status,200);
  assert.equal(replay.response.headers.get('Idempotency-Replayed'),'true');
  assert.equal(replay.data.id,grant.id);
  await h.status('/customer-entitlements/manual-grants',409,{
    method:'POST',body:JSON.stringify({...body,beneficiaryId:randomUUID()})
  });
  await h.status('/customer-entitlements/manual-grants',409,{
    method:'POST',body:JSON.stringify({...body,reason:'Motivo distinto para replay'})
  });

  const balances=await h.ok(`/customer-entitlements/clients/${client.id}`);
  assert.equal(balances.find((x:any)=>x.id===grant.id).remaining,'3.000');

  const startsAtUtc=new Date('2026-11-01T12:00:00.000Z');
  const endsAtUtc=new Date('2026-11-01T12:30:00.000Z');
  const createBooking=async(tx:any,bookingId:string,key:string)=>{
    await tx.schedulingBooking.create({data:{
      id:bookingId,tenantId:h.tenant.id,locationId:location.id,
      sourceType:'client',sourceId:client.id,idempotencyKey:key,status:'confirmed',
      startsAtUtc,endsAtUtc,createdBy:h.admin.id
    }});
    await tx.schedulingResourceAllocation.create({data:{
      id:randomUUID(),tenantId:h.tenant.id,locationId:location.id,
      bookingId,resourceId:resource.id,stepId:'session',status:'active',
      occupiedStartAt:startsAtUtc,occupiedEndAt:endsAtUtc
    }});
  };
  const actor={tenantId:h.tenant.id,userId:h.admin.id};
  const bookingId=randomUUID(),bookingKey=randomUUID(),consumeEffect='qa852:use:'+label;

  await runWithRuntimeTenant(h.tenant.id,()=>h.prisma.$transaction(async tx=>{
    await createBooking(tx,bookingId,bookingKey);
    const c=await consumeCustomerRightInBookingTransaction(tx,actor,{
      entitlementId:grant.id,bookingId,effectKey:consumeEffect,quantity:'1.000'
    });
    assert.equal(c.replayed,false);
    const retried=await consumeCustomerRightInBookingTransaction(tx,actor,{
      entitlementId:grant.id,bookingId,effectKey:consumeEffect,quantity:'1.000'
    });
    assert.equal(retried.replayed,true);
  }));
  assert.equal((await h.ok(`/customer-entitlements/clients/${client.id}`))
    .find((x:any)=>x.id===grant.id).remaining,'2.000');

  const rolledBooking=randomUUID(),rolledKey=randomUUID();
  await assert.rejects(()=>runWithRuntimeTenant(h.tenant.id,()=>h.prisma.$transaction(async tx=>{
    // New resource avoids GiST overlap with the confirmed booking.
    const later=new Date('2026-11-03T12:00:00Z');
    const laterEnd=new Date('2026-11-03T12:30:00Z');
    await tx.schedulingBooking.create({data:{
      id:rolledBooking,tenantId:h.tenant.id,locationId:location.id,
      sourceType:'client',sourceId:client.id,idempotencyKey:rolledKey,
      startsAtUtc:later,endsAtUtc:laterEnd,createdBy:h.admin.id
    }});
    await tx.schedulingResourceAllocation.create({data:{
      id:randomUUID(),tenantId:h.tenant.id,locationId:location.id,
      bookingId:rolledBooking,resourceId:resource.id,stepId:'session',
      occupiedStartAt:later,occupiedEndAt:laterEnd
    }});
    await consumeCustomerRightInBookingTransaction(tx,actor,{
      entitlementId:grant.id,bookingId:rolledBooking,effectKey:'qa852:rollback:'+label,quantity:'1.000'
    });
    throw new Error('QA intentional rollback');
  })),/QA intentional rollback/);
  assert.equal(await h.prisma.schedulingBooking.findFirst({
    where:{id:rolledBooking,tenantId:h.tenant.id}}),null);
  assert.equal((await h.ok(`/customer-entitlements/clients/${client.id}`))
    .find((x:any)=>x.id===grant.id).remaining,'2.000');

  const foreignTenant=await h.prisma.tenant.create({data:{
    rif:'J-852-FOREIGN-'+label,name:'Tenant ajeno QA '+label
  }});
  const foreignClient=await h.prisma.client.create({data:{
    tenantId:foreignTenant.id,rif:'J-852-'+label,name:'Cliente tenant B QA'
  }});
  await h.status('/customer-entitlements/manual-grants',422,{
    method:'POST',body:JSON.stringify({...body,beneficiaryId:foreignClient.id,effectKey:'qa852:other:'+label})
  });
  const unauth=await h.request('/customer-entitlements/benefits',{},'');
  assert.equal(unauth.response.status,401);
});
