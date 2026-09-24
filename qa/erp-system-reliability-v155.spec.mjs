import { test, expect } from '@playwright/test';
import { AccessControlService } from '../frontend/src/services/accessControlService.js';
import { fixtureForRequest } from './support/erp-system-fixtures-v155.mjs';
import { waitForRouteReady } from './support/playwright-determinism.mjs';

test.setTimeout(120_000);
const BASE_URL=String(process.env.QA_BASE_URL||'http://127.0.0.1:8080').replace(/\/$/,'');
const rbac=AccessControlService.defaultState();
const sessionA={
  sessionMode:'cookie',mode:'cookie',tenantId:'qa-tenant-a',
  tenant:{id:'qa-tenant-a',name:'ContaGest QA A',rif:'J-00000000-0',plan:'enterprise'},
  user:{id:'user-admin',name:'QA Admin',fullName:'QA Admin',email:'qa-admin@example.test',role:'admin',permissions:['*']},
  audience:'staff',expiresAt:Date.now()+8*60*60*1000,
  accessibleTenants:[
    {tenantId:'qa-tenant-a',name:'ContaGest QA A',rif:'J-00000000-0',roleLabel:'Administrador'},
    {tenantId:'qa-tenant-b',name:'ContaGest QA B',rif:'J-00000000-2',roleLabel:'Administrador'}
  ]
};
const sessionB={...sessionA,tenantId:'qa-tenant-b',tenant:{id:'qa-tenant-b',name:'ContaGest QA B',rif:'J-00000000-2',plan:'enterprise'}};
const storeSeed={rbac,settings:{theme:'light',lang:'es',businessMode:'admin',companyName:'ContaGest QA A',companyRif:'J-00000000-0'}};

async function seedContext(context){
  await context.addInitScript(({auth,store})=>{
    if(!localStorage.getItem('contagest_auth_session'))localStorage.setItem('contagest_auth_session',JSON.stringify(auth));
    if(!localStorage.getItem('contagest_ve_enterprise_v7_state'))localStorage.setItem('contagest_ve_enterprise_v7_state',JSON.stringify(store));
    window.confirm=()=>true;window.open=()=>null;
  },{auth:sessionA,store:storeSeed});
  await context.route('**/api/**',async(route)=>{
    const request=route.request();const pathname=new URL(request.url()).pathname;
    if(pathname.endsWith('/auth/me'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:sessionA})});
    if(pathname.endsWith('/auth/captcha'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:{token:'qa-signed-token-12345678901234567890',question:'2 + 2',prompt:'Resuelve 2 + 2',expiresAt:new Date(Date.now()+300000).toISOString()}})});
    if(pathname.endsWith('/auth/switch-tenant'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:sessionB})});
    if(pathname.endsWith('/auth/logout'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:{loggedOut:true}})});
    if(pathname.endsWith('/auth/login'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:sessionA})});
    let postBody=null;try{postBody=request.postDataJSON();}catch{}
    const fixture=fixtureForRequest({url:request.url(),method:request.method(),state:'baseline',body:postBody});
    return route.fulfill({status:fixture.status,contentType:'application/json',body:JSON.stringify(fixture.body)});
  });
}

async function open(page,route,viewport={width:390,height:844}){
  await page.setViewportSize(viewport);await page.goto(`${BASE_URL}/?module=${encodeURIComponent(route)}`,{waitUntil:'domcontentloaded'});await page.waitForSelector(route==='login'?'.login-shell':'#pages',{state:'attached',timeout:20_000});await waitForRouteReady(page,route,{standalone:route==='login'});
}

test('two tabs keep independent navigation and survive refresh/back',async({context})=>{
  await seedContext(context);const first=await context.newPage();const second=await context.newPage();
  await open(first,'dashboard');await open(second,'ventas');
  await expect(first.locator('body')).toHaveAttribute('data-route','dashboard');await expect(second.locator('body')).toHaveAttribute('data-route','ventas');
  await second.reload({waitUntil:'domcontentloaded'});await expect(second.locator('body')).toHaveAttribute('data-route','ventas');
  await second.goto(`${BASE_URL}/?module=inventario`,{waitUntil:'domcontentloaded'});await expect(second.locator('body')).toHaveAttribute('data-route','inventario');await second.goBack({waitUntil:'domcontentloaded'});await expect(second.locator('body')).toHaveAttribute('data-route','ventas');
  await expect(first.locator('body')).toHaveAttribute('data-route','dashboard');
});

test('authorized tenant switch updates visible company without cross-tenant fallback',async({context,page})=>{
  await seedContext(context);await open(page,'dashboard',{width:1366,height:768});
  await page.locator('#btnUserMenu').click();const switcher=page.locator('#cgTenantSwitcher');await expect(switcher).toBeVisible();await switcher.selectOption('qa-tenant-b');
  await expect.poll(async()=>page.evaluate(()=>JSON.parse(localStorage.getItem('contagest_auth_session')||'{}').tenantId)).toBe('qa-tenant-b');
  await expect(page.locator('body')).toContainText('ContaGest QA B');
});

test('logout returns to login and a fresh CAPTCHA/login cycle restores the session',async({context,page})=>{
  await seedContext(context);await open(page,'dashboard',{width:430,height:932});
  await page.locator('#btnUserMenu').click();await page.locator('[data-user-action="logout"]').click();await expect(page.locator('.login-shell')).toBeVisible();
  await expect(page.locator('[data-captcha-question]')).toContainText('2 + 2');
  await page.locator('input[name="tenantRif"]').fill('J-00000000-0');await page.locator('input[name="email"]').fill('qa-admin@example.test');await page.locator('input[name="password"]').fill('Qa-Synthetic-Password-123!');await page.locator('input[name="captchaAnswer"]').fill('4');
  const submit=page.locator('#loginForm button[type="submit"]');await expect(submit).toBeEnabled();await submit.click();await expect(page.locator('body')).toHaveAttribute('data-route','dashboard');
});

test('browser context recreation preserves compatible local state',async({browser})=>{
  const first=await browser.newContext({baseURL:BASE_URL});await seedContext(first);const page=await first.newPage();await page.goto('/?module=reportes',{waitUntil:'domcontentloaded'});await expect(page.locator('body')).toHaveAttribute('data-route','reportes');const storage=await first.storageState();await first.close();
  const restarted=await browser.newContext({baseURL:BASE_URL,storageState:storage});await seedContext(restarted);const next=await restarted.newPage();await next.goto('/?module=reportes',{waitUntil:'domcontentloaded'});await expect(next.locator('body')).toHaveAttribute('data-route','reportes');await expect(next.locator('#pages')).toBeVisible();await restarted.close();
});

test('PWA manifest and service worker are deployable and refuse sensitive API caching',async({request})=>{
  const manifestResponse=await request.get(`${BASE_URL}/manifest.webmanifest`);expect(manifestResponse.ok()).toBeTruthy();const manifest=await manifestResponse.json();expect(String(manifest.name||manifest.short_name||'')).toMatch(/ContaGest/i);
  const swResponse=await request.get(`${BASE_URL}/sw.js`);expect(swResponse.ok()).toBeTruthy();const sw=await swResponse.text();expect(sw).toMatch(/startsWith\('\/api\/'\)/);expect(sw).toMatch(/isSensitiveRequest/);expect(sw).toMatch(/build-info\.json/);expect(sw).toMatch(/cache:'no-store'/);
});
