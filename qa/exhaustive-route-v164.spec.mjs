import { test, expect } from '@playwright/test';
import { MODULE_VISUAL_CATALOG } from './support/module-visual-catalog.mjs';
import { waitForRouteReady } from './support/playwright-determinism.mjs';

test.setTimeout(180_000);

const QA_SESSION={
  sessionMode:'cookie',mode:'cookie',tenantId:'qa-tenant',
  tenant:{id:'qa-tenant',name:'ContaGest QA',rif:'J-00000000-0',plan:'enterprise'},
  user:{id:'qa-admin',name:'QA Admin',fullName:'QA Admin',email:'qa@contagest.local',role:'admin',permissions:['*']},
  audience:'staff',expiresAt:Date.now()+8*60*60*1000
};

const CONTEXTS=Object.freeze([
  {name:'desktop-light',width:1440,height:900,theme:'light'},
  {name:'desktop-dark',width:1440,height:900,theme:'dark'},
  {name:'laptop-1024-light',width:1024,height:768,theme:'light'},
  {name:'tablet-768-dark',width:768,height:1024,theme:'dark',touch:true},
  {name:'mobile-430-light',width:430,height:932,theme:'light',touch:true},
  {name:'mobile-light',width:390,height:844,theme:'light',touch:true},
  {name:'mobile-dark',width:390,height:844,theme:'dark',touch:true},
  {name:'mobile-edge-360-dark',width:360,height:800,theme:'dark',touch:true}
]);

async function seed(page){
  await page.addInitScript((session)=>{
    localStorage.setItem('contagest_auth_session',JSON.stringify(session));
    window.confirm=()=>false;
    window.open=()=>null;
  },QA_SESSION);
  await page.route('**/api/v1/**',async(route)=>{
    const request=route.request();
    const pathname=new URL(request.url()).pathname;
    if(pathname.endsWith('/auth/me'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:QA_SESSION})});
    if(pathname.endsWith('/auth/captcha'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:{token:'qa-token',question:'2 + 2',prompt:'Resuelve 2 + 2',expiresAt:new Date(Date.now()+300000).toISOString()}})});
    const data=request.method()==='GET'?[]:{};
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data})});
  });
}

async function persistTheme(page,theme){
  if(!page.url().startsWith('http'))return;
  await page.evaluate((themeName)=>{
    const key='contagest_ve_enterprise_v7_state';
    let previous={};
    try{previous=JSON.parse(localStorage.getItem(key)||'{}')||{};}catch{}
    localStorage.setItem(key,JSON.stringify({...previous,settings:{...(previous.settings||{}),theme:themeName}}));
  },theme);
}

async function openRoute(page,item,ctx,index){
  await page.setViewportSize({width:ctx.width,height:ctx.height});
  if(index>0)await persistTheme(page,ctx.theme);
  await page.goto(`/?module=${encodeURIComponent(item.route)}`,{waitUntil:'domcontentloaded'});
  const root=item.standalone?'.login-shell':'#pages';
  await page.waitForSelector(root,{state:'attached',timeout:20_000});
  await waitForRouteReady(page,item.route,{standalone:item.standalone});
  await expect(page.locator('body')).toHaveAttribute('data-route',item.route);
  if(!item.standalone)await expect(page.locator('#pages')).toHaveAttribute('data-rendered-route',item.route);
}

function auditSource(){
  const root=document.querySelector('#pages')||document.querySelector('.login-shell');
  const viewport={width:innerWidth,height:innerHeight};
  const visible=(node)=>{
    if(!(node instanceof HTMLElement))return false;
    const style=getComputedStyle(node),r=node.getBoundingClientRect();
    return style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity)!==0&&r.width>1&&r.height>1;
  };
  const label=(node)=>String(node.getAttribute?.('aria-label')||node.textContent||node.getAttribute?.('placeholder')||node.className||node.tagName||'').replace(/\s+/g,' ').trim().slice(0,120);
  const intentionalScroll='.table-wrap,.pl-table-wrap,.ds-table-wrap,.cgv-table-shell,.cgx-table-wrap,.MuiTableContainer-root,.MuiTabs-scroller,.cg-psychology-workspace .cgx-section-body:has(>.cg-psych-calendar),.cg-kanban,.cg-gym-v1124-tabs,.cg-pos-tabs,.cg-vertical-tabs,.page-tabs,.cgx-tabs,.overflow-x-auto';
  const findings=[];
  if(!root||!String(root.textContent||'').trim())findings.push({kind:'empty-view'});

  const ids=[...document.querySelectorAll('[id]')].map((node)=>node.id).filter(Boolean);
  const duplicates=[...new Set(ids.filter((id,index)=>ids.indexOf(id)!==index))];
  if(duplicates.length)findings.push({kind:'duplicate-ids',ids:duplicates.slice(0,12)});
  if(document.documentElement.scrollWidth>innerWidth+2)findings.push({kind:'document-overflow',scrollWidth:document.documentElement.scrollWidth,innerWidth});

  const textNodes=[...root.querySelectorAll('h1,h2,h3,h4,p,label,button,summary,.cgx-btn,.btn,.cgx-metric-main p,.cgx-metric-main small,.cgx-badge,.badge')].filter(visible);
  for(const node of textNodes){
    if(node.closest(intentionalScroll))continue;
    const style=getComputedStyle(node);
    if(style.overflow==='hidden'&&(node.scrollWidth>node.clientWidth+3||node.scrollHeight>node.clientHeight+3)){
      findings.push({kind:'clipped-operational-text',target:label(node),w:[node.clientWidth,node.scrollWidth],h:[node.clientHeight,node.scrollHeight]});
      if(findings.filter((item)=>item.kind==='clipped-operational-text').length>=12)break;
    }
  }

  const buttons=[...root.querySelectorAll('button,[role="button"],summary,a.cg-whatsapp-float')].filter(visible);
  for(const button of buttons){
    const r=button.getBoundingClientRect();
    if(innerWidth<=430&&(r.height<43.5||(r.width<43.5&&!(button.textContent||'').trim()))){
      findings.push({kind:'touch-target',target:label(button),width:Math.round(r.width),height:Math.round(r.height)});
    }
    const icon=button.querySelector(':scope > i,:scope > svg');
    if(icon&&visible(icon)){
      const ir=icon.getBoundingClientRect();
      const ranges=[];
      for(const child of button.childNodes){
        if(child.nodeType===Node.TEXT_NODE&&String(child.textContent||'').trim()){
          const range=document.createRange();range.selectNodeContents(child);ranges.push(range.getBoundingClientRect());
        }else if(child instanceof HTMLElement&&child!==icon&&visible(child)&&String(child.textContent||'').trim())ranges.push(child.getBoundingClientRect());
      }
      for(const tr of ranges){
        const overlapX=Math.min(ir.right,tr.right)-Math.max(ir.left,tr.left),overlapY=Math.min(ir.bottom,tr.bottom)-Math.max(ir.top,tr.top);
        if(overlapX>1&&overlapY>1){findings.push({kind:'icon-text-overlap',target:label(button),overlapX:Math.round(overlapX),overlapY:Math.round(overlapY)});break;}
      }
    }
  }

  const hosts=[...root.querySelectorAll('[data-cgx-kit="field"],[data-cgx-kit="textarea"],[data-cgx-kit="select"],label')].filter(visible);
  for(const host of hosts){
    const natives=[...host.querySelectorAll(':scope input,:scope textarea,:scope select,input,textarea,select')].filter(visible);
    const mui=[...host.querySelectorAll('.MuiInputBase-root,.MuiFormControl-root')].filter(visible);
    if(natives.length&&mui.length){findings.push({kind:'double-form-layer',target:label(host),native:natives.length,mui:mui.length});break;}
  }

  const rgba=(value)=>{const m=String(value||'').match(/rgba?\((\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)(?:\D+(\d+(?:\.\d+)?))?/);return m?{rgb:[+m[1],+m[2],+m[3]],a:m[4]===undefined?1:+m[4]}:null;};
  const lum=(rgb)=>{const s=rgb.map((v)=>v/255).map((v)=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*s[0]+.7152*s[1]+.0722*s[2];};
  const ratio=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
  const effectiveBg=(node)=>{let current=node;while(current&&current instanceof HTMLElement){const parsed=rgba(getComputedStyle(current).backgroundColor);if(parsed&&parsed.a>.7)return parsed.rgb;current=current.parentElement;}return rgba(getComputedStyle(document.body).backgroundColor)?.rgb||[255,255,255];};
  for(const button of buttons){
    if(!String(button.textContent||'').trim())continue;
    const fg=rgba(getComputedStyle(button).color)?.rgb,bg=effectiveBg(button);
    if(fg&&bg){const value=ratio(fg,bg);if(value<4.5)findings.push({kind:'button-contrast',target:label(button),ratio:Math.round(value*100)/100,color:getComputedStyle(button).color,background:getComputedStyle(button).backgroundColor});}
  }

  const bounds=[...root.querySelectorAll('*')].filter(visible).filter((node)=>!node.closest(intentionalScroll)).filter((node)=>{const r=node.getBoundingClientRect();return r.left<-2||r.right>viewport.width+2;}).slice(0,10).map((node)=>({target:label(node),left:Math.round(node.getBoundingClientRect().left),right:Math.round(node.getBoundingClientRect().right)}));
  if(bounds.length)findings.push({kind:'viewport-overflow',items:bounds});
  return findings;
}

for(const item of MODULE_VISUAL_CATALOG){
  test(`${item.route} · deep desktop/mobile light/dark audit`,async({page})=>{
    await seed(page);
    const routeFindings=[];
    for(let index=0;index<CONTEXTS.length;index+=1){
      const ctx=CONTEXTS[index];
      const pageErrors=[];
      const consoleErrors=[];
      const onPageError=(error)=>pageErrors.push(String(error?.message||error));
      const onConsole=(message)=>{
        const text=message.text();
        if(message.type()==='error'||/React does not recognize|hydration|Received .* for a non-boolean attribute|validateDOMNesting/i.test(text))consoleErrors.push(text);
      };
      page.on('pageerror',onPageError);page.on('console',onConsole);
      try{
        await openRoute(page,item,ctx,index);
        const findings=await page.evaluate(auditSource);
        const htmlTheme=await page.locator('html').getAttribute('data-theme');
        if(htmlTheme!==ctx.theme)findings.push({kind:'theme-mismatch',expected:ctx.theme,actual:htmlTheme});
        if(findings.length||pageErrors.length||consoleErrors.length)routeFindings.push({context:ctx.name,findings,pageErrors,consoleErrors:consoleErrors.slice(0,8)});
      }catch(error){routeFindings.push({context:ctx.name,error:String(error?.message||error),pageErrors,consoleErrors:consoleErrors.slice(0,8)});}
      finally{page.off('pageerror',onPageError);page.off('console',onConsole);}
    }
    console.log(`[route-v164] ${item.route} contexts=${CONTEXTS.length} failures=${routeFindings.length}`);
    expect(routeFindings,JSON.stringify(routeFindings,null,2)).toEqual([]);
  });
}
