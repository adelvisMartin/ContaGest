import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { prisma } from '../backend/src/database/prisma.js';
import { confirmPayableReview, getPayableDocument, ingestPayableDocument } from '../backend/src/modules/payables/payables.service.js';

const pdf=(text:string,salt='')=>Buffer.from(`%PDF-1.4\n1 0 obj<</Type /Page>>endobj\nBT ${text} ${salt} ET\n%%EOF`,'latin1');
const tenantData=(label:string)=>({rif:`QA-${label}-${randomUUID().slice(0,8)}`,name:`QA ${label}`});

async function createTenant(label:string){return prisma.tenant.create({data:tenantData(label)});}
after(async()=>{await prisma.$disconnect();});

test('v235 DB acceptance: tenant isolation, exact dedupe, PO/receipt match and review-only state',async(t)=>{
  const tenantA=await createTenant('A');
  const tenantB=await createTenant('B');
  t.after(async()=>{await prisma.tenant.deleteMany({where:{id:{in:[tenantA.id,tenantB.id]}}});});

  const supplier=await prisma.supplier.create({data:{tenantId:tenantA.id,rif:'J-44444444-4',name:'Proveedor QA'}});
  await prisma.moduleRecord.createMany({data:[
    {tenantId:tenantA.id,moduleSlug:'purchase-orders',title:'PO-235',status:'approved',payload:{number:'PO-235',lines:[{quantity:'2',unitCost:'10',taxRate:'16'}]}},
    {tenantId:tenantA.id,moduleSlug:'goods-receipt',title:'GRN-235',status:'received',payload:{number:'GRN-235',lines:[{quantity:'1',unitCost:'10',taxRate:'16'}]}}
  ]});

  const bytes=pdf('PROVEEDOR QA RIF J-44444444-4 FACTURA AP-235 FECHA 07/09/2026 MONEDA USD ITEM Tornillo CANT 2 PRECIO 10 IVA 16 SUBTOTAL 20 IVA 3.2 TOTAL 23.2 ORDEN DE COMPRA PO-235 RECEPCION GRN-235');
  const first=await ingestPayableDocument({tenantId:tenantA.id,fileName:'ap-235.pdf',mimeType:'application/pdf',bytes});
  assert.equal(first.duplicate,false);
  assert.equal(first.document.state,'review');
  assert.equal(first.document.purchaseInvoiceId,null,'OCR must never auto-post/create an obligation before review');
  assert.equal(first.document.supplierId,supplier.id);
  assert.equal(first.document.matchMode,'3-way');
  assert.equal((first.document.matchResult as any).purchaseOrder.matched,true);
  assert.equal((first.document.matchResult as any).receipt.matched,true);
  assert.equal((first.document.matchResult as any).differencesPreserved,true);
  assert.deepEqual((first.document.matchResult as any).purchaseOrder.differences,[]);
  assert.ok((first.document.matchResult as any).receipt.differences.some((row:any)=>row.kind==='quantity'));

  const reviewed=await confirmPayableReview({tenantId:tenantA.id,userId:'qa-payables-reviewer',documentId:first.document.id});
  assert.equal(reviewed.purchase.status,'draft');
  assert.equal(reviewed.purchase.lines.length,1,'accepted extracted lines must survive human review into the draft');
  assert.equal(reviewed.purchase.lines[0].description,'Tornillo');
  assert.equal(reviewed.purchase.lines[0].quantity.toString(),'2');
  assert.equal(reviewed.purchase.lines[0].unitCost.toString(),'10');
  assert.equal(reviewed.purchase.lines[0].taxRate.toString(),'16');
  assert.equal(reviewed.purchase.lines[0].total.toString(),'23.2');

  const replay=await ingestPayableDocument({tenantId:tenantA.id,fileName:'duplicate.pdf',mimeType:'application/pdf',bytes});
  assert.equal(replay.duplicate,true);
  assert.equal(replay.document.id,first.document.id,'same hash must not create a second document/obligation');

  await assert.rejects(()=>getPayableDocument(tenantB.id,first.document.id),(error:any)=>error?.status===404);

  const b=await ingestPayableDocument({tenantId:tenantB.id,fileName:'tenant-b.pdf',mimeType:'application/pdf',bytes});
  assert.notEqual(b.document.id,first.document.id,'dedupe scope is per tenant');
  await assert.rejects(()=>getPayableDocument(tenantA.id,b.document.id),(error:any)=>error?.status===404);

  const sameReferenceDifferentHash=await ingestPayableDocument({tenantId:tenantA.id,fileName:'same-ref.pdf',mimeType:'application/pdf',bytes:pdf('RIF J-44444444-4 FACTURA AP-235 FECHA 07/09/2026 MONEDA USD SUBTOTAL 20 IVA 3.2 TOTAL 23.2','revision-2')});
  assert.equal(sameReferenceDifferentHash.document.suspectedDuplicate,true);
  assert.equal(sameReferenceDifferentHash.document.duplicateOfId,first.document.id);
  assert.equal(sameReferenceDifferentHash.document.purchaseInvoiceId,null);
});

test('v235 unknown supplier is suggested only and never autocreated',async(t)=>{
  const tenant=await createTenant('UNKNOWN');
  t.after(async()=>{await prisma.tenant.deleteMany({where:{id:tenant.id}});});
  const before=await prisma.supplier.count({where:{tenantId:tenant.id}});
  const result=await ingestPayableDocument({tenantId:tenant.id,fileName:'unknown.pdf',mimeType:'application/pdf',bytes:pdf('RIF J-99999999-9 FACTURA NEW-1 FECHA 07/09/2026 TOTAL 10')});
  const after=await prisma.supplier.count({where:{tenantId:tenant.id}});
  assert.equal(after,before);
  assert.equal(result.document.supplierId,null);
  assert.equal((result.document.matchResult as any).supplier.matched,false);
  assert.equal((result.document.matchResult as any).supplier.suggestedRif,'J-99999999-9');
});
