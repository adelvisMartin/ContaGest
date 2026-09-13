import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../backend/src/database/prisma.js';
import {
  importBankStatement,
  listStatementLines,
  reconcileStatementLine
} from '../backend/src/modules/bank-reconciliation/bank-reconciliation.service.js';

const csv=(header:string,rows:string[])=>Buffer.from([header,...rows].join('\n'),'utf8');
const key=(label:string)=>`qa-237-hardening-${label}-${randomUUID()}`;
after(async()=>{await prisma.$disconnect();});

async function fixture(label:string){
  const suffix=randomUUID().slice(0,8);
  const tenant=await prisma.tenant.create({data:{rif:`QA-237-H-${label}-${suffix}`,name:`QA 237 hardening ${label}`}});
  const user=await prisma.userProfile.create({data:{tenantId:tenant.id,email:`qa-237-h-${suffix}@example.test`,fullName:`QA ${label}`}});
  const account=await prisma.bankAccount.create({data:{tenantId:tenant.id,bankName:'Banco QA',accountNo:`H-${label}-${suffix}`,currency:'VES',balance:'0'}});
  return {tenant,user,account};
}

test('v237 concurrent duplicate import replays cleanly instead of surfacing unique violations',async(t)=>{
  const fx=await fixture('IMPORT');
  t.after(async()=>{await prisma.tenant.delete({where:{id:fx.tenant.id}});});
  const bytes=csv('date,amount,currency,reference,memo,counterparty',['2026-09-12,10.00,VES,CONCURRENT-IMPORT,Pago,Cliente']);
  const attempts=await Promise.allSettled([
    importBankStatement({tenantId:fx.tenant.id,userId:fx.user.id,accountId:fx.account.id,fileName:'same-a.csv',bytes}),
    importBankStatement({tenantId:fx.tenant.id,userId:fx.user.id,accountId:fx.account.id,fileName:'same-b.csv',bytes})
  ]);
  assert.equal(attempts.filter((item)=>item.status==='fulfilled').length,2);
  const values=attempts.filter((item):item is PromiseFulfilledResult<any>=>item.status==='fulfilled').map((item)=>item.value);
  assert.equal(values.filter((value)=>value.duplicate===false).length,1);
  assert.equal(values.filter((value)=>value.duplicate===true).length,1);
  const imports=await prisma.$queryRaw<Array<{count:bigint}>>(Prisma.sql`SELECT COUNT(*)::bigint AS count FROM "BankStatementImport" WHERE "tenantId"=${fx.tenant.id} AND "accountId"=${fx.account.id}`);
  const lines=await prisma.$queryRaw<Array<{count:bigint}>>(Prisma.sql`SELECT COUNT(*)::bigint AS count FROM "BankStatementLine" WHERE "tenantId"=${fx.tenant.id} AND "accountId"=${fx.account.id}`);
  assert.equal(Number(imports[0].count),1);
  assert.equal(Number(lines[0].count),1);
});

test('v237 bankLineId/FITID deduplicates the same bank transaction even if non-key memo changes',async(t)=>{
  const fx=await fixture('BANK-ID');
  t.after(async()=>{await prisma.tenant.delete({where:{id:fx.tenant.id}});});
  const header='date,amount,currency,id,reference,memo,counterparty';
  const first=await importBankStatement({tenantId:fx.tenant.id,userId:fx.user.id,accountId:fx.account.id,fileName:'id-a.csv',bytes:csv(header,['2026-09-12,25.00,VES,FIT-237,REF-237,Memo inicial,Cliente'])});
  const second=await importBankStatement({tenantId:fx.tenant.id,userId:fx.user.id,accountId:fx.account.id,fileName:'id-b.csv',bytes:csv(header,['2026-09-12,25.00,VES,FIT-237,REF-237,Memo actualizado por banco,Cliente'])});
  assert.equal(first.inserted,1);
  assert.equal(second.duplicate,false,'different source bytes remain separate import provenance');
  assert.equal(second.inserted,0,'same bankLineId must not create a second normalized bank transaction');
  assert.equal(second.deduplicated,1);
  const lines=await listStatementLines(fx.tenant.id,{accountId:fx.account.id,status:'all'});
  assert.equal(lines.filter((line:any)=>line.bankLineId==='FIT-237').length,1);
});

test('v237 rejects reusing an Idempotency-Key with a different reconciliation intent',async(t)=>{
  const fx=await fixture('IDEM');
  t.after(async()=>{await prisma.tenant.delete({where:{id:fx.tenant.id}});});
  const target=await prisma.bankMovement.create({data:{tenantId:fx.tenant.id,accountId:fx.account.id,date:new Date('2026-09-12T00:00:00Z'),description:'Objetivo idempotente',reference:'IDEM-TARGET',credit:'50.00',debit:'0'}});
  await importBankStatement({tenantId:fx.tenant.id,userId:fx.user.id,accountId:fx.account.id,fileName:'idem.csv',bytes:csv('date,amount,currency,reference,memo,counterparty',['2026-09-12,50.00,VES,IDEM-LINE,Pago,Cliente'])});
  const [line]=await listStatementLines(fx.tenant.id,{accountId:fx.account.id,status:'all'});
  const idemKey=key('reuse');
  await reconcileStatementLine({tenantId:fx.tenant.id,userId:fx.user.id,lineId:line.id,idempotencyKey:idemKey,allocations:[{targetType:'bank_movement',targetId:target.id,amount:'25.00'}],reasons:['first_intent']});
  await assert.rejects(
    ()=>reconcileStatementLine({tenantId:fx.tenant.id,userId:fx.user.id,lineId:line.id,idempotencyKey:idemKey,allocations:[{targetType:'bank_movement',targetId:target.id,amount:'26.00'}],reasons:['changed_intent']}),
    (error:any)=>error?.status===409&&error?.details?.code==='IDEMPOTENCY_KEY_REUSED'
  );
});

test('v237 serializes different statement lines competing for the same target',async(t)=>{
  const fx=await fixture('TARGET-RACE');
  t.after(async()=>{await prisma.tenant.delete({where:{id:fx.tenant.id}});});
  const target=await prisma.bankMovement.create({data:{tenantId:fx.tenant.id,accountId:fx.account.id,date:new Date('2026-09-12T00:00:00Z'),description:'Objetivo único',reference:'ONE-TARGET',credit:'80.00',debit:'0'}});
  await importBankStatement({tenantId:fx.tenant.id,userId:fx.user.id,accountId:fx.account.id,fileName:'race.csv',bytes:csv('date,amount,currency,reference,memo,counterparty',[
    '2026-09-12,80.00,VES,RACE-A,Pago A,Cliente',
    '2026-09-12,80.00,VES,RACE-B,Pago B,Cliente'
  ])});
  const lines=await listStatementLines(fx.tenant.id,{accountId:fx.account.id,status:'all'});
  const a=lines.find((line:any)=>line.reference==='RACE-A');
  const b=lines.find((line:any)=>line.reference==='RACE-B');
  assert.ok(a&&b);
  const attempts=await Promise.allSettled([
    reconcileStatementLine({tenantId:fx.tenant.id,userId:fx.user.id,lineId:a.id,idempotencyKey:key('race-a'),allocations:[{targetType:'bank_movement',targetId:target.id,amount:'80.00'}]}),
    reconcileStatementLine({tenantId:fx.tenant.id,userId:fx.user.id,lineId:b.id,idempotencyKey:key('race-b'),allocations:[{targetType:'bank_movement',targetId:target.id,amount:'80.00'}]})
  ]);
  assert.equal(attempts.filter((item)=>item.status==='fulfilled').length,1);
  assert.equal(attempts.filter((item)=>item.status==='rejected').length,1);
  const allocated=await prisma.$queryRaw<Array<{total:Prisma.Decimal|null}>>(Prisma.sql`
    SELECT COALESCE(SUM(a."amount"),0)::numeric(18,2) AS total
    FROM "BankReconciliationAllocation" a
    JOIN "BankReconciliation" r ON r."id"=a."reconciliationId" AND r."tenantId"=a."tenantId"
    WHERE a."tenantId"=${fx.tenant.id} AND a."targetType"='bank_movement' AND a."targetId"=${target.id} AND r."status"='confirmed'
  `);
  assert.equal(allocated[0].total?.toFixed(2),'80.00');
});

test('v237 tenant tables are FORCE RLS with tenant-scoped policies',async()=>{
  const tables=['BankStatementImport','BankStatementLine','BankReconciliation','BankReconciliationAllocation','BankReconciliationModel','BankReconciliationEvent'];
  const flags=await prisma.$queryRaw<Array<{relname:string;relrowsecurity:boolean;relforcerowsecurity:boolean}>>(Prisma.sql`
    SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname IN (${Prisma.join(tables)})
  `);
  assert.equal(flags.length,tables.length);
  for(const row of flags){assert.equal(row.relrowsecurity,true,`${row.relname} must enable RLS`);assert.equal(row.relforcerowsecurity,true,`${row.relname} must FORCE RLS`);}
  const policies=await prisma.$queryRaw<Array<{tablename:string;policyname:string;qual:string|null;with_check:string|null}>>(Prisma.sql`
    SELECT tablename,policyname,qual,with_check FROM pg_policies
    WHERE schemaname='public' AND tablename IN (${Prisma.join(tables)}) AND policyname LIKE 'tenant_isolation_bank_%'
  `);
  assert.equal(new Set(policies.map((row)=>row.tablename)).size,tables.length);
  for(const policy of policies){assert.match(policy.qual||'',/private\.current_tenant_id\(\)/);assert.match(policy.with_check||'',/private\.current_tenant_id\(\)/);}
});
