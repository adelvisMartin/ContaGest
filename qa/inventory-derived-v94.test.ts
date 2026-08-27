import test from 'node:test';
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { createRealBackendHarness } from './support/real-backend-harness.ts';

const RUN=`QA94-${Date.now().toString(36).toUpperCase()}`;
const key=(name:string)=>`${RUN}-${name}-0123456789abcdef`;
const headers=(name:string)=>({ 'Idempotency-Key':key(name), 'x-request-id':`${RUN}-${name}`.slice(0,96) });
const n=(value:any)=>Number(value||0);

test('issue #94 inventory stock and reservations are derived from auditable movements',async(t)=>{
  const h=await createRealBackendHarness();
  const tenantB=await h.prisma.tenant.create({data:{rif:`${RUN}-B`,name:`${RUN} Tenant B`,legalName:`${RUN} Tenant B`}});
  const productIds:string[]=[];

  t.after(async()=>{
    if(productIds.length){
      await h.prisma.$executeRaw(Prisma.sql`DELETE FROM "InventoryMovementAuditLink" WHERE "productId" IN (${Prisma.join(productIds)})`).catch(()=>undefined);
      await h.prisma.inventoryMovement.deleteMany({where:{productId:{in:productIds}}}).catch(()=>undefined);
      await h.prisma.product.deleteMany({where:{id:{in:productIds}}}).catch(()=>undefined);
    }
    await h.prisma.idempotencyRecord.deleteMany({where:{OR:[{tenantId:h.tenant.id,scope:{startsWith:'inventory.'}},{tenantId:tenantB.id,scope:{startsWith:'inventory.'}}]}}).catch(()=>undefined);
    await h.prisma.auditLog.deleteMany({where:{tenantId:h.tenant.id,entity:'InventoryMovement'}}).catch(()=>undefined);
    await h.prisma.tenant.delete({where:{id:tenantB.id}}).catch(()=>undefined);
    await h.close();
  });

  await t.test('product CRUD rejects stock and reserved as client-controlled fields',async()=>{
    await h.status('/products',422,{method:'POST',body:JSON.stringify({sku:`${RUN}-BAD`,name:'Bad direct stock',stock:99,reserved:1})});
    const product=await h.ok('/products',{method:'POST',body:JSON.stringify({sku:`${RUN}-MASTER`,name:'Master only',cost:'2.00',price:'3.00',minStock:'1.000'})});
    productIds.push(product.id);
    assert.equal(n(product.stock),0);
    assert.equal(n(product.reserved),0);
    await h.status(`/products/${product.id}`,422,{method:'PUT',body:JSON.stringify({stock:25})});
  });

  await t.test('opening movement is idempotent and creates the only opening baseline',async()=>{
    const product=await h.ok('/products',{method:'POST',body:JSON.stringify({sku:`${RUN}-OPEN`,name:'Opening product'})});
    productIds.push(product.id);
    const body={productId:product.id,type:'in',quantity:'10.000',source:'opening',reasonCode:'MIGRATION_OPENING',note:'Saldo inicial verificado'};
    const a=await h.ok('/inventory/movements',{method:'POST',headers:headers('OPEN'),body:JSON.stringify(body)});
    const b=await h.ok('/inventory/movements',{method:'POST',headers:headers('OPEN'),body:JSON.stringify(body)});
    assert.equal(a.movement.id,b.movement.id);
    assert.equal(await h.prisma.inventoryMovement.count({where:{tenantId:h.tenant.id,productId:product.id}}),1);
    const stored=await h.prisma.product.findUniqueOrThrow({where:{id:product.id}});
    assert.equal(n(stored.stock),10);
    const second={...body,quantity:'1.000'};
    await h.status('/inventory/movements',409,{method:'POST',headers:headers('OPEN-SECOND'),body:JSON.stringify(second)});
  });

  await t.test('entry, reservation, release and out enforce available stock',async()=>{
    const product=await h.ok('/products',{method:'POST',body:JSON.stringify({sku:`${RUN}-FLOW`,name:'Flow product'})});productIds.push(product.id);
    await h.ok('/inventory/movements',{method:'POST',headers:headers('FLOW-IN'),body:JSON.stringify({productId:product.id,type:'in',quantity:'15.000',source:'opening',note:'Opening'})});
    await h.ok('/inventory/movements',{method:'POST',headers:headers('FLOW-RES'),body:JSON.stringify({productId:product.id,type:'reservation',quantity:'8.000',source:'order',sourceId:`${RUN}-ORDER`})});
    await h.status('/inventory/movements',409,{method:'POST',headers:headers('FLOW-OUT-BAD'),body:JSON.stringify({productId:product.id,type:'out',quantity:'8.000'})});
    await h.ok('/inventory/movements',{method:'POST',headers:headers('FLOW-REL'),body:JSON.stringify({productId:product.id,type:'release',quantity:'3.000'})});
    await h.ok('/inventory/movements',{method:'POST',headers:headers('FLOW-OUT'),body:JSON.stringify({productId:product.id,type:'out',quantity:'8.000'})});
    const stored=await h.prisma.product.findUniqueOrThrow({where:{id:product.id}});
    assert.equal(n(stored.stock),7);
    assert.equal(n(stored.reserved),5);
  });

  await t.test('authorized adjustment stores reason and exact delta, then integrity reconciles',async()=>{
    const product=await h.ok('/products',{method:'POST',body:JSON.stringify({sku:`${RUN}-ADJ`,name:'Adjustment product'})});productIds.push(product.id);
    await h.ok('/inventory/movements',{method:'POST',headers:headers('ADJ-OPEN'),body:JSON.stringify({productId:product.id,type:'in',quantity:'4.000',source:'opening',note:'Opening'})});
    const adjusted=await h.ok('/inventory/adjustments',{method:'POST',headers:headers('ADJ'),body:JSON.stringify({productId:product.id,targetStock:'9.250',reasonCode:'PHYSICAL_COUNT',note:'Conteo físico QA documentado'})});
    assert.equal(adjusted.movement.quantityExact,'5.250');
    const integrity=await h.ok(`/inventory/integrity?productId=${product.id}`);
    assert.equal(integrity[0].integrity,'ok');
    assert.equal(integrity[0].projected.stockExact,'9.250');
    const link=await h.prisma.$queryRaw<Array<{reasonCode:string;reason:string}>>(Prisma.sql`SELECT "reasonCode","reason" FROM "InventoryMovementAuditLink" WHERE "relatedMovementId"=${adjusted.movement.id}`);
    assert.equal(link[0]?.reasonCode,'PHYSICAL_COUNT');
  });

  await t.test('reversal preserves original and cannot be duplicated',async()=>{
    const product=await h.ok('/products',{method:'POST',body:JSON.stringify({sku:`${RUN}-REV`,name:'Reversal product'})});productIds.push(product.id);
    await h.ok('/inventory/movements',{method:'POST',headers:headers('REV-OPEN'),body:JSON.stringify({productId:product.id,type:'in',quantity:'12.000',source:'opening',note:'Opening'})});
    const out=await h.ok('/inventory/movements',{method:'POST',headers:headers('REV-OUT'),body:JSON.stringify({productId:product.id,type:'out',quantity:'2.500',source:'sale'})});
    const reversed=await h.ok(`/inventory/movements/${out.movement.id}/reverse`,{method:'POST',headers:headers('REV-DO'),body:JSON.stringify({reasonCode:'DATA_ENTRY_ERROR',reason:'Salida registrada por error en QA'})});
    assert.notEqual(reversed.movement.id,out.movement.id);
    assert.equal(await h.prisma.inventoryMovement.count({where:{id:{in:[out.movement.id,reversed.movement.id]}}}),2);
    const stored=await h.prisma.product.findUniqueOrThrow({where:{id:product.id}});
    assert.equal(n(stored.stock),12);
    await h.status(`/inventory/movements/${out.movement.id}/reverse`,409,{method:'POST',headers:headers('REV-SECOND'),body:JSON.stringify({reasonCode:'SECOND',reason:'Intento de reverso duplicado'})});
  });

  await t.test('cross-tenant product IDs are rejected without leaking data',async()=>{
    const foreign=await h.prisma.product.create({data:{tenantId:tenantB.id,sku:`${RUN}-FOREIGN`,name:'Foreign product'}});productIds.push(foreign.id);
    await h.status('/inventory/movements',404,{method:'POST',headers:headers('CROSS'),body:JSON.stringify({productId:foreign.id,type:'in',quantity:'1.000'})});
    assert.equal(await h.prisma.inventoryMovement.count({where:{tenantId:h.tenant.id,productId:foreign.id}}),0);
  });

  await t.test('concurrent reservations cannot oversell availability',async()=>{
    const product=await h.ok('/products',{method:'POST',body:JSON.stringify({sku:`${RUN}-CONC`,name:'Concurrent product'})});productIds.push(product.id);
    await h.ok('/inventory/movements',{method:'POST',headers:headers('CONC-OPEN'),body:JSON.stringify({productId:product.id,type:'in',quantity:'10.000',source:'opening',note:'Opening'})});
    const body=JSON.stringify({productId:product.id,type:'reservation',quantity:'6.000',source:'order'});
    const results=await Promise.all([
      h.request('/inventory/movements',{method:'POST',headers:headers('CONC-A'),body}),
      h.request('/inventory/movements',{method:'POST',headers:headers('CONC-B'),body})
    ]);
    const statuses=results.map((r:any)=>r.response.status).sort();
    assert.deepEqual(statuses,[200,409]);
    const stored=await h.prisma.product.findUniqueOrThrow({where:{id:product.id}});
    assert.equal(n(stored.reserved),6);
    assert.equal(n(stored.stock),10);
  });

  await t.test('audit log records sensitive inventory effects',async()=>{
    const count=await h.prisma.auditLog.count({where:{tenantId:h.tenant.id,entity:'InventoryMovement',action:{in:['inventory.adjustment','inventory.reversal']}}});
    assert.ok(count>=2,`Expected adjustment/reversal audit records, got ${count}`);
  });
});