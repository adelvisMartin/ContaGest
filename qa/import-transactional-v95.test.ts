import test from 'node:test';
import assert from 'node:assert/strict';
import { createRealBackendHarness } from './support/real-backend-harness.ts';

const RUN=`QA95-${Date.now().toString(36).toUpperCase()}`;
const headers=(name:string)=>({'Idempotency-Key':`${RUN}-${name}-0123456789abcdef`,'x-request-id':`${RUN}-${name}`.slice(0,96)});

async function preview(h:any,type:string,rows:any[],duplicatePolicy='error',filename=`${RUN}.csv`){
  return h.ok('/imports/preview',{method:'POST',body:JSON.stringify({type,rows,duplicatePolicy,templateVersion:'v1',filename})});
}

test('issue #95 transactional import pipeline on real PostgreSQL',async(t)=>{
  const h=await createRealBackendHarness();
  const tenantB=await h.prisma.tenant.create({data:{rif:`${RUN}-TENANT-B`,name:`${RUN} Tenant B`,legalName:`${RUN} Tenant B`}});
  const clientRifs=[`${RUN}-CLI-1`,`${RUN}-CLI-2`,`${RUN}-ROLL-A`,`${RUN}-ROLL-B`,`${RUN}-DUP`];
  const supplierRifs=[`${RUN}-SUP-1`];const skus=[`${RUN}-SKU-1`];const accountCodes=[`${RUN}.100`,`${RUN}.110`];const employeeIds=[`${RUN}-EMP-1`];

  t.after(async()=>{
    await h.prisma.client.deleteMany({where:{tenantId:h.tenant.id,rif:{in:clientRifs}}}).catch(()=>undefined);
    await h.prisma.supplier.deleteMany({where:{tenantId:h.tenant.id,rif:{in:supplierRifs}}}).catch(()=>undefined);
    await h.prisma.product.deleteMany({where:{tenantId:h.tenant.id,sku:{in:skus}}}).catch(()=>undefined);
    await h.prisma.chartAccount.deleteMany({where:{tenantId:h.tenant.id,code:{in:accountCodes}}}).catch(()=>undefined);
    await h.prisma.employee.deleteMany({where:{tenantId:h.tenant.id,idNumber:{in:employeeIds}}}).catch(()=>undefined);
    await h.prisma.idempotencyRecord.deleteMany({where:{tenantId:h.tenant.id,scope:{startsWith:'imports.commit.'}}}).catch(()=>undefined);
    await h.prisma.auditLog.deleteMany({where:{tenantId:h.tenant.id,entity:'ImportBatch'}}).catch(()=>undefined);
    await h.prisma.importBatch.deleteMany({where:{OR:[{tenantId:h.tenant.id},{tenantId:tenantB.id}]}}).catch(()=>undefined);
    await h.prisma.tenant.delete({where:{id:tenantB.id}}).catch(()=>undefined);
    await h.close();
  });

  await t.test('dry-run persists only staging and does zero business writes',async()=>{
    const before=await h.prisma.client.count({where:{tenantId:h.tenant.id,rif:clientRifs[0]}});
    const batch=await preview(h,'clients',[{name:'Cliente QA',rif:clientRifs[0],email:'qa95@example.test'}]);
    assert.equal(batch.status,'validated');assert.equal(batch.accepted,1);assert.equal(batch.rejected,0);assert.match(batch.checksum,/^[a-f0-9]{64}$/);
    assert.equal(await h.prisma.client.count({where:{tenantId:h.tenant.id,rif:clientRifs[0]}}),before);
    assert.ok(batch.expiresAt);
  });

  await t.test('invalid row is rejected server-side and cannot commit',async()=>{
    const batch=await preview(h,'clients',[{name:'Sin RIF'}]);assert.equal(batch.status,'invalid');assert.equal(batch.rejected,1);assert.equal(batch.rows[0].action,'error');
    const denied=await h.status(`/imports/${batch.id}/commit`,409,{method:'POST',headers:headers('INVALID'),body:JSON.stringify({confirm:true,checksum:batch.checksum})});
    assert.equal(denied.payload?.details?.code,'IMPORT_BATCH_NOT_VALIDATED');
  });

  await t.test('client commit is atomic and retry returns the same completed batch',async()=>{
    const batch=await preview(h,'clients',[{name:'Cliente Uno',rif:clientRifs[1],phone:'04120000000'}]);
    const first=await h.ok(`/imports/${batch.id}/commit`,{method:'POST',headers:headers('CLIENT-COMMIT'),body:JSON.stringify({confirm:true,checksum:batch.checksum})});
    const second=await h.ok(`/imports/${batch.id}/commit`,{method:'POST',headers:headers('CLIENT-COMMIT'),body:JSON.stringify({confirm:true,checksum:batch.checksum})});
    assert.equal(first.id,second.id);assert.equal(first.status,'completed');assert.equal(first.counts.created,1);
    assert.equal(await h.prisma.client.count({where:{tenantId:h.tenant.id,rif:clientRifs[1]}}),1);
  });

  await t.test('duplicate policies update, skip and error are explicit',async()=>{
    await h.prisma.client.create({data:{tenantId:h.tenant.id,rif:clientRifs[4],name:'Original'}});
    const update=await preview(h,'clients',[{name:'Actualizado',rif:clientRifs[4]}],'update');assert.equal(update.rows[0].action,'update');
    await h.ok(`/imports/${update.id}/commit`,{method:'POST',headers:headers('DUP-UPD'),body:JSON.stringify({confirm:true,checksum:update.checksum})});
    assert.equal((await h.prisma.client.findUniqueOrThrow({where:{tenantId_rif:{tenantId:h.tenant.id,rif:clientRifs[4]}}})).name,'Actualizado');
    const skip=await preview(h,'clients',[{name:'No cambia',rif:clientRifs[4]}],'skip');assert.equal(skip.rows[0].action,'skip');
    const skipped=await h.ok(`/imports/${skip.id}/commit`,{method:'POST',headers:headers('DUP-SKIP'),body:JSON.stringify({confirm:true,checksum:skip.checksum})});assert.equal(skipped.counts.skipped,1);
    const error=await preview(h,'clients',[{name:'Error',rif:clientRifs[4]}],'error');assert.equal(error.status,'invalid');assert.equal(error.rows[0].errors[0].code,'IMPORT_DUPLICATE_EXISTS');
  });

  await t.test('all five adapters respect domain contracts',async()=>{
    const supplier=await preview(h,'suppliers',[{name:'Proveedor QA',rif:supplierRifs[0],category:'ordinary'}]);await h.ok(`/imports/${supplier.id}/commit`,{method:'POST',headers:headers('SUP'),body:JSON.stringify({confirm:true,checksum:supplier.checksum})});
    const product=await preview(h,'inventory',[{sku:skus[0],name:'Producto master',category:'QA',costUsd:'1.25',priceUsd:'2.50',min:'1.000'}]);await h.ok(`/imports/${product.id}/commit`,{method:'POST',headers:headers('PROD'),body:JSON.stringify({confirm:true,checksum:product.checksum})});
    const storedProduct=await h.prisma.product.findUniqueOrThrow({where:{tenantId_sku:{tenantId:h.tenant.id,sku:skus[0]}}});assert.equal(Number(storedProduct.stock),0);assert.equal(Number(storedProduct.reserved),0);
    const accounts=await preview(h,'accounts',[{code:accountCodes[0],name:'Padre QA',type:'asset',nature:'debit',level:1,allowPosting:false},{code:accountCodes[1],name:'Hija QA',type:'asset',nature:'debit',level:2,parentCode:accountCodes[0],allowPosting:true}]);await h.ok(`/imports/${accounts.id}/commit`,{method:'POST',headers:headers('ACC'),body:JSON.stringify({confirm:true,checksum:accounts.checksum})});
    const payroll=await preview(h,'payroll',[{employee:'Persona QA',idNumber:employeeIds[0],position:'Analista',department:'QA',salary:'125.50'}]);await h.ok(`/imports/${payroll.id}/commit`,{method:'POST',headers:headers('EMP'),body:JSON.stringify({confirm:true,checksum:payroll.checksum})});
    assert.equal(await h.prisma.supplier.count({where:{tenantId:h.tenant.id,rif:supplierRifs[0]}}),1);assert.equal(await h.prisma.chartAccount.count({where:{tenantId:h.tenant.id,code:{in:accountCodes}}}),2);assert.equal(await h.prisma.employee.count({where:{tenantId:h.tenant.id,idNumber:employeeIds[0]}}),1);
  });

  await t.test('inventory balances cannot bypass issue #94 through import',async()=>{
    const batch=await preview(h,'inventory',[{sku:`${RUN}-BYPASS`,name:'Bypass',stock:'99',reserved:'2'}]);assert.equal(batch.status,'invalid');assert.equal(batch.rows[0].errors[0].code,'INVENTORY_BALANCE_REQUIRES_MOVEMENT_WORKFLOW');
    assert.equal(await h.prisma.product.count({where:{tenantId:h.tenant.id,sku:`${RUN}-BYPASS`}}),0);
  });

  await t.test('commit rolls back all rows if a race introduces an intermediate failure',async()=>{
    const batch=await preview(h,'clients',[{name:'Rollback A',rif:clientRifs[2]},{name:'Rollback B',rif:clientRifs[3]}]);assert.equal(batch.status,'validated');
    await h.prisma.client.create({data:{tenantId:h.tenant.id,rif:clientRifs[3],name:'Inserted after dry-run'}});
    const result=await h.request(`/imports/${batch.id}/commit`,{method:'POST',headers:headers('ROLLBACK'),body:JSON.stringify({confirm:true,checksum:batch.checksum})});assert.ok(result.response.status>=400);
    assert.equal(await h.prisma.client.count({where:{tenantId:h.tenant.id,rif:clientRifs[2]}}),0,'First row survived a failed transactional commit');
    assert.equal(await h.prisma.client.count({where:{tenantId:h.tenant.id,rif:clientRifs[3]}}),1);
  });

  await t.test('tenant A cannot read, commit or report tenant B batch',async()=>{
    const foreign=await h.prisma.importBatch.create({data:{tenantId:tenantB.id,type:'clients',status:'validated',accepted:1,rejected:0,payload:{version:1,templateVersion:'v1',checksum:'a'.repeat(64),duplicatePolicy:'error',filename:'foreign.csv',createdBy:null,rows:[],counts:{total:1,valid:1,invalid:0,created:0,updated:0,skipped:0}}}});
    await h.status(`/imports/${foreign.id}`,404);
    await h.status(`/imports/${foreign.id}/report`,404);
    await h.status(`/imports/${foreign.id}/commit`,404,{method:'POST',headers:headers('CROSS'),body:JSON.stringify({confirm:true,checksum:'a'.repeat(64)})});
  });

  await t.test('report neutralizes spreadsheet formula injection',async()=>{
    const batch=await preview(h,'clients',[{name:'Formula safe',rif:'=CMD-QA95'}]);const report=await h.ok(`/imports/${batch.id}/report`);assert.ok(report.csv.includes("'=CMD-QA95"));
  });

  await t.test('audit trail records dry-run and successful commit without row PII',async()=>{
    const audits=await h.prisma.auditLog.findMany({where:{tenantId:h.tenant.id,entity:'ImportBatch',action:{in:['import.dry-run','import.commit']}}});assert.ok(audits.length>=2);for(const audit of audits){const text=JSON.stringify(audit.after||{});assert.equal(text.includes('Persona QA'),false);assert.equal(text.includes('04120000000'),false);}
  });
});