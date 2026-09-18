import { test, expect } from '@playwright/test';

const ROUTES=['odontologia','veterinaria','gimnasio','rutinas','nutricion'];
const VIEWPORTS=[
  {name:'phone-360',width:360,height:800},
  {name:'phone-390',width:390,height:844},
  {name:'phone-430',width:430,height:932},
  {name:'tablet-768',width:768,height:1024},
  {name:'desktop-1366',width:1366,height:768}
];
const QA_SESSION={sessionMode:'cookie',mode:'cookie',tenantId:'qa-tenant',tenant:{id:'qa-tenant',name:'ContaGest QA',rif:'J-00000000-0',plan:'enterprise'},user:{id:'qa-admin',name:'QA Admin',fullName:'QA Admin',email:'qa@contagest.local',role:'admin',permissions:['*']},audience:'staff',expiresAt:Date.now()+8*60*60*1000};

async function seed(page){
  await page.addInitScript((session)=>localStorage.setItem('contagest_auth_session',JSON.stringify(session)),QA_SESSION);
  await page.route('**/api/v1/**',async(route)=>{
    const pathname=new URL(route.request().url()).pathname;
    if(pathname.endsWith('/auth/me'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:QA_SESSION})});
    const data=route.request().method()==='GET'?[]:{};
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data})});
  });
}

function geometryAudit(){
  const root=document.querySelector('#pages');
  const intentional='.table-wrap,.pl-table-wrap,.ds-table-wrap,.cgv-table-shell,.cgx-table-wrap,.MuiTableContainer-root,.cg-vertical-tabs,.cg-gym-v1124-tabs,.page-tabs,.cgx-tabs';
  const visible=(el)=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>1&&r.height>1&&s.display!=='none'&&s.visibility!=='hidden';};
  const findings=[];
  if(document.documentElement.scrollWidth>document.documentElement.clientWidth+2)findings.push({kind:'document-overflow',scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth});
  for(const node of [...(root?.querySelectorAll('*')||[])].filter(visible)){
    if(node.closest(intentional))continue;
    const r=node.getBoundingClientRect();
    if(r.left<-2||r.right>innerWidth+2){
      findings.push({kind:'outside-viewport',tag:node.tagName,className:String(node.className||'').slice(0,100),left:Math.round(r.left),right:Math.round(r.right)});
      if(findings.length>=12)break;
    }
  }
  if(innerWidth<=430){
    for(const control of [...(root?.querySelectorAll('button,[role="button"]')||[])].filter(visible)){
      const r=control.getBoundingClientRect();
      if(r.height<43.5)findings.push({kind:'touch-height',text:String(control.textContent||control.getAttribute('aria-label')||'').trim().slice(0,80),height:Math.round(r.height)});
    }
  }
  return findings;
}

for(const route of ROUTES){
  test(`2/51 ${route} has no Wave A P0/P1 geometry defect`,async({page})=>{
    await seed(page);
    const failures=[];
    for(const viewport of VIEWPORTS){
      await page.setViewportSize({width:viewport.width,height:viewport.height});
      await page.goto(`/?module=${route}`,{waitUntil:'domcontentloaded'});
      await expect(page.locator('#pages')).toBeAttached();
      await expect(page.locator('#pages .cgx-module-standard').first()).toBeAttached({timeout:20_000});
      const findings=await page.evaluate(geometryAudit);
      if(findings.length)failures.push({viewport:viewport.name,findings});
    }
    expect(failures,JSON.stringify(failures,null,2)).toEqual([]);
  });
}
