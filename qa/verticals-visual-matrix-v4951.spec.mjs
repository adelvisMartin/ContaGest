import { test, expect } from '@playwright/test';

test.setTimeout(180_000);

const ROUTES=['odontologia','veterinaria','gimnasio','rutinas','nutricion'];
const VIEWPORTS=[
  {name:'phone-360',width:360,height:800,touch:true},
  {name:'phone-390',width:390,height:844,touch:true},
  {name:'phone-430',width:430,height:932,touch:true},
  {name:'tablet-768',width:768,height:1024,touch:true},
  {name:'desktop-1366',width:1366,height:768,touch:false}
];
const THEMES=['light','dark'];
const QA_SESSION={
  sessionMode:'cookie',mode:'cookie',tenantId:'qa-tenant',
  tenant:{id:'qa-tenant',name:'ContaGest QA',rif:'J-00000000-0',plan:'enterprise'},
  user:{id:'qa-admin',name:'QA Admin',fullName:'QA Admin',email:'qa@contagest.local',role:'admin',permissions:['*']},
  audience:'staff',expiresAt:Date.now()+8*60*60*1000
};

async function seed(page){
  await page.addInitScript((session)=>{
    localStorage.setItem('contagest_auth_session',JSON.stringify(session));
    window.confirm=()=>false;
    window.open=()=>null;
  },QA_SESSION);
  await page.route('**/api/v1/**',async(route)=>{
    const request=route.request();
    const pathname=new URL(request.url()).pathname;
    if(pathname.endsWith('/auth/me')){
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:QA_SESSION})});
    }
    const data=request.method()==='GET'?[]:{};
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data})});
  });
}

async function persistTheme(page,theme){
  await page.addInitScript((themeName)=>{
    const key='contagest_ve_enterprise_v7_state';
    let previous={};
    try{previous=JSON.parse(localStorage.getItem(key)||'{}')||{};}catch{}
    localStorage.setItem(key,JSON.stringify({...previous,settings:{...(previous.settings||{}),theme:themeName}}));
  },theme);
}

function visualAudit({touch}){
  const root=document.querySelector('#pages');
  const findings=[];
  const allowedOverflow='.table-wrap,.pl-table-wrap,.ds-table-wrap,.cgv-table-shell,.cgx-table-wrap,.MuiTableContainer-root,.MuiTabs-scroller,.cg-vertical-tabs,.cg-gym-v1124-tabs,.page-tabs,.cgx-tabs,[data-qa-allow-overflow]';
  const interactiveSelector='button:not([disabled]),[role="button"]:not([aria-disabled="true"]),a[href],input:not([type="hidden"]):not([disabled]),select:not([disabled]),textarea:not([disabled]),summary';
  const visible=(node)=>{
    if(!(node instanceof HTMLElement))return false;
    const style=getComputedStyle(node),r=node.getBoundingClientRect();
    return style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity||1)>0&&r.width>1&&r.height>1;
  };
  const label=(node)=>String(node.getAttribute?.('aria-label')||node.textContent||node.getAttribute?.('placeholder')||node.id||node.className||node.tagName||'')
    .replace(/\s+/g,' ').trim().slice(0,120);
  const overlap=(a,b)=>{
    const x=Math.min(a.right,b.right)-Math.max(a.left,b.left);
    const y=Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top);
    return{x,y,area:Math.max(0,x)*Math.max(0,y)};
  };

  if(!root||!String(root.textContent||'').trim())findings.push({kind:'empty-view'});
  if(document.documentElement.scrollWidth>innerWidth+2){
    findings.push({kind:'document-overflow',scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth});
  }

  const ids=[...document.querySelectorAll('[id]')].map((node)=>node.id).filter(Boolean);
  const duplicateIds=[...new Set(ids.filter((id,index)=>ids.indexOf(id)!==index))];
  if(duplicateIds.length)findings.push({kind:'duplicate-id',ids:duplicateIds.slice(0,20)});

  const outside=[...(root?.querySelectorAll('*')||[])]
    .filter(visible)
    .filter((node)=>!node.closest(allowedOverflow))
    .filter((node)=>{
      const r=node.getBoundingClientRect();
      return r.left<-2||r.right>innerWidth+2;
    })
    .slice(0,20)
    .map((node)=>({target:label(node),left:Math.round(node.getBoundingClientRect().left),right:Math.round(node.getBoundingClientRect().right)}));
  if(outside.length)findings.push({kind:'outside-viewport',items:outside});

  const interactives=[...(root?.querySelectorAll(interactiveSelector)||[])]
    .filter(visible)
    .filter((node)=>!node.parentElement?.closest(interactiveSelector));

  if(touch){
    for(const node of interactives){
      const r=node.getBoundingClientRect();
      const hasText=Boolean(String(node.textContent||node.getAttribute('aria-label')||'').trim());
      if(r.height<43.5||(r.width<43.5&&!hasText)){
        findings.push({kind:'touch-target',target:label(node),width:Math.round(r.width),height:Math.round(r.height)});
      }
    }
  }

  for(let i=0;i<interactives.length;i+=1){
    const a=interactives[i];
    const ar=a.getBoundingClientRect();
    for(let j=i+1;j<interactives.length;j+=1){
      const b=interactives[j];
      if(a.contains(b)||b.contains(a))continue;
      if(a.closest(allowedOverflow)!==null&&b.closest(allowedOverflow)!==null)continue;
      const br=b.getBoundingClientRect();
      const hit=overlap(ar,br);
      if(hit.area>4&&hit.x>1&&hit.y>1){
        findings.push({kind:'interactive-overlap',a:label(a),b:label(b),overlapX:Math.round(hit.x),overlapY:Math.round(hit.y)});
        if(findings.filter((item)=>item.kind==='interactive-overlap').length>=20)break;
      }
    }
  }

  for(const button of [...(root?.querySelectorAll('button,[role="button"]')||[])].filter(visible)){
    const icon=button.querySelector(':scope > svg,:scope > i,:scope > [aria-hidden="true"]');
    if(!icon||!visible(icon))continue;
    const ir=icon.getBoundingClientRect();
    const textRects=[];
    for(const child of button.childNodes){
      if(child.nodeType===Node.TEXT_NODE&&String(child.textContent||'').trim()){
        const range=document.createRange();
        range.selectNodeContents(child);
        textRects.push(range.getBoundingClientRect());
      }else if(child instanceof HTMLElement&&child!==icon&&visible(child)&&String(child.textContent||'').trim()){
        textRects.push(child.getBoundingClientRect());
      }
    }
    if(textRects.some((tr)=>overlap(ir,tr).area>4)findings.push({kind:'icon-label-overlap',target:label(button)});
  }

  const operationalText=[...(root?.querySelectorAll('h1,h2,h3,h4,p,label,button,summary,.MuiChip-label,.MuiTab-root')||[])].filter(visible);
  for(const node of operationalText){
    if(node.closest(allowedOverflow))continue;
    const style=getComputedStyle(node);
    if(style.overflow==='hidden'&&(node.scrollWidth>node.clientWidth+3||node.scrollHeight>node.clientHeight+3)){
      findings.push({kind:'clipped-operational-text',target:label(node),width:[node.clientWidth,node.scrollWidth],height:[node.clientHeight,node.scrollHeight]});
      if(findings.filter((item)=>item.kind==='clipped-operational-text').length>=20)break;
    }
  }

  return findings;
}

for(const route of ROUTES){
  test('49/51 '+route+' visual anti-overlap matrix',async({page},testInfo)=>{
    await seed(page);
    const failures=[];

    for(const theme of THEMES){
      for(const viewport of VIEWPORTS){
        await persistTheme(page,theme);
        await page.setViewportSize({width:viewport.width,height:viewport.height});
        await page.goto('/?module='+encodeURIComponent(route),{waitUntil:'domcontentloaded'});
        await expect(page.locator('#pages')).toBeAttached();
        await expect(page.locator('#pages .cgx-module-standard').first()).toBeAttached({timeout:20_000});
        await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
        await page.waitForTimeout(route==='veterinaria'?500:180);

        const findings=await page.evaluate(visualAudit,{touch:viewport.touch});
        const name=route+'-'+viewport.name+'-'+theme;
        const screenshot=await page.screenshot({fullPage:true});
        await testInfo.attach(name+'.png',{body:screenshot,contentType:'image/png'});
        await testInfo.attach(name+'.json',{
          body:Buffer.from(JSON.stringify({route,viewport,theme,findings},null,2)),
          contentType:'application/json'
        });
        if(findings.length)failures.push({name,findings});
      }
    }

    expect(failures,JSON.stringify(failures,null,2)).toEqual([]);
  });
}
