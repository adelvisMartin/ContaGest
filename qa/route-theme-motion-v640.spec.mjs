import { test, expect } from '@playwright/test';
import { MODULE_VISUAL_CATALOG } from './support/module-visual-catalog.mjs';
import { waitForRouteReady } from './support/playwright-determinism.mjs';

const QA_SESSION={
  sessionMode:'cookie',mode:'cookie',tenantId:'qa-tenant',
  tenant:{id:'qa-tenant',name:'ContaGest QA',rif:'J-00000000-0',plan:'enterprise'},
  user:{id:'qa-admin',name:'QA Admin',fullName:'QA Admin',email:'qa@contagest.local',role:'admin',permissions:['*']},
  audience:'staff',expiresAt:Date.now()+8*60*60*1000
};

async function seed(page){
  await page.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'});
  await page.addInitScript((session)=>{
    const hashScopePart=(value)=>{
      const input=String(value||'anonymous');
      let hash=2166136261;
      for(let index=0;index<input.length;index+=1){hash^=input.charCodeAt(index);hash=Math.imul(hash,16777619);}
      return (hash>>>0).toString(36);
    };
    localStorage.setItem('contagest_auth_session',JSON.stringify(session));
    const tenantId=session?.tenantId||session?.tenant?.id||'anonymous';
    const userId=session?.user?.id||session?.userId||'anonymous';
    const key=`contagest_ve_enterprise_v7_state:${hashScopePart(tenantId)}-${hashScopePart(userId)}`;
    let current={};
    try{current=JSON.parse(localStorage.getItem(key)||'{}')||{};}catch{}
    localStorage.setItem(key,JSON.stringify({...current,settings:{...(current.settings||{}),theme:'system'}}));
    window.confirm=()=>false;
    window.open=()=>null;
  },QA_SESSION);
  await page.route('**/api/v1/**',async(route)=>{
    const request=route.request();
    const pathname=new URL(request.url()).pathname;
    if(pathname.endsWith('/auth/me'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:QA_SESSION})});
    if(pathname.endsWith('/auth/captcha'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:{token:'qa',question:'2 + 2',prompt:'Resuelve 2 + 2',expiresAt:new Date(Date.now()+300000).toISOString()}})});
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:request.method()==='GET'?[]:{}})});
  });
}

for(const item of MODULE_VISUAL_CATALOG){
  test(`${item.route} · system theme and reduced motion`,async({page})=>{
    const pageErrors=[];
    page.on('pageerror',(error)=>pageErrors.push(String(error?.message||error)));
    await seed(page);
    await page.goto(`/?module=${encodeURIComponent(item.route)}`,{waitUntil:'domcontentloaded'});
    await waitForRouteReady(page,item.route,{standalone:item.standalone});

    await expect(page.locator('html')).toHaveAttribute('data-theme','system');
    await expect(page.locator('html')).toHaveClass(/dark/);
    expect(await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);

    await page.emulateMedia({colorScheme:'light',reducedMotion:'reduce'});
    await expect(page.locator('html')).not.toHaveClass(/dark/);
    expect(await page.evaluate(()=>matchMedia('(prefers-color-scheme: light)').matches)).toBe(true);
    expect(pageErrors).toEqual([]);
  });
}
