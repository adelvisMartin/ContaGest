import { test, expect } from '@playwright/test';
import { MODULE_VISUAL_CATALOG } from './support/module-visual-catalog.mjs';
import { auditKeyboardFocus, auditOptionalDialog, visualAudit } from './support/anti-overlap-audit.mjs';

test.setTimeout(240_000);

const VIEWPORTS=[
  {name:'phone-360',width:360,height:800},
  {name:'phone-390',width:390,height:844},
  {name:'phone-430',width:430,height:932},
  {name:'tablet-768',width:768,height:1024},
  {name:'desktop-1366',width:1366,height:768},
  {name:'desktop-1920',width:1920,height:1080}
];
const MODES=['light','dark'];
const LONG_TEXT='Cuenta corporativa con contenido operativo extremadamente largo para validar reflow, clipping y solapamiento · '.repeat(6).trim();
const QA_SESSION={
  sessionMode:'cookie',mode:'cookie',tenantId:'qa-tenant',
  tenant:{id:'qa-tenant',name:LONG_TEXT,rif:'J-00000000-0',plan:'enterprise'},
  user:{id:'qa-admin',name:LONG_TEXT,fullName:LONG_TEXT,email:'qa@contagest.local',role:'admin',permissions:['*']},
  audience:'staff',expiresAt:Date.now()+8*60*60*1000
};

async function seed(page,theme){
  await page.addInitScript(({session,nextTheme})=>{
    localStorage.setItem('contagest_auth_session',JSON.stringify(session));
    localStorage.setItem('contagest_theme',nextTheme);
    const key='contagest_ve_enterprise_v7_state';
    let current={};try{current=JSON.parse(localStorage.getItem(key)||'{}')||{};}catch{}
    localStorage.setItem(key,JSON.stringify({...current,settings:{...(current.settings||{}),theme:nextTheme}}));
    window.confirm=()=>false;
    window.open=()=>null;
  },{session:QA_SESSION,nextTheme:theme});
  await page.route('**/api/v1/**',async(route)=>{
    const request=route.request(),pathname=new URL(request.url()).pathname;
    if(pathname.endsWith('/auth/me'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:QA_SESSION})});
    if(pathname.endsWith('/auth/captcha'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:{token:'qa',question:'2 + 2',prompt:'Resuelve 2 + 2',expiresAt:new Date(Date.now()+300000).toISOString()}})});
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:request.method()==='GET'?[]:{}})});
  });
}

async function openRoute(page,item){
  await page.goto(`/?module=${encodeURIComponent(item.route)}`,{waitUntil:'domcontentloaded'});
  const root=item.standalone?'.login-shell':'#pages';
  await expect(page.locator(root)).toBeAttached({timeout:20_000});
  await expect(page.locator('body')).toHaveAttribute('data-route',item.route,{timeout:20_000});
  if(!item.standalone)await expect(page.locator('#pages')).toHaveAttribute('data-rendered-route',item.route,{timeout:20_000});
  await page.waitForFunction((selector)=>Boolean(document.querySelector(selector)?.textContent?.trim()),root);
}

async function injectExtremeContent(page){
  await page.evaluate((text)=>{
    const root=document.querySelector('#pages')||document.querySelector('.login-shell');
    for(const input of root?.querySelectorAll('input[type="text"],input[type="search"],input[type="email"],textarea')||[]){
      if(!input.disabled&&!input.readOnly&&!input.value)input.value=text;
    }
  },LONG_TEXT);
}

for(const item of MODULE_VISUAL_CATALOG){
  test(`${item.route} · full anti-overlap 58-route matrix`,async({page})=>{
    const failures=[];
    for(const mode of MODES){
      for(const viewport of VIEWPORTS){
        await seed(page,mode);
        await page.setViewportSize({width:viewport.width,height:viewport.height});
        await openRoute(page,item);
        await injectExtremeContent(page);

        const findings=await page.evaluate(visualAudit);
        const focusIssues=await auditKeyboardFocus(page);
        const dialogIssues=await auditOptionalDialog(page);
        if(findings.length||focusIssues.length||dialogIssues.length){
          failures.push({mode,viewport:viewport.name,findings,focusIssues,dialogIssues});
        }

        const effectiveZoomWidth=Math.max(320,Math.floor(viewport.width/2));
        await page.setViewportSize({width:effectiveZoomWidth,height:viewport.height});
        await page.waitForFunction((width)=>document.documentElement.clientWidth===width,effectiveZoomWidth);
        const zoomFindings=await page.evaluate(visualAudit);
        if(zoomFindings.length)failures.push({mode,viewport:viewport.name,zoom:'200%-reflow-proxy',effectiveWidth:effectiveZoomWidth,findings:zoomFindings});
      }
    }
    expect(failures,JSON.stringify(failures,null,2)).toEqual([]);
  });
}
