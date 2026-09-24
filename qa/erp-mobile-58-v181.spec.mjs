import { test, expect } from '@playwright/test';
import { MODULE_VISUAL_CATALOG } from './support/module-visual-catalog.mjs';
import { waitForRouteReady } from './support/playwright-determinism.mjs';

const VIEWPORTS=[{width:360,height:800},{width:390,height:844},{width:430,height:932}];
const QA_SESSION={sessionMode:'cookie',mode:'cookie',tenantId:'qa-tenant',tenant:{id:'qa-tenant',name:'ContaGest QA',rif:'J-00000000-0',plan:'enterprise'},user:{id:'qa-admin',name:'QA Admin',fullName:'QA Admin',email:'qa@contagest.local',role:'admin',permissions:['*']},audience:'staff',expiresAt:Date.now()+8*60*60*1000};

async function seed(page){
  await page.addInitScript((session)=>localStorage.setItem('contagest_auth_session',JSON.stringify(session)),QA_SESSION);
  await page.route('**/api/v1/**',async(route)=>{
    const pathname=new URL(route.request().url()).pathname;
    if(pathname.endsWith('/auth/me'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:QA_SESSION})});
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:route.request().method()==='GET'?[]:{}})});
  });
}

function auditMobile(){
  const root=document.querySelector('#pages')||document.querySelector('.login-shell');
  const intentional='.table-wrap,.pl-table-wrap,.ds-table-wrap,.cgv-table-shell,.cgx-table-wrap,.MuiTableContainer-root,.cg-vertical-tabs,.cg-gym-v1124-tabs,.page-tabs,.cgx-tabs';
  const visible=(el)=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>1&&r.height>1&&s.display!=='none'&&s.visibility!=='hidden';};
  const findings=[];
  if(document.documentElement.scrollWidth>innerWidth+2)findings.push({kind:'document-overflow',width:document.documentElement.scrollWidth,viewport:innerWidth});
  for(const node of [...(root?.querySelectorAll('*')||[])].filter(visible)){
    if(node.closest(intentional))continue;
    const r=node.getBoundingClientRect();
    if(r.left<-2||r.right>innerWidth+2){findings.push({kind:'outside-viewport',tag:node.tagName,className:String(node.className||'').slice(0,80),left:Math.round(r.left),right:Math.round(r.right)});if(findings.length>10)break;}
  }
  for(const control of [...(root?.querySelectorAll('button,[role="button"]')||[])].filter(visible)){
    const r=control.getBoundingClientRect();
    if(r.height<43.5)findings.push({kind:'touch-height',text:String(control.textContent||control.getAttribute('aria-label')||'').trim().slice(0,80),height:Math.round(r.height)});
    const icon=control.querySelector(':scope > i,:scope > svg');
    if(icon&&String(control.textContent||'').trim()){
      const style=getComputedStyle(control);if(parseFloat(style.columnGap||style.gap||'0')<4)findings.push({kind:'icon-label-gap',text:String(control.textContent||'').trim().slice(0,80)});
    }
  }
  return findings;
}

for(const item of MODULE_VISUAL_CATALOG){
  test(`${item.route} mobile contract 360/390/430`,async({page})=>{
    await seed(page);const failures=[];
    for(const viewport of VIEWPORTS){
      await page.setViewportSize(viewport);
      await page.goto(`/?module=${encodeURIComponent(item.route)}`,{waitUntil:'domcontentloaded'});
      await page.waitForSelector(item.standalone?'.login-shell':'#pages',{state:'attached',timeout:20_000});
      await waitForRouteReady(page,item.route,{standalone:item.standalone});
      const findings=await page.evaluate(auditMobile);
      if(findings.length)failures.push({viewport,findings});
    }
    expect(failures,JSON.stringify(failures,null,2)).toEqual([]);
  });
}
