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
const QA_ANIMAL={
  id:'qa-animal-00000001',kind:'animal',active:true,displayName:'Apolo',species:'Perro',breed:'Labrador',
  guardianName:'Tutor QA',guardianPhone:'0414-0000000',guardianEmail:'qa@example.test',microchip:'QA-CHIP-001',
  sex:'male',color:'Dorado',allergies:'Sin registro',conditions:'Sin registro',notes:'Paciente representativo para QA visual.'
};
const CONTEXTS=[
  {name:'desktop-light',width:1440,height:900,theme:'light'},
  {name:'desktop-dark',width:1440,height:900,theme:'dark'},
  {name:'mobile-light',width:390,height:844,theme:'light'},
  {name:'mobile-dark',width:390,height:844,theme:'dark'}
];

async function seed(page){
  await page.addInitScript((session)=>localStorage.setItem('contagest_auth_session',JSON.stringify(session)),QA_SESSION);
  await page.route('**/api/v1/**',async(route)=>{
    const request=route.request(),pathname=new URL(request.url()).pathname;
    if(pathname.endsWith('/auth/me'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:QA_SESSION})});
    if(pathname.endsWith('/auth/captcha'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:{token:'qa',question:'2 + 2',prompt:'Resuelve 2 + 2',expiresAt:new Date(Date.now()+300000).toISOString()}})});
    if(pathname.endsWith('/verticals/health/patients')&&request.method()==='GET')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:[QA_ANIMAL]})});
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:request.method()==='GET'?[]:{}})});
  });
}

async function setTheme(page,theme){
  await page.addInitScript((nextTheme)=>{
    const key='contagest_ve_enterprise_v7_state';
    let current={};try{current=JSON.parse(localStorage.getItem(key)||'{}')||{};}catch{}
    localStorage.setItem(key,JSON.stringify({...current,settings:{...(current.settings||{}),theme:nextTheme}}));
  },theme);
}

function inspectComposition(){
  const root=document.querySelector('#pages')||document.querySelector('.login-shell');
  const visible=(node)=>{
    if(!(node instanceof HTMLElement))return false;
    const style=getComputedStyle(node),r=node.getBoundingClientRect();
    return style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity)!==0&&r.width>1&&r.height>1;
  };
  const label=(node)=>String(node?.getAttribute?.('aria-label')||node?.textContent||node?.className||node?.tagName||'').replace(/\s+/g,' ').trim().slice(0,100);
  const findings=[];
  if(!root)return [{kind:'missing-root'}];

  const actions=[...root.querySelectorAll('button,[role="button"],summary')].filter(visible);
  for(const button of actions){
    const rect=button.getBoundingClientRect(),hasText=Boolean(String(button.textContent||'').trim());
    if(hasText&&innerWidth>760&&rect.height>49&&!button.closest('.coordinate-challenge-layer'))findings.push({kind:'oversized-action',target:label(button),height:Math.round(rect.height)});
    if(hasText&&innerWidth<=760&&rect.height>57&&!button.closest('.coordinate-challenge-layer'))findings.push({kind:'oversized-mobile-action',target:label(button),height:Math.round(rect.height)});
    if(innerWidth>760&&button.closest('.cg-vet-dossier-actions')&&rect.height>38)findings.push({kind:'vet-dossier-action-too-tall',target:label(button),height:Math.round(rect.height)});
    const icon=button.querySelector('.MuiButton-startIcon i,.MuiButton-endIcon i,:scope > i,:scope > svg,:scope > span > i,:scope > span > svg');
    if(icon&&visible(icon)){
      const ir=icon.getBoundingClientRect();
      const textRects=[];
      for(const child of button.childNodes){
        if(child.nodeType===Node.TEXT_NODE&&String(child.textContent||'').trim()){
          const range=document.createRange();range.selectNodeContents(child);textRects.push(range.getBoundingClientRect());
        }else if(child instanceof HTMLElement&&!child.contains(icon)&&visible(child)&&String(child.textContent||'').trim())textRects.push(child.getBoundingClientRect());
      }
      for(const tr of textRects){
        const verticalOverlap=Math.min(ir.bottom,tr.bottom)-Math.max(ir.top,tr.top);
        if(verticalOverlap<=0)continue;
        const overlapX=Math.min(ir.right,tr.right)-Math.max(ir.left,tr.left);
        if(overlapX>1){findings.push({kind:'icon-text-overlap',target:label(button),overlap:Math.round(overlapX)});break;}
        if(tr.left>=ir.right){const gap=tr.left-ir.right;if(gap<5)findings.push({kind:'icon-text-too-tight',target:label(button),gap:Math.round(gap*10)/10});}
      }
    }
  }

  const actionGroups=[...root.querySelectorAll('.cgx-page-actions,.cgx-section-actions,.cg-form-actions,.MuiDialogActions-root,.cg-vet-dossier-actions')].filter(visible);
  for(const group of actionGroups){
    const children=[...group.children].filter(visible);if(children.length<2)continue;
    const rects=children.map((child)=>child.getBoundingClientRect()),heights=rects.map((rect)=>rect.height);
    if(Math.max(...heights)-Math.min(...heights)>4)findings.push({kind:'action-height-asymmetry',target:label(group),heights:heights.map(Math.round)});
    for(let i=1;i<rects.length;i+=1){
      const prev=rects[i-1],next=rects[i],sameRow=Math.abs(prev.top-next.top)<4;
      if(sameRow){const gap=next.left-prev.right;if(gap>=0&&gap<6)findings.push({kind:'action-gap-too-tight',target:label(group),gap:Math.round(gap*10)/10});}
    }
    if(innerWidth<=430&&group.classList.contains('cg-vet-dossier-actions')&&rects.length===2&&Math.abs(rects[0].width-rects[1].width)>3)findings.push({kind:'vet-mobile-action-asymmetry',widths:rects.map((rect)=>Math.round(rect.width))});
  }

  const identity=root.querySelector('.cg-vet-identity');
  if(identity&&visible(identity)){
    const children=[...identity.children].filter(visible);
    if(children.length>=2){
      const avatar=children[0].getBoundingClientRect(),copy=children[1].getBoundingClientRect(),gap=copy.left-avatar.right;
      if(gap<11.5)findings.push({kind:'identity-gap-too-tight',gap:Math.round(gap*10)/10});
    }
  }

  const dossierHead=root.querySelector('.cg-vet-dossier-head');
  if(dossierHead&&visible(dossierHead)){
    const children=[...dossierHead.children].filter(visible);
    if(children.length>=2){
      const copy=children[0].getBoundingClientRect(),buttons=children[1].getBoundingClientRect();
      if(buttons.top<copy.bottom){const gap=buttons.left-copy.right;if(gap<14)findings.push({kind:'header-action-proximity',gap:Math.round(gap*10)/10});}
      else {const gap=buttons.top-copy.bottom;if(gap<10)findings.push({kind:'header-action-proximity',gap:Math.round(gap*10)/10});}
    }
  }

  const submit=root.querySelector('.login-submit');
  if(submit&&visible(submit)){
    const rgb=(value)=>{const match=String(value||'').match(/rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)/i);return match?[Number(match[1]),Number(match[2]),Number(match[3])]:null;};
    const luminance=(triplet)=>triplet.map((v)=>{const s=v/255;return s<=.03928?s/12.92:((s+.055)/1.055)**2.4;}).reduce((sum,v,index)=>sum+v*[.2126,.7152,.0722][index],0);
    const style=getComputedStyle(submit),fg=rgb(style.color),bg=rgb(style.backgroundColor);
    if(fg&&bg){const a=luminance(fg),b=luminance(bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);if(ratio<4.5)findings.push({kind:'login-primary-low-contrast',ratio:Math.round(ratio*100)/100});}
  }

  const criticalText=[...root.querySelectorAll('h1,h2,h3,h4,label,button,summary,.cgx-btn,.MuiButton-root,.MuiTab-root')].filter(visible);
  for(const node of criticalText){
    if(node.closest('.MuiTabs-scroller,.table-wrap,.cgx-table-wrap'))continue;
    if(node.scrollWidth>node.clientWidth+3||node.scrollHeight>node.clientHeight+3)findings.push({kind:'critical-text-clipped',target:label(node),client:[node.clientWidth,node.clientHeight],scroll:[node.scrollWidth,node.scrollHeight]});
  }

  return findings.slice(0,30);
}

for(const item of MODULE_VISUAL_CATALOG){
  test(`${item.route} · fine composition desktop/mobile`,async({page})=>{
    await seed(page);
    const failures=[];
    for(const context of CONTEXTS){
      await setTheme(page,context.theme);
      await page.setViewportSize({width:context.width,height:context.height});
      await page.goto(`/?module=${encodeURIComponent(item.route)}`,{waitUntil:'domcontentloaded'});
      await page.waitForSelector(item.standalone?'.login-shell':'#pages',{timeout:20_000});
      await waitForRouteReady(page,item.route,{standalone:item.standalone});
      const findings=await page.evaluate(inspectComposition);
      if(findings.length)failures.push({context:context.name,findings});
    }
    console.log(`[fine-composition] ${item.route} failures=${failures.length}`);
    expect(failures,JSON.stringify(failures,null,2)).toEqual([]);
  });
}
