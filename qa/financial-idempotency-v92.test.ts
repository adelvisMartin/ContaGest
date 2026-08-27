import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRealBackendHarness } from './support/real-backend-harness.ts';
import { hashIdempotencyKey, runFinancialIdempotentMutation } from '../backend/src/shared/services/financial-idempotency.service.ts';

const RUN=`QA92-${Date.now().toString(36).toUpperCase()}`;
const OPEN_PERIOD='2096-09';
const key=(name:string)=>`${RUN}-${name}-0123456789`;
const headers=(name:string,requestSuffix=name)=>({
  'Idempotency-Key':key(name),
  'x-request-id':`${RUN}-${requestSuffix}`.slice(0,96)
});
const num=(value:any)=>Number(value||0);

async function concurrent(h:any,path:string,count:number,options:RequestInit){
  const results=await Promise.all(Array.from({length:count},()=>h.request(path,options)));
  for(const result of results){
    assert.equal(result.response.status,200,`${path} -> ${result.response.status}: ${JSON.stringify(result.payload)}`);
    assert.notEqual(result.payload?.ok,false,`${path} returned ok=false`);
  }
  return results;
}

test('issue #92 financial idempotency is transactional on real PostgreSQL',async(t)=>{
  const h=await createRealBackendHarness();
  const tenantB=await h.prisma.tenant.create({data:{rif:`${RUN}-RIF-B`,name:`${RUN} Tenant B`,legalName:`${RUN} Tenant B`}});
  const moduleRecordIds:string[]=[];
  const bankAccountIds:string[]=[];
  const auditEntityIds:string[]=[];

  t.after(async()=>{
    await h.prisma.idempotencyRecord.deleteMany({where:{OR:[{tenantId:h.tenant.id,requestId:{startsWith:RUN}},{tenantId:tenantB.id}]}}).catch(()=>undefined);
    await h.prisma.auditLog.deleteMany({where:{tenantId:h.tenant.id,OR:[{entityId:{in:auditEntityIds}},{after:{path:['requestId'],string_starts_with:RUN} as any}]}}).catch(()=>undefined);
    await h.prisma.ledgerEntry.deleteMany({where:{tenantId:h.tenant.id,OR:[{sourceId:{startsWith:RUN}},{description:{contains:RUN}}]}}).catch(()=>undefined);
    await h.prisma.salesInvoice.deleteMany({where:{tenantId:h.tenant.id,number:{startsWith:RUN}}}).catch(()=>undefined);
    await h.prisma.purchaseInvoice.deleteMany({where:{tenantId:h.tenant.id,number:{startsWith:RUN}}}).catch(()=>undefined);
    await h.prisma.bankMovement.deleteMany({where:{tenantId:h.tenant.id,description:{startsWith:RUN}}}).catch(()=>undefined);
    await h.prisma.bankAccount.deleteMany({where:{id:{in:bankAccountIds}}}).catch(()=>undefined);
    await h.prisma.moduleRecord.deleteMany({where:{id:{in:moduleRecordIds}}}).catch(()=>undefined);
    await h.prisma.tenant.delete({where:{id:tenantB.id}}).catch(()=>undefined);
    await h.close();
  });

  await t.test('20 concurrent sale retries create one invoice and one ledger effect',async()=>{
    const number=`${RUN}-SALE-20`;
    const body={number,fiscalPeriod:OPEN_PERIOD,status:'issued',currency:'VES',lines:[{description:`${RUN} sale`,quantity:2,unitPrice:25,taxRate:16}]};
    const results=await concurrent(h,'/sales',20,{method:'POST',headers:headers('SALE20'),body:JSON.stringify(body)});
    const ids=new Set(results.map((result:any)=>result.data.id));
    assert.equal(ids.size,1,'Concurrent sale retries returned different invoices');
    const saleId=[...ids][0] as string;auditEntityIds.push(saleId);
    assert.equal(await h.prisma.salesInvoice.count({where:{tenantId:h.tenant.id,number}}),1);
    assert.equal(await h.prisma.ledgerEntry.count({where:{tenantId:h.tenant.id,source:'sales',sourceId:saleId}}),1);
    const record=await h.prisma.idempotencyRecord.findUnique({where:{tenantId_scope_keyHash:{tenantId:h.tenant.id,scope:'sales.create',keyHash:hashIdempotencyKey(key('SALE20'))}}});
    assert.equal(record?.status,'succeeded');
    assert.equal(record?.resourceId,saleId);
    assert.equal(record?.responsePayload,null,'Financial route persisted a response snapshot instead of reconstructing it');
    assert.ok(num(record?.hitCount)>=19,`Expected at least 19 replay hits, got ${record?.hitCount}`);
    assert.equal(record?.expiresAt,null);
  });

  await t.test('20 concurrent retries cancel one sale with one reversal',async()=>{
    const number=`${RUN}-SALE-CANCEL`;
    const sale=await h.ok('/sales',{method:'POST',headers:headers('SALE-CANCEL-CREATE'),body:JSON.stringify({number,fiscalPeriod:OPEN_PERIOD,status:'issued',currency:'VES',lines:[{description:`${RUN} sale cancel`,quantity:1,unitPrice:40,taxRate:16}]})});
    auditEntityIds.push(sale.id);
    const results=await concurrent(h,`/sales/${sale.id}/cancel`,20,{method:'PATCH',headers:headers('SALE-CANCEL'),body:JSON.stringify({reason:'QA concurrent cancellation'})});
    const reversalIds=new Set(results.map((result:any)=>result.data.reversalId).filter(Boolean));
    assert.equal(reversalIds.size,1,'Concurrent sale cancellation returned multiple reversals');
    assert.equal(await h.prisma.ledgerEntry.count({where:{tenantId:h.tenant.id,source:'manual',sourceId:`sales-cancel:${sale.id}`}}),1,'Concurrent sale cancellation created duplicate reversals');
    const stored=await h.prisma.salesInvoice.findUnique({where:{id:sale.id}});
    assert.equal(stored?.status,'cancelled');
  });

  await t.test('5 concurrent purchase retries create one invoice and one ledger effect',async()=>{
    const number=`${RUN}-PURCHASE-5`;
    const body={number,fiscalPeriod:OPEN_PERIOD,status:'issued',lines:[{description:`${RUN} purchase`,quantity:3,unitCost:20,taxRate:16}]};
    const results=await concurrent(h,'/purchases',5,{method:'POST',headers:headers('PURCHASE5'),body:JSON.stringify(body)});
    const ids=new Set(results.map((result:any)=>result.data.id));
    assert.equal(ids.size,1);
    const purchaseId=[...ids][0] as string;auditEntityIds.push(purchaseId);
    assert.equal(await h.prisma.purchaseInvoice.count({where:{tenantId:h.tenant.id,number}}),1);
    assert.equal(await h.prisma.ledgerEntry.count({where:{tenantId:h.tenant.id,source:'purchase',sourceId:purchaseId}}),1);
  });

  await t.test('different keys cannot race a purchase cancellation into duplicate reversals',async()=>{
    const number=`${RUN}-PURCHASE-CANCEL`;
    const purchase=await h.ok('/purchases',{method:'POST',headers:headers('PURCHASE-CANCEL-CREATE'),body:JSON.stringify({number,fiscalPeriod:OPEN_PERIOD,status:'issued',lines:[{description:`${RUN} purchase cancel`,quantity:1,unitCost:30,taxRate:16}]})});
    auditEntityIds.push(purchase.id);
    const path=`/purchases/${purchase.id}/cancel`;
    const body=JSON.stringify({reason:'QA serialized cancellation'});
    const results=await Promise.all(Array.from({length:5},(_,index)=>h.request(path,{method:'PATCH',headers:headers(`PURCHASE-CANCEL-${index}`),body})));
    for(const result of results)assert.equal(result.response.status,200,`${path} -> ${result.response.status}: ${JSON.stringify(result.payload)}`);
    assert.equal(await h.prisma.ledgerEntry.count({where:{tenantId:h.tenant.id,source:'manual',sourceId:`purchase-cancel:${purchase.id}`}}),1,'Distinct idempotency keys raced into duplicate purchase reversals');
    const stored=await h.prisma.purchaseInvoice.findUnique({where:{id:purchase.id}});
    assert.equal(stored?.status,'cancelled');
  });

  await t.test('20 concurrent bank retries move the balance once',async()=>{
    const account=await h.ok('/bank-accounts',{method:'POST',body:JSON.stringify({bankName:`${RUN} Bank`,accountNo:`${RUN}-BANK-20`,currency:'USD',balance:100})});
    bankAccountIds.push(account.id);auditEntityIds.push(account.id);
    const body={accountId:account.id,description:`${RUN} bank 20`,reference:RUN,type:'income',currency:'USD',amount:35.5};
    const results=await concurrent(h,'/banking/movements',20,{method:'POST',headers:headers('BANK20'),body:JSON.stringify(body)});
    const ids=new Set(results.map((result:any)=>result.data.id));
    assert.equal(ids.size,1);auditEntityIds.push([...ids][0] as string);
    assert.equal(await h.prisma.bankMovement.count({where:{tenantId:h.tenant.id,accountId:account.id,description:body.description}}),1);
    const stored=await h.prisma.bankAccount.findUnique({where:{id:account.id}});
    assert.equal(num(stored?.balance),135.5,'Concurrent retry changed bank balance more than once');
  });

  await t.test('2 concurrent accounting retries create one balanced entry',async()=>{
    const body={fiscalPeriod:OPEN_PERIOD,description:`${RUN} manual ledger`,source:'manual',lines:[{accountCode:`${RUN}.D`,accountName:'QA debit',debit:10,credit:0},{accountCode:`${RUN}.C`,accountName:'QA credit',debit:0,credit:10}]};
    const results=await concurrent(h,'/accounting/entries',2,{method:'POST',headers:headers('LEDGER2'),body:JSON.stringify(body)});
    const ids=new Set(results.map((result:any)=>result.data.id));
    assert.equal(ids.size,1);auditEntityIds.push([...ids][0] as string);
    assert.equal(await h.prisma.ledgerEntry.count({where:{tenantId:h.tenant.id,description:body.description}}),1);
  });

  await t.test('same key with a different validated payload returns typed 409',async()=>{
    const account=await h.ok('/bank-accounts',{method:'POST',body:JSON.stringify({bankName:`${RUN} Conflict Bank`,accountNo:`${RUN}-BANK-CONFLICT`,currency:'USD',balance:0})});
    bankAccountIds.push(account.id);auditEntityIds.push(account.id);
    const first={accountId:account.id,description:`${RUN} conflict`,type:'income',currency:'USD',amount:10};
    const created=await h.ok('/banking/movements',{method:'POST',headers:headers('CONFLICT','CONFLICT-A'),body:JSON.stringify(first)});auditEntityIds.push(created.id);
    const second=await h.status('/banking/movements',409,{method:'POST',headers:headers('CONFLICT','CONFLICT-B'),body:JSON.stringify({...first,amount:11})});
    assert.equal(second.payload?.details?.code,'IDEMPOTENCY_KEY_REUSED');
    const stored=await h.prisma.bankAccount.findUnique({where:{id:account.id}});
    assert.equal(num(stored?.balance),10,'Conflicting payload produced a second bank effect');
  });

  await t.test('failed effect rolls back the reservation and the exact request can succeed later',async()=>{
    const accountId=randomUUID();
    const body={accountId,description:`${RUN} rollback`,type:'income',currency:'USD',amount:7};
    await h.status('/banking/movements',404,{method:'POST',headers:headers('ROLLBACK','ROLLBACK-A'),body:JSON.stringify(body)});
    assert.equal(await h.prisma.idempotencyRecord.count({where:{tenantId:h.tenant.id,scope:'banking.movements.create',keyHash:hashIdempotencyKey(key('ROLLBACK'))}}),0,'Failed transaction left a reservation behind');
    await h.prisma.bankAccount.create({data:{id:accountId,tenantId:h.tenant.id,bankName:`${RUN} Later Bank`,accountNo:`${RUN}-BANK-LATER`,currency:'USD',balance:0}});
    bankAccountIds.push(accountId);auditEntityIds.push(accountId);
    const retry=await h.ok('/banking/movements',{method:'POST',headers:headers('ROLLBACK','ROLLBACK-B'),body:JSON.stringify(body)});auditEntityIds.push(retry.id);
    assert.equal(retry.id!==undefined,true);
    const stored=await h.prisma.bankAccount.findUnique({where:{id:accountId}});
    assert.equal(num(stored?.balance),7);
  });

  await t.test('a committed result is replayable after the caller loses/ignores the first response',async()=>{
    const account=await h.ok('/bank-accounts',{method:'POST',body:JSON.stringify({bankName:`${RUN} Replay Bank`,accountNo:`${RUN}-BANK-REPLAY`,currency:'USD',balance:50})});
    bankAccountIds.push(account.id);auditEntityIds.push(account.id);
    const body={accountId:account.id,description:`${RUN} replay`,type:'expense',currency:'USD',amount:8};
    const first=await h.request('/banking/movements',{method:'POST',headers:headers('REPLAY','REPLAY-A'),body:JSON.stringify(body)});
    assert.equal(first.response.status,200);auditEntityIds.push(first.data.id);
    const second=await h.request('/banking/movements',{method:'POST',headers:headers('REPLAY','REPLAY-B'),body:JSON.stringify(body)});
    assert.equal(second.response.status,200);
    assert.equal(first.data.id,second.data.id);
    assert.equal(second.response.headers.get('idempotency-replayed'),'true');
    const stored=await h.prisma.bankAccount.findUnique({where:{id:account.id}});
    assert.equal(num(stored?.balance),42);
  });

  await t.test('same opaque key is independent across tenants',async()=>{
    const sharedKey=key('TENANTS');
    const payload={marker:RUN,amount:1};
    const a=await runFinancialIdempotentMutation({tenantId:h.tenant.id,scope:'qa92.tenant-isolation',key:sharedKey,request:payload,requestId:`${RUN}-TENANT-A`},async(tx)=>{
      const row=await tx.moduleRecord.create({data:{tenantId:h.tenant.id,moduleSlug:'qa92',title:`${RUN}-A`,status:'test',payload}});moduleRecordIds.push(row.id);return{data:{id:row.id},resourceType:'ModuleRecord',resourceId:row.id};
    });
    const b=await runFinancialIdempotentMutation({tenantId:tenantB.id,scope:'qa92.tenant-isolation',key:sharedKey,request:payload,requestId:`${RUN}-TENANT-B`},async(tx)=>{
      const row=await tx.moduleRecord.create({data:{tenantId:tenantB.id,moduleSlug:'qa92',title:`${RUN}-B`,status:'test',payload}});moduleRecordIds.push(row.id);return{data:{id:row.id},resourceType:'ModuleRecord',resourceId:row.id};
    });
    assert.notEqual(a.data.id,b.data.id);
    assert.equal(await h.prisma.idempotencyRecord.count({where:{scope:'qa92.tenant-isolation',keyHash:hashIdempotencyKey(sharedKey),tenantId:{in:[h.tenant.id,tenantB.id]}}}),2);
  });

  await t.test('same key is independent across operation scopes in one tenant',async()=>{
    const sharedKey=key('SCOPES');
    const a=await runFinancialIdempotentMutation({tenantId:h.tenant.id,scope:'qa92.scope-a',key:sharedKey,request:{value:'a'},requestId:`${RUN}-SCOPE-A`},async(tx)=>{
      const row=await tx.moduleRecord.create({data:{tenantId:h.tenant.id,moduleSlug:'qa92',title:`${RUN}-SCOPE-A`,status:'test',payload:{value:'a'}}});moduleRecordIds.push(row.id);return{data:{id:row.id},resourceType:'ModuleRecord',resourceId:row.id};
    });
    const b=await runFinancialIdempotentMutation({tenantId:h.tenant.id,scope:'qa92.scope-b',key:sharedKey,request:{value:'b'},requestId:`${RUN}-SCOPE-B`},async(tx)=>{
      const row=await tx.moduleRecord.create({data:{tenantId:h.tenant.id,moduleSlug:'qa92',title:`${RUN}-SCOPE-B`,status:'test',payload:{value:'b'}}});moduleRecordIds.push(row.id);return{data:{id:row.id},resourceType:'ModuleRecord',resourceId:row.id};
    });
    assert.notEqual(a.data.id,b.data.id);
    assert.equal(await h.prisma.idempotencyRecord.count({where:{tenantId:h.tenant.id,keyHash:hashIdempotencyKey(sharedKey),scope:{in:['qa92.scope-a','qa92.scope-b']}}}),2);
  });

  await t.test('malformed key is rejected without executing the effect',async()=>{
    const account=await h.ok('/bank-accounts',{method:'POST',body:JSON.stringify({bankName:`${RUN} Invalid Key Bank`,accountNo:`${RUN}-BANK-INVALID`,currency:'USD',balance:0})});
    bankAccountIds.push(account.id);auditEntityIds.push(account.id);
    const body={accountId:account.id,description:`${RUN} invalid key`,type:'income',currency:'USD',amount:5};
    const result=await h.status('/banking/movements',400,{method:'POST',headers:{'Idempotency-Key':'short','x-request-id':`${RUN}-INVALID`},body:JSON.stringify(body)});
    assert.equal(result.payload?.details?.code,'IDEMPOTENCY_KEY_INVALID');
    assert.equal(await h.prisma.bankMovement.count({where:{tenantId:h.tenant.id,accountId:account.id,description:body.description}}),0);
  });
});
