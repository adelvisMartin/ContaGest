import { test, expect } from '@playwright/test';
import { MODULE_VISUAL_CATALOG } from './support/module-visual-catalog.mjs';
import { waitForStableLayout } from './support/playwright-determinism.mjs';

test.setTimeout(360_000);

const QA_SESSION={
  sessionMode:'cookie',mode:'cookie',tenantId:'qa-tenant',
  tenant:{id:'qa-tenant',name:'ContaGest QA',rif:'J-00000000-0',plan:'enterprise'},
  user:{id:'qa-admin',name:'QA Admin',fullName:'QA Admin',email:'qa@contagest.local',role:'admin',permissions:['*']},
  audience:'staff',expiresAt:Date.now()+8*60*60*1000
};

async function seed(page){
  await page.addInitScript((session)=>localStorage.setItem('contagest_auth_session',JSON.stringify(session)),QA_SESSION);
  await page.route('**/api/v1/**',async(route)=>{
    const request=route.request(),pathname=new URL(request.url()).pathname;
    if(pathname.endsWith('/auth/me'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:QA_SESSION})});
    const data=request.method()==='GET'?[]:{};
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data})});
  });
}

async function boot(page){
  await page.goto('/?module=dashboard',{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#pages[data-rendered-route="dashboard"]',{timeout:20_000});
}

async function urlNavigate(page,route){
  await page.evaluate((nextRoute)=>{
    const url=new URL(location.href);url.searchParams.set('module',nextRoute);
    history.pushState({module:nextRoute},'',url);
    window.dispatchEvent(new PopStateEvent('popstate',{state:{module:nextRoute}}));
  },route);
}

test('all registered protected routes commit the view that matches body, URL and title',async({page})=>{
  await seed(page);await boot(page);
  const failures=[];
  for(const item of MODULE_VISUAL_CATALOG.filter((entry)=>entry.route!=='login')){
    try{
      await urlNavigate(page,item.route);
      await expect.poll(()=>page.locator('body').getAttribute('data-route'),{timeout:15_000}).toBe(item.route);
      await expect(page.locator('#pages')).toHaveAttribute('data-rendered-route',item.route);
      expect(new URL(page.url()).searchParams.get('module')).toBe(item.route);
      const title=(await page.title()).toLowerCase();
      expect(title).toContain(item.route==='dashboard'?'inicio':item.route.replaceAll('-',' '));
    }catch(error){
      failures.push({route:item.route,url:page.url(),bodyRoute:await page.locator('body').getAttribute('data-route').catch(()=>null),renderedRoute:await page.locator('#pages').getAttribute('data-rendered-route').catch(()=>null),title:await page.title().catch(()=>''),error:String(error?.message||error)});
    }
  }
  console.log(`[route-transition-v164] sequential=${MODULE_VISUAL_CATALOG.length-1} failures=${failures.length}`);
  expect(failures,JSON.stringify(failures,null,2)).toEqual([]);
});

test('rapid navigation cannot let an older async page overwrite the final route',async({page})=>{
  await seed(page);await boot(page);
  const sequences=[
    ['veterinaria','contabilidad','gimnasio','ventas'],
    ['odontologia','reportes','inventario','psicologia'],
    ['rutinas','bancos','nutricion','dashboard']
  ];
  for(const sequence of sequences){
    await page.evaluate((routes)=>{
      for(const route of routes){
        const url=new URL(location.href);url.searchParams.set('module',route);
        history.pushState({module:route},'',url);
        window.dispatchEvent(new PopStateEvent('popstate',{state:{module:route}}));
      }
    },sequence);
    const expected=sequence.at(-1);
    await expect.poll(()=>page.locator('body').getAttribute('data-route'),{timeout:20_000}).toBe(expected);
    await expect(page.locator('#pages')).toHaveAttribute('data-rendered-route',expected);
    expect(new URL(page.url()).searchParams.get('module')).toBe(expected);
    await waitForStableLayout(page,'#pages');
    await expect(page.locator('#pages')).toHaveAttribute('data-rendered-route',expected);
  }
});

test('real command palette navigation commits a new DOM, not only a new title',async({page})=>{
  await seed(page);await boot(page);
  await page.locator('#btnCommandPalette').click();
  await expect(page.locator('#commandPalette')).toBeVisible();
  const target=page.locator('[data-command-route="inventario"]').first();
  await expect(target).toBeVisible();
  const before=await page.locator('#pages').innerHTML();
  await target.click();
  await expect.poll(()=>page.locator('body').getAttribute('data-route')).toBe('inventario');
  await expect(page.locator('#pages')).toHaveAttribute('data-rendered-route','inventario');
  expect(await page.locator('#pages').innerHTML()).not.toBe(before);
  expect(new URL(page.url()).searchParams.get('module')).toBe('inventario');
});
