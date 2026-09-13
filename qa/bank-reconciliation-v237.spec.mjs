import { test, expect } from '@playwright/test';

const QA_SESSION={
  sessionMode:'cookie',mode:'cookie',tenantId:'qa-reconciliation-tenant',
  tenant:{id:'qa-reconciliation-tenant',name:'ContaGest Reconciliation QA',rif:'J-00000237-0',plan:'enterprise'},
  user:{id:'qa-reconciliation-admin',name:'QA Bancos',fullName:'QA Bancos',email:'bank.qa@contagest.local',role:'admin',permissions:['*']},
  audience:'staff',expiresAt:Date.now()+8*60*60*1000
};
const ACCOUNT={id:'11111111-1111-4111-8111-111111111111',bankName:'Banco QA',accountNo:'0001',bank:'Banco QA',account:'0001',currency:'VES',balance:100,integrity:'ok'};
const LINE={id:'22222222-2222-4222-8222-222222222222',accountId:ACCOUNT.id,bookedAt:'2026-09-10T00:00:00.000Z',amount:'100.00',currency:'VES',reference:'REF-237',memo:'Pago Cliente Uno',counterparty:'Cliente Uno',status:'suggested',allocated:'0.00',remaining:'100.00'};
const CANDIDATE={targetType:'bank_movement',targetId:'33333333-3333-4333-8333-333333333333',label:'Cobro REF-237 · Banco QA',amount:'100.00',remaining:'100.00',currency:'VES',date:'2026-09-10T00:00:00.000Z',reference:'REF-237',partner:'Cliente Uno',confidence:0.98,reasons:['exact_reference','partner_match','exact_remaining_amount','date_window_2d'],blockedReason:null};

async function seed(page,{lines=[LINE],candidates=[CANDIDATE]}={}){
  await page.addInitScript((session)=>localStorage.setItem('contagest_auth_session',JSON.stringify(session)),QA_SESSION);
  const calls={imports:0,reconcile:null,uploaded:false};
  await page.route('**/api/v1/**',async(route)=>{
    const req=route.request(); const url=new URL(req.url()); const path=url.pathname;
    const json=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify({ok:true,data})});
    if(path==='/api/v1/auth/me')return json(QA_SESSION);
    if(path==='/api/v1/banking/summary')return json({accounts:[ACCOUNT],movements:[],pending:0,reconciliationRate:100});
    if(path==='/api/v1/bank-reconciliation/lines'&&req.method()==='GET')return json(lines);
    if(path==='/api/v1/bank-reconciliation/imports'&&req.method()==='GET')return json([]);
    if(path==='/api/v1/bank-reconciliation/models'&&req.method()==='GET')return json([]);
    if(path==='/api/v1/bank-reconciliation/closing-balance')return json({importId:'imp-1',currency:'VES',closingBalance:'100.00',ledgerBalance:'95.50',difference:'4.50',exact:false,coverage:{lines:1,unmatched:1}});
    if(path===`/api/v1/bank-reconciliation/lines/${LINE.id}/candidates`)return json({line:LINE,status:'suggested',autoThreshold:'0.9500',requiresReview:false,candidates});
    if(path===`/api/v1/bank-reconciliation/lines/${LINE.id}/reconcile`&&req.method()==='POST'){
      calls.reconcile=req.postDataJSON(); return json({replayed:false,reconciliation:{id:'rec-1',status:'confirmed'},line:{...LINE,status:'reconciled',remaining:'0.00'}});
    }
    if(path==='/api/v1/bank-reconciliation/imports'&&req.method()==='POST'){
      calls.imports++; calls.uploaded=(req.headers()['content-type']||'').startsWith('multipart/form-data');
      return json({duplicate:false,importId:'imp-upload',inserted:1,deduplicated:0,parserVersion:'contagest-bank-statement/1.1.0'},201);
    }
    if(path.startsWith('/api/v1/'))return json([]);
    return route.continue();
  });
  return calls;
}

test('workspace muestra razones, confidence, filtros y diferencia de cierre',async({page})=>{
  await seed(page);
  await page.goto('/?module=bancos',{waitUntil:'domcontentloaded'});
  await expect(page.getByText('Conciliación de extractos')).toBeVisible();
  await expect(page.locator('select[data-query-param="reconStatus"]')).toBeVisible();
  await expect(page.locator('select[data-query-param="reconStatus"] option')).toHaveText(['unmatched','suggested','partial','reconciled','conflict','todos']);
  await expect(page.getByText('Diferencia 4.50')).toBeVisible();
  await expect(page.getByText('Cobro REF-237 · Banco QA')).toBeVisible();
  await expect(page.getByText('98%')).toBeVisible();
  await expect(page.getByText(/exact_reference.*partner_match.*exact_remaining_amount/)).toBeVisible();
  await expect(page.getByRole('button',{name:'Conciliar con este candidato'})).toBeVisible();
});

test('confirmación usa API idempotente y navegación de lote funciona por teclado',async({page})=>{
  const calls=await seed(page);
  await page.goto('/?module=bancos',{waitUntil:'domcontentloaded'});
  const review=page.getByRole('button',{name:'Revisar candidatos'}).first();
  await review.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('button',{name:'Conciliar con este candidato'})).toBeVisible();
  await page.getByRole('button',{name:'Conciliar con este candidato'}).click();
  await expect.poll(()=>calls.reconcile).not.toBeNull();
  expect(calls.reconcile.allocations).toEqual([{targetType:'bank_movement',targetId:CANDIDATE.targetId,amount:'100.00'}]);
});

test('upload envía el archivo completo al backend y no vuelve al parser CSV del navegador',async({page})=>{
  const calls=await seed(page);
  await page.goto('/?module=bancos',{waitUntil:'domcontentloaded'});
  await page.locator('#bankStatementFile').setInputFiles({name:'estado.ofx',mimeType:'application/x-ofx',buffer:Buffer.from('<OFX><CURDEF>VES</OFX>')});
  await expect.poll(()=>calls.imports).toBe(1);
  expect(calls.uploaded).toBe(true);
  await expect(page.getByText(/1 líneas importadas/)).toBeVisible();
});
