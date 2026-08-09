import {test,expect} from '@playwright/test';

const documents=['terms','privacy','cookies','acceptable-use','suspension-termination'].map((code,index)=>({code,title:`Documento ${index+1}`,required:true,version:'2026-08-09.v1',effectiveAt:'2026-08-09',hash:String(index+1).repeat(64),body:`Contenido contractual ${code}.`}));

test('licensed client must explicitly accept current legal documents and necessary cookies before continuing',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.addInitScript(()=>{
    localStorage.setItem('contagest_auth_session',JSON.stringify({tenantId:'tenant-legal',sessionMode:'cookie',mode:'cookie',audience:'client',user:{id:'user-legal',email:'cliente@example.com'},tenant:{id:'tenant-legal',rif:'J-12345678-9',name:'Cliente QA'},expiresAt:Date.now()+3600000}));
    localStorage.setItem('contagest_auto_sync_enabled','false');
    localStorage.setItem('contagest_analytics_backend_enabled','false');
  });
  let acceptedBody=null;
  // Playwright resolves the most recently registered matching route first.
  // Register the generic fallback before legal-specific mocks so the legal contract is actually exercised.
  await page.route('**/api/v1/**',(route)=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:[]})}));
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
  for(const checkbox of await page.locator('[data-legal-document]').all())await checkbox.check();
  await page.locator('#cgNecessaryCookies').check();
  await expect(accept).toBeEnabled();
  await accept.click();
  await expect(dialog).toHaveCount(0);
  expect(acceptedBody.necessaryCookiesAcknowledged).toBe(true);
  expect(acceptedBody.analyticsCookies).toBe(false);
  expect(acceptedBody.documents).toHaveLength(5);
  expect(await page.evaluate(()=>localStorage.getItem('contagest_analytics_backend_enabled'))).toBe('false');
});
