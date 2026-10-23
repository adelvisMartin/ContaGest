import test from 'node:test';
import assert from 'node:assert/strict';
import { randomInt } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { runWithRuntimeTenant } from '../backend/src/database/runtime-tenant-context.ts';
import { prisma } from '../backend/src/database/prisma.ts';
import { assertPeriodOpen, closeAccountingPeriod, createAccountingPeriod } from '../backend/src/modules/accounting/accounting.service.ts';

/**
 * Isolated PostgreSQL 17 check. Do not run against staging/production data.
 * This exercises real transaction-level lock contention with separate Prisma
 * connections, not mocks or a static source-text assertion.
 *
 * Use:
 * CG_ACCOUNTING_PERIOD_QA_ISOLATED=true npm run test:backend:accounting:period:real
 */
test('#637 two concurrent PG connections serialize posting guard and period close', async () => {
  assert.equal(process.env.CG_ACCOUNTING_PERIOD_QA_ISOLATED,'true',
    'BLOCKED: isolated disposable PostgreSQL must be explicitly authorized');
  assert.notEqual(process.env.NODE_ENV,'production','BLOCKED: production tests forbidden');
  assert.ok(!process.env.VERCEL && !process.env.VERCEL_ENV,'BLOCKED: deployed tests forbidden');
  const database=await prisma.$queryRaw<Array<{name:string}>>`SELECT current_database() AS name`;
  assert.match(database[0]?.name || '',/_v637$/,
    'BLOCKED: database name must end with _v637 and be disposable');
  const tenant=await prisma.tenant.findUnique({where:{rif:'00000000'}});
  assert.ok(tenant,'disposable QA tenant not found');
  const actor=await prisma.userProfile.findFirst({
    where:{tenantId:tenant.id,email:'admin@erp.local',status:'active'},
    select:{id:true}
  });
  assert.ok(actor,'disposable QA actor not found');

  const version=await prisma.$queryRaw<Array<{major:number}>>`SELECT current_setting('server_version_num')::integer/10000 AS major`;
  assert.equal(version[0]?.major,17,'this QA evidence requires PostgreSQL 17');

  // The runtime tenant ALS context enforces the same RLS boundary as API routes.
  await runWithRuntimeTenant(tenant.id,async()=>{
  // Random high year avoids colliding with any existing accounting book.
  const period=`${randomInt(3000,9000)}-${String(randomInt(1,13)).padStart(2,'0')}`;
  const created=await createAccountingPeriod({
    tenantId:tenant.id,period,actorId:actor.id,note:'QA isolated advisory mutex'
  });
  assert.equal(created.status,'open');
  let enter!:()=>void,release!:()=>void;
  const entered=new Promise<void>(resolve=>{enter=resolve;});
  const gate=new Promise<void>(resolve=>{release=resolve;});
  let committed=false;
  const writer=prisma.$transaction(async tx=>{
    await assertPeriodOpen(tenant.id,period,tx);
    enter();
    await gate;
    // A writer may mutate only while its transaction still holds this lock.
    committed=true;
  },{timeout:15000});

  // Dedicated Prisma pool guarantees the probe cannot reuse the writer's
  // pinned SQL session or wait behind a single-connection pool.
  const probeClient=new PrismaClient();
  try{
    await Promise.race([
      entered,
      writer.then(()=>{throw new Error('writer ended before lock probe');},
        error=>{throw error;})
    ]);
    const lockKey=`cg:ledger-period:v1:${tenant.id}:${period}`;
    const probe=await probeClient.$queryRaw<Array<{acquired:boolean}>>`
      SELECT pg_try_advisory_xact_lock(hashtextextended(${lockKey},0)) AS acquired
    `;
    assert.equal(probe[0]?.acquired,false,
      'the second connection acquired a period already guarded by the posting writer');
  }finally{
    release();
    try { await writer; }
    finally { await probeClient.$disconnect(); }
  }
  assert.equal(committed,true);
  const closed=await closeAccountingPeriod({tenantId:tenant.id,periodId:created.id,actorId:actor.id});
  assert.equal(closed.status,'closed');
  await assert.rejects(async()=>prisma.$transaction(tx=>assertPeriodOpen(tenant.id,period,tx)),
    (e:unknown)=>typeof e==='object'&&e!==null&&'status' in e&&e.status===409);

  // Records are intentionally kept for audit on a disposable QA DB. Never
  // execute this test against a shared or production connection.
  });
});
