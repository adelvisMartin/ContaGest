import { test, expect } from '@playwright/test';

test.setTimeout(600_000);
test.use({viewport:{width:390,height:844},hasTouch:true,isMobile:true});

const QA_SESSION={
  sessionMode:'cookie',mode:'cookie',tenantId:'qa-tenant',
  tenant:{id:'qa-tenant',name:'ContaGest QA',rif:'J-00000000-0',plan:'enterprise'},
  user:{id:'qa-admin',name:'QA Admin',fullName:'QA Admin',email:'qa@contagest.local',role:'admin',permissions:['*']},
  audience:'staff',expiresAt:Date.now()+8*60*60*1000
};

async function seed(page){
  await page.addInitScript((session)=>localStorage.setItem('contagest_auth_session',JSON.stringify(session)),QA_SESSION);
  await page.route('**/api/v1/**',async(route)=>{
    const request=route.request();
    const pathname=new URL(request.url()).pathname;
    if(pathname.endsWith('/auth/me'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:QA_SESSION})});
    if(pathname.endsWith('/auth/captcha'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:{token:'qa-token',question:'2 + 2',prompt:'Resuelve 2 + 2',expiresAt:new Date(Date.now()+300000).toISOString()}})});
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:request.method()==='GET'?[]:{}})});
  });
}
async function dashboard(page){await page.goto('/?module=dashboard',{waitUntil:'domcontentloaded'});await page.waitForSelector('#pages[data-rendered-route="dashboard"]',{state:'attached',timeout:20_000});}
async function openSidebar(page){if(!(await page.locator('body').evaluate((body)=>body.classList.contains('cg-menu-open'))))await page.locator('#btnOpenSidebar').click();await expect(page.locator('body')).toHaveClass(/cg-menu-open/);}

test('every actual sidebar route button navigates to the requested module and closes the drawer on mobile',async({page})=>{
  await seed(page);await dashboard(page);await openSidebar(page);
  const routes=await page.locator('#mainMenu button[data-route],.hf-sidebar-footer button[data-route]').evaluateAll((nodes)=>[...new Set(nodes.map((node)=>node.dataset.route).filter(Boolean))]);
  expect(routes.length).toBeGreaterThanOrEqual(20);
  const failures=[];
  for(const route of routes){
    try{
      await dashboard(page);await openSidebar(page);
      const button=page.locator(`#mainMenu button[data-route="${route}"],.hf-sidebar-footer button[data-route="${route}"]`).first();
      await expect(button).toHaveCount(1);
      await button.evaluate((node)=>{const details=node.closest('details');if(details)details.open=true;node.scrollIntoView({block:'center',inline:'nearest'});});
      await expect(button).toBeVisible();
      await button.click();
      await expect.poll(()=>page.locator('body').getAttribute('data-route'),{timeout:10_000}).toBe(route);
      await expect(page.locator('#pages')).toHaveAttribute('data-rendered-route',route);
      expect(new URL(page.url()).searchParams.get('module')).toBe(route);
      await expect(page.locator('body')).not.toHaveClass(/cg-menu-open/);
    }catch(error){failures.push({route,error:String(error?.message||error),url:page.url(),bodyRoute:await page.locator('body').getAttribute('data-route').catch(()=>null),renderedRoute:await page.locator('#pages').getAttribute('data-rendered-route').catch(()=>null)});}
  }
  console.log(`[mobile-navigation-v163] sidebar-routes=${routes.length} fallos=${failures.length}`);
  expect(failures,JSON.stringify(failures,null,2)).toEqual([]);
});

test('command palette opens, filters, navigates and closes from a touch viewport',async({page})=>{
  await seed(page);await dashboard(page);
  await page.locator('#btnCommandPalette').click();
  await expect(page.locator('#commandPalette')).toBeVisible();
  const input=page.locator('#commandSearchInput');
  await input.fill('inventario');
  const results=page.locator('[data-command-route]:visible');
  await expect(results.first()).toBeVisible();
  const target=await results.first().getAttribute('data-command-route');
  expect(target).toBeTruthy();
  await results.first().click();
  await expect.poll(()=>page.locator('body').getAttribute('data-route'),{timeout:10_000}).toBe(target);
  await expect(page.locator('#pages')).toHaveAttribute('data-rendered-route',target);
  expect(new URL(page.url()).searchParams.get('module')).toBe(target);
  await expect(page.locator('#commandPalette')).toBeHidden();
});
