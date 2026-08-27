import {test,expect} from '@playwright/test';

const makeDocuments=(version='2026-08-09.v1')=>['terms','privacy','cookies','acceptable-use','suspension-termination'].map((code,index)=>({
  code,
  title:`Documento ${index+1}`,
  required:true,
  version,
  effectiveAt:version.startsWith('2026-08-27')?'2026-08-27':'2026-08-09',
  hash:String(index+1).repeat(64),
  body:`Contenido contractual ${code}.`
}));
const documents=makeDocuments();

async function seedClientSession(page,{acceptedCache=false}={}){
  await page.addInitScript(({acceptedCache})=>{
    if(sessionStorage.getItem('cg_qa_legal_seeded')==='1')return;
    const session={tenantId:'tenant-legal',sessionMode:'cookie',mode:'cookie',audience:'client',user:{id:'user-legal',email:'cliente@contagest.test'},tenant:{id:'tenant-legal',rif:'J-12345678-9',name:'Cliente QA'},expiresAt:Date.now()+3600000};
    localStorage.setItem('contagest_auth_session',JSON.stringify(session));
    localStorage.setItem('contagest_auto_sync_enabled','false');
    localStorage.setItem('contagest_analytics_backend_enabled','false');
    if(acceptedCache)sessionStorage.setItem('cg_legal_ok:tenant-legal:cliente@contagest.test','1');
    sessionStorage.setItem('cg_qa_legal_seeded','1');
  },{acceptedCache});
}

async function registerFallback(page){
  // Playwright resolves the most recently registered matching route first.
  // Register the generic fallback before legal-specific mocks so the legal contract is exercised.
  await page.route('**/api/v1/**',(route)=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:[]})}));
}

async function acceptAll(dialog){
  const sections=dialog.locator('.cg-legal-docs details');
  await expect(sections).toHaveCount(5);
  for(let i=0;i<5;i+=1){
    const section=sections.nth(i);
    if(!(await section.evaluate((node)=>node.open)))await section.locator('summary').click();
    const checkbox=section.locator('[data-legal-document]');
    await checkbox.check();
    await expect(checkbox).toBeChecked();
  }
  await dialog.locator('#cgNecessaryCookies').check();
}

test('licensed client must explicitly accept current legal documents and necessary cookies before continuing',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await seedClientSession(page);
  let acceptedBody=null;
  await registerFallback(page);
  await page.route('**/api/v1/legal/status',(route)=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:{productionReady:true,documents,pending:true,pendingCodes:documents.map(d=>d.code),cookiePreferences:{necessaryAcknowledged:false,analyticsEnabled:false,marketingEnabled:false}}})}));
  await page.route('**/api/v1/legal/accept',async(route)=>{
    acceptedBody=route.request().postDataJSON();
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:{accepted:true,cookiePreferences:{necessaryAcknowledged:true,analyticsEnabled:false,marketingEnabled:false}}})});
  });
  await page.goto('/?module=dashboard',{waitUntil:'domcontentloaded'});
  const dialog=page.getByRole('dialog',{name:/Antes de continuar en ContaGest/i});
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/analítica técnica de uso/i)).toBeVisible();
  await expect(page.locator('#cgAnalyticsCookies')).not.toBeChecked();
  const accept=page.locator('#cgLegalAccept');
  await expect(accept).toBeDisabled();

  await acceptAll(dialog);
  await expect(accept).toBeEnabled();
  await accept.click();
  await expect(dialog).toHaveCount(0);
  expect(acceptedBody.necessaryCookiesAcknowledged).toBe(true);
  expect(acceptedBody.analyticsCookies).toBe(false);
  expect(acceptedBody.documents).toHaveLength(5);
  expect(await page.evaluate(()=>localStorage.getItem('contagest_analytics_backend_enabled'))).toBe('false');
});

test('rejecting required legal documents logs out and never records acceptance',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await seedClientSession(page);
  let logoutCalls=0;
  let acceptCalls=0;
  await registerFallback(page);
  await page.route('**/api/v1/legal/status',(route)=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:{productionReady:true,documents,pending:true,pendingCodes:documents.map(d=>d.code),cookiePreferences:{necessaryAcknowledged:false,analyticsEnabled:false,marketingEnabled:false}}})}));
  await page.route('**/api/v1/legal/accept',async(route)=>{
    acceptCalls+=1;
    await route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({ok:false,message:'No debería llamarse'})});
  });
  await page.route('**/api/v1/auth/logout',async(route)=>{
    logoutCalls+=1;
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:{loggedOut:true}})});
  });

  await page.goto('/?module=dashboard',{waitUntil:'domcontentloaded'});
  const dialog=page.getByRole('dialog',{name:/Antes de continuar en ContaGest/i});
  await expect(dialog).toBeVisible();
  await dialog.locator('#cgLegalExit').click();
  await expect(page).toHaveURL(/\?module=login/);
  expect(logoutCalls).toBe(1);
  expect(acceptCalls).toBe(0);
  expect(await page.evaluate(()=>localStorage.getItem('contagest_auth_session'))).toBeNull();
});

test('HTTP 428 from a protected API invalidates cached acceptance and forces reacceptance of the new version',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await seedClientSession(page,{acceptedCache:true});
  const nextDocuments=makeDocuments('2026-08-27.v2');
  let acceptedBody=null;
  let statusCalls=0;
  await registerFallback(page);
  await page.route('**/api/v1/legal/status',(route)=>{
    statusCalls+=1;
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:{productionReady:true,documents:nextDocuments,pending:true,pendingCodes:nextDocuments.map(d=>d.code),cookiePreferences:{necessaryAcknowledged:true,analyticsEnabled:false,marketingEnabled:false}}})});
  });
  await page.route('**/api/v1/legal/accept',async(route)=>{
    acceptedBody=route.request().postDataJSON();
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:{accepted:true,cookiePreferences:{necessaryAcknowledged:true,analyticsEnabled:false,marketingEnabled:false}}})});
  });
  await page.route('**/api/v1/products',(route)=>route.fulfill({status:428,contentType:'application/json',body:JSON.stringify({ok:false,message:'Aceptación legal pendiente: terms, privacy, cookies, acceptable-use, suspension-termination'})}));

  await page.goto('/?module=dashboard',{waitUntil:'domcontentloaded'});
  const dialog=page.getByRole('dialog',{name:/Antes de continuar en ContaGest/i});
  await expect(dialog).toHaveCount(0);

  await page.evaluate(async()=>{
    const {BackendApi}=await import('/src/services/backendApi.js');
    try{await BackendApi.get('/products');}catch{/* 428 is the expected trigger */}
  });

  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.cg-legal-version')).toHaveText('2026-08-27.v2');
  expect(statusCalls).toBeGreaterThan(0);
  await acceptAll(dialog);
  await dialog.locator('#cgLegalAccept').click();
  await expect(dialog).toHaveCount(0);
  expect(acceptedBody.documents).toHaveLength(5);
  expect(acceptedBody.documents.every((doc)=>doc.version==='2026-08-27.v2')).toBe(true);
});
