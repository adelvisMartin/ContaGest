import { test, expect } from '@playwright/test';

const QA_SESSION={
  sessionMode:'cookie',mode:'cookie',tenantId:'qa-payables-tenant',
  tenant:{id:'qa-payables-tenant',name:'ContaGest Payables QA',rif:'J-00000235-0',plan:'enterprise'},
  user:{id:'qa-payables-admin',name:'QA AP',fullName:'QA AP',email:'ap.qa@contagest.local',role:'admin',permissions:['*']},
  audience:'staff',expiresAt:Date.now()+8*60*60*1000
};

const baseDocument={
  id:'payable-doc-235',tenantId:'qa-payables-tenant',fileName:'factura-235.pdf',mimeType:'application/pdf',sizeBytes:2048,
  documentHash:'a'.repeat(64),supplierId:'supplier-235',purchaseInvoiceId:null,duplicateOfId:null,suspectedDuplicate:false,
  supplierReference:'FAC-235',state:'review',reviewStatus:'pending',matchMode:'3-way',
  matchResult:{differencesPreserved:true,purchaseOrder:{matched:true,reference:'PO-235',differences:[]},receipt:{matched:true,reference:'GRN-235',differences:[{kind:'quantity',expected:'2',extracted:'1'}]}},
  parserName:'safe-local',parserVersion:'1.0.0',
  parserResult:{
    supplierRif:{value:'J-12345678-9',confidence:.96,source:'local-heuristic'},invoiceNumber:{value:'FAC-235',confidence:.9,source:'local-heuristic'},
    issueDate:{value:'2026-09-07',confidence:.9,source:'local-heuristic'},currency:{value:'USD',confidence:.88,source:'local-heuristic'},
    subtotal:{value:'100.00',confidence:.9,source:'local-heuristic'},tax:{value:'16.00',confidence:.72,source:'local-heuristic'},total:{value:'116.00',confidence:.93,source:'local-heuristic'},
    poReference:{value:'PO-235',confidence:.86,source:'local-heuristic'},receiptReference:{value:'GRN-235',confidence:.86,source:'local-heuristic'},lines:[{description:{value:'Tornillo',confidence:.9,source:'local-line-heuristic'},quantity:{value:'1',confidence:.93,source:'local-line-heuristic'},unitCost:{value:'100',confidence:.93,source:'local-line-heuristic'},taxRate:{value:'16',confidence:.9,source:'local-line-heuristic'}}],warnings:[]
  }
};

async function seedAuthenticatedUi(page){
  await page.addInitScript((session)=>localStorage.setItem('contagest_auth_session',JSON.stringify(session)),QA_SESSION);
  await page.route('**/api/v1/**',async(route)=>{
    const url=new URL(route.request().url());
    if(url.pathname==='/api/v1/auth/me') return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:QA_SESSION})});
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:[]})});
  });
}

test('AP upload requires human confirmation and creates only a draft',async({page})=>{
  await seedAuthenticatedUi(page);
  let documents=[];
  let reviewPayload=null;

  await page.route('**/api/v1/payables/documents**',async(route)=>{
    const request=route.request();
    const url=new URL(request.url());
    const path=url.pathname;
    if(request.method()==='POST'&&path==='/api/v1/payables/documents'){
      documents=[structuredClone(baseDocument)];
      return route.fulfill({status:201,contentType:'application/json',body:JSON.stringify({ok:true,data:{document:documents[0],duplicate:false,exactHash:false}})});
    }
    if(request.method()==='POST'&&path.endsWith('/review')){
      reviewPayload=request.postDataJSON();
      const reviewed={...documents[0],state:'draft_created',reviewStatus:'confirmed',purchaseInvoiceId:'purchase-draft-235'};
      documents=[reviewed];
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:{document:reviewed,purchase:{id:'purchase-draft-235',status:'draft',number:'FAC-235'},idempotent:false}})});
    }
    if(request.method()==='GET'&&path==='/api/v1/payables/documents/payable-doc-235'){
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:{...documents[0],requiredConfirmations:['tax'],parserRuns:[{id:'run-1',status:'success',result:documents[0].parserResult}]}})});
    }
    if(request.method()==='GET'&&path==='/api/v1/payables/documents'){
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:documents})});
    }
    return route.continue();
  });

  await page.goto('/?module=compras',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#payableUploadForm')).toBeVisible();
  await expect(page.locator('#payableUploadForm')).toContainText('nunca se contabiliza automáticamente');

  await page.locator('#payableUploadForm input[type="file"]').setInputFiles({
    name:'factura-235.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\n1 0 obj<</Type /Page>>endobj\nBT FACTURA FAC-235 TOTAL 116 ET\n%%EOF','latin1')
  });
  await page.locator('#payableUploadForm button[type="submit"]').click();

  await expect(page.locator('[data-payable-review="payable-doc-235"]')).toBeVisible();
  await expect(page.locator('body')).toContainText('3-way');
  await expect(page.locator('body')).toContainText('1 por confirmar');

  const dialogs=[];
  page.on('dialog',async(dialog)=>{dialogs.push(dialog.message());await dialog.accept();});
  await page.locator('[data-payable-review="payable-doc-235"]').click();

  await expect.poll(()=>reviewPayload).not.toBeNull();
  expect(dialogs.some((message)=>message.includes('campos de baja confianza'))).toBe(true);
  expect(dialogs.some((message)=>message.includes('diferencia(s)')&&message.includes('Líneas extraídas: 1'))).toBe(true);
  expect(reviewPayload.confirmedFields).toContain('tax');
  expect(reviewPayload.corrections).toEqual({});
  await expect(page.locator('body')).toContainText('Borrador creado');
  await expect(page.locator('body')).toContainText('únicamente un borrador');
});

test('suspected duplicate never exposes the create-draft review action',async({page})=>{
  await seedAuthenticatedUi(page);
  const duplicate={...baseDocument,id:'payable-duplicate-235',suspectedDuplicate:true,duplicateOfId:'payable-doc-original'};
  await page.route('**/api/v1/payables/documents**',async(route)=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:[duplicate]})}));
  await page.goto('/?module=compras',{waitUntil:'domcontentloaded'});
  await expect(page.locator('body')).toContainText('Posible duplicado');
  await expect(page.locator('[data-payable-review="payable-duplicate-235"]')).toHaveCount(0);
});
