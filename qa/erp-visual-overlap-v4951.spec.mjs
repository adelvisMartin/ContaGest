import { test, expect } from '@playwright/test';

const ROUTES=['odontologia','veterinaria','gimnasio','rutinas','nutricion'];
const ROUTE_READY_SELECTOR={
  odontologia:'#dentistryReactRoot .cg-dentistry-workspace',
  veterinaria:'#veterinaryUnifiedRoot .cg-vet-dossier',
  gimnasio:'#gymReactRoot .cg-gym-page',
  rutinas:'#gymReactRoot .cg-gym-page',
  nutricion:'#gymReactRoot .cg-gym-page'
};
const VIEWPORTS=[
  {name:'phone-360',width:360,height:800},
  {name:'phone-390',width:390,height:844},
  {name:'phone-430',width:430,height:932},
  {name:'tablet-768',width:768,height:1024},
  {name:'desktop-1366',width:1366,height:768},
  {name:'desktop-1920',width:1920,height:1080}
];
const MODES=['light','dark'];
const LONG_TEXT='Cuenta corporativa veterinaria odontológica y gimnasio · '.repeat(8).trim();
const QA_SESSION={
  sessionMode:'cookie',
  mode:'cookie',
  tenantId:'qa-tenant',
  tenant:{id:'qa-tenant',name:LONG_TEXT,rif:'J-00000000-0',plan:'enterprise'},
  user:{id:'qa-admin',name:LONG_TEXT,fullName:LONG_TEXT,email:'qa@contagest.local',role:'admin',permissions:['*']},
  audience:'staff',
  expiresAt:Date.now()+8*60*60*1000
};

async function seed(page,mode){
  await page.addInitScript(({session,theme})=>{
    localStorage.setItem('contagest_auth_session',JSON.stringify(session));
    localStorage.setItem('contagest_theme',theme);
  },{session:QA_SESSION,theme:mode});
  await page.route('**/api/v1/**',async(route)=>{
    const pathname=new URL(route.request().url()).pathname;
    if(pathname.endsWith('/auth/me')){
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:QA_SESSION})});
    }
    return route.fulfill({
      status:200,
      contentType:'application/json',
      body:JSON.stringify({ok:true,data:route.request().method()==='GET'?[]:{}})
    });
  });
}

function visualAudit(){
  const root=document.querySelector('#pages');
  const allowedOverflow='.table-wrap,.pl-table-wrap,.ds-table-wrap,.cgv-table-shell,.cgx-table-wrap,.MuiTableContainer-root,.MuiTabs-root,.MuiTabs-scroller,[role="tablist"],.cg-vertical-tabs,.cg-gym-v1124-tabs,.page-tabs,.cgx-tabs';
  const visible=(el)=>{
    const r=el.getBoundingClientRect();
    const s=getComputedStyle(el);
    return r.width>1&&r.height>1&&s.display!=='none'&&s.visibility!=='hidden';
  };
  const findings=[];
  if(document.documentElement.scrollWidth>document.documentElement.clientWidth+2){
    findings.push({kind:'document-overflow',scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth});
  }
  const nodes=[...(root?.querySelectorAll('*')||[])].filter(visible);
  for(const node of nodes){
    if(node.closest(allowedOverflow))continue;
    const r=node.getBoundingClientRect();
    if(r.left<-2||r.right>innerWidth+2){
      findings.push({kind:'outside-viewport',tag:node.tagName,left:Math.round(r.left),right:Math.round(r.right),text:String(node.textContent||'').trim().slice(0,80)});
    }
    if(r.width>0&&r.height>0){
      const text=String(node.textContent||'').trim();
      const interactive=node.matches('button,a[href],input,select,textarea,[role="button"],[role="tab"],[role="dialog"]');
      if(text||interactive){
        const visibleLeft=Math.max(0,r.left);
        const visibleRight=Math.min(innerWidth,r.right);
        const visibleTop=Math.max(0,r.top);
        const visibleBottom=Math.min(innerHeight,r.bottom);
        if(visibleRight>visibleLeft&&visibleBottom>visibleTop){
          const centerX=visibleLeft+(visibleRight-visibleLeft)/2;
          const centerY=visibleTop+(visibleBottom-visibleTop)/2;
          const top=document.elementFromPoint(centerX,centerY);
          if(top&&!node.contains(top)&&!top.contains(node)&&!node.closest('[aria-hidden="true"]')){
            const positioned=getComputedStyle(top).position;
            if(['fixed','absolute','sticky'].includes(positioned)){
              findings.push({kind:'occluded-center',tag:node.tagName,by:top.tagName,text:text.slice(0,60)});
            }
          }
        }
      }
    }
    if(findings.length>=20)break;
  }
  if(innerWidth<=430){
    for(const control of [...(root?.querySelectorAll('button,[role="button"],input,select,textarea')||[])].filter(visible)){
      const r=control.getBoundingClientRect();
      if(r.height<43.5) findings.push({kind:'touch-height',height:Math.round(r.height),text:String(control.getAttribute('aria-label')||control.textContent||'').trim().slice(0,60)});
      if(findings.length>=20)break;
    }
  }
  return findings;
}

async function auditKeyboardFocus(page){
  const issues=[];
  for(let i=0;i<12;i+=1){
    await page.keyboard.press('Tab');
    const state=await page.evaluate(()=>{
      const el=document.activeElement;
      if(!el||el===document.body)return null;
      const r=el.getBoundingClientRect();
      return {
        tag:el.tagName,
        text:String(el.getAttribute('aria-label')||el.textContent||'').trim().slice(0,80),
        left:r.left,right:r.right,top:r.top,bottom:r.bottom,
        visible:r.width>1&&r.height>1
      };
    });
    if(state&&(!state.visible||state.left<-2||state.right>await page.evaluate(()=>innerWidth)+2)){
      issues.push({kind:'focus-clipped',...state});
    }
  }
  return issues;
}

async function auditOptionalDialog(page){
  const triggers=page.getByRole('button',{name:/nuevo|nueva|crear|agregar|registrar/i});
  let trigger=null;
  for(let index=0;index<await triggers.count();index+=1){
    const candidate=triggers.nth(index);
    if(await candidate.isVisible().catch(()=>false)&&await candidate.isEnabled().catch(()=>false)){trigger=candidate;break;}
  }
  if(!trigger)return [];
  await trigger.click({timeout:5_000});
  const dialog=page.getByRole('dialog').first();
  if(!(await dialog.count())||!(await dialog.isVisible().catch(()=>false)))return [];
  const box=await dialog.boundingBox();
  const viewport=page.viewportSize();
  const issues=[];
  if(box&&viewport&&(box.x<-2||box.x+box.width>viewport.width+2||box.y<-2||box.y+box.height>viewport.height+2)){
    issues.push({kind:'dialog-clipped',box,viewport});
  }
  await page.keyboard.press('Escape');
  return issues;
}

for(const route of ROUTES){
  test(`49/51 ${route} visual overlap matrix`,async({page})=>{
    const failures=[];
    for(const mode of MODES){
      await seed(page,mode);
      for(const viewport of VIEWPORTS){
        await page.setViewportSize({width:viewport.width,height:viewport.height});
        await page.goto(`/?module=${route}`,{waitUntil:'domcontentloaded'});
        await expect(page.locator('#pages')).toBeAttached();
        await expect(page.locator(ROUTE_READY_SELECTOR[route]).first()).toBeAttached({timeout:20_000});
        await page.evaluate((text)=>{
          for(const input of document.querySelectorAll('#pages input[type="text"],#pages textarea')){
            if(!input.disabled&&!input.readOnly&&!input.value)input.value=text;
          }
        },LONG_TEXT);

        const findings=await page.evaluate(visualAudit);
        const focusIssues=await auditKeyboardFocus(page);
        const dialogIssues=await auditOptionalDialog(page);
        if(findings.length||focusIssues.length||dialogIssues.length){
          failures.push({mode,viewport:viewport.name,findings,focusIssues,dialogIssues});
        }

        const effectiveZoomWidth=Math.max(320,Math.floor(viewport.width/2));
        await page.setViewportSize({width:effectiveZoomWidth,height:viewport.height});
        await page.evaluate(()=>new Promise((resolve)=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        const zoomFindings=await page.evaluate(visualAudit);
        if(zoomFindings.length)failures.push({mode,viewport:viewport.name,zoom:'200%-reflow-proxy',effectiveWidth:effectiveZoomWidth,findings:zoomFindings});
        await page.setViewportSize({width:viewport.width,height:viewport.height});
      }
    }
    expect(failures,JSON.stringify(failures,null,2)).toEqual([]);
  });
}
