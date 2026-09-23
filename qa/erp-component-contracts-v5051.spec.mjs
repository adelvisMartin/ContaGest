import { test, expect } from '@playwright/test';

const ROUTES=['odontologia','veterinaria','gimnasio','rutinas','nutricion'];
const QA_SESSION={sessionMode:'cookie',mode:'cookie',tenantId:'qa-tenant',tenant:{id:'qa-tenant',name:'ContaGest QA',rif:'J-00000000-0',plan:'enterprise'},user:{id:'qa-admin',name:'QA Admin',fullName:'QA Admin',email:'qa@contagest.local',role:'admin',permissions:['*']},audience:'staff',expiresAt:Date.now()+8*60*60*1000};

async function seed(page){
  await page.addInitScript((session)=>localStorage.setItem('contagest_auth_session',JSON.stringify(session)),QA_SESSION);
  await page.route('**/api/v1/**',async(route)=>{
    const pathname=new URL(route.request().url()).pathname;
    if(pathname.endsWith('/auth/me')) return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:QA_SESSION})});
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:route.request().method()==='GET'?[]:{}})});
  });
}

async function accessibleControlAudit(page){
  return page.evaluate(()=>{
    const root=document.querySelector('#pages');
    const visible=(el)=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>1&&r.height>1&&s.display!=='none'&&s.visibility!=='hidden';};
    const issues=[];
    for(const button of [...(root?.querySelectorAll('button,[role="button"]')||[])].filter(visible)){
      const name=(button.getAttribute('aria-label')||button.getAttribute('title')||button.textContent||'').trim();
      if(!name)issues.push({kind:'unnamed-button',html:button.outerHTML.slice(0,180)});
    }
    for(const field of [...(root?.querySelectorAll('input,textarea,select,[role="combobox"]')||[])].filter(visible)){
      const id=field.id;
      const aria=field.getAttribute('aria-label')||field.getAttribute('aria-labelledby');
      const labelled=id?document.querySelector(`label[for="${CSS.escape(id)}"]`):null;
      if(!aria&&!labelled)issues.push({kind:'unlabelled-field',tag:field.tagName,id:id||null});
    }
    const ids=[...(root?.querySelectorAll('[id]')||[])].map((node)=>node.id).filter(Boolean);
    const duplicates=ids.filter((id,index)=>ids.indexOf(id)!==index);
    for(const id of [...new Set(duplicates)])issues.push({kind:'duplicate-id',id});
    return issues;
  });
}

async function focusAudit(page){
  const issues=[];
  for(let index=0;index<15;index+=1){
    await page.keyboard.press('Tab');
    const state=await page.evaluate(()=>{
      const el=document.activeElement;
      if(!el||el===document.body)return null;
      const r=el.getBoundingClientRect();
      const style=getComputedStyle(el);
      return {tag:el.tagName,left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,outlineStyle:style.outlineStyle,outlineWidth:style.outlineWidth};
    });
    if(state&&(state.width<1||state.height<1||state.left<-2||state.right>innerWidth+2))issues.push({kind:'focus-not-visible',...state});
  }
  return issues;
}

async function reducedMotionAudit(page){
  await page.emulateMedia({reducedMotion:'reduce'});
  return page.evaluate(()=>{
    const root=document.querySelector('#pages');
    const issues=[];
    for(const node of [...(root?.querySelectorAll('*')||[])].slice(0,400)){
      const style=getComputedStyle(node);
      const durations=[style.animationDuration,style.transitionDuration]
        .flatMap((value)=>String(value||'').split(','))
        .map((value)=>value.trim())
        .filter(Boolean);
      for(const duration of durations){
        const ms=duration.endsWith('ms')?Number.parseFloat(duration):duration.endsWith('s')?Number.parseFloat(duration)*1000:0;
        if(Number.isFinite(ms)&&ms>20)issues.push({kind:'motion-not-reduced',tag:node.tagName,duration});
      }
      if(issues.length>=10)break;
    }
    return issues;
  });
}

for(const route of ROUTES){
  test(`50/51 ${route} reusable component accessibility contracts`,async({page})=>{
    await seed(page);
    await page.setViewportSize({width:390,height:844});
    await page.goto(`/?module=${route}`,{waitUntil:'domcontentloaded'});
    await expect(page.locator('#pages .cgx-module-standard').first()).toBeAttached({timeout:20_000});
    const controlIssues=await accessibleControlAudit(page);
    const focusIssues=await focusAudit(page);
    const motionIssues=await reducedMotionAudit(page);
    expect({controlIssues,focusIssues,motionIssues},JSON.stringify({controlIssues,focusIssues,motionIssues},null,2)).toEqual({controlIssues:[],focusIssues:[],motionIssues:[]});
  });
}
