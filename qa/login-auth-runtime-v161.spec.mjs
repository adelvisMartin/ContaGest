import { test, expect } from '@playwright/test';

const staleSession={
  sessionMode:'cookie',mode:'cookie',tenantId:'qa-stale-tenant',
  tenant:{id:'qa-stale-tenant',name:'ContaGest QA',rif:'J-00000000-0',plan:'enterprise'},
  user:{id:'qa-user',name:'QA User',fullName:'QA User',email:'qa@contagest.local',role:'admin',permissions:['*']},
  audience:'staff',expiresAt:Date.now()+8*60*60*1000
};
const LOGIN_VIEWPORTS=[{width:360,height:800},{width:390,height:844},{width:430,height:932}];

async function mockCaptcha(page){
  await page.route('**/api/v1/auth/captcha',async(route)=>route.fulfill({
    status:200,contentType:'application/json',
    body:JSON.stringify({ok:true,data:{token:'qa-captcha-token',question:'9 − 3',prompt:'Resuelve 9 menos 3',expiresAt:new Date(Date.now()+300000).toISOString()}})
  }));
}

async function visibleGeometry(page,selector){
  return page.locator(selector).evaluate((node)=>{const r=node.getBoundingClientRect(),s=getComputedStyle(node);return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,display:s.display,gap:s.gap,fontSize:s.fontSize,overflowX:s.overflowX};});
}

test('stale local session is rejected before Veterinaria mounts and intended route is remembered',async({page})=>{
  await page.addInitScript((session)=>localStorage.setItem('contagest_auth_session',JSON.stringify(session)),staleSession);
  await mockCaptcha(page);
  let meCalls=0;
  await page.route('**/api/v1/auth/me',async(route)=>{meCalls+=1;await route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({ok:false,message:'Sesión vencida'})});});
  await page.goto('/?module=veterinaria',{waitUntil:'domcontentloaded'});
  await expect(page.locator('.login-shell-v161')).toBeVisible();
  await expect(page.locator('#veterinaryClinicRoot')).toHaveCount(0);
  expect(meCalls).toBe(1);
  await expect.poll(()=>page.evaluate(()=>localStorage.getItem('contagest_auth_session'))).toBeNull();
  await expect.poll(()=>page.evaluate(()=>sessionStorage.getItem('cg_post_login_route'))).toBe('veterinaria');
});

test('desktop login is compact, aligned and has explicit icon/text spacing',async({page})=>{
  await mockCaptcha(page);
  await page.goto('/?module=login',{waitUntil:'domcontentloaded'});
  await expect(page.locator('.login-shell-v161')).toBeVisible();
  await expect(page.locator('.login-card')).toBeVisible();
  await expect(page.locator('.login-panel')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('Equipo interno');
  await expect(page.locator('body')).not.toContainText('admin@erp.local');

  const audit=await page.evaluate(()=>{
    const width=innerWidth,doc=document.documentElement;
    const visible=(node)=>{const r=node.getBoundingClientRect(),s=getComputedStyle(node);return s.display!=='none'&&s.visibility!=='hidden'&&r.width>1&&r.height>1;};
    const describe=(node)=>({
      tag:node.tagName,
      id:node.id||'',
      name:node.getAttribute('name')||'',
      className:typeof node.className==='string'?node.className:'',
      label:String(node.getAttribute('aria-label')||node.getAttribute('placeholder')||node.textContent||'').replace(/\s+/g,' ').trim().slice(0,80),
      rect:(()=>{const r=node.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};})()
    });
    const overlaps=[];
    const nodes=[...document.querySelectorAll('.login-card input,.login-card button,.login-card summary,.login-card .login-captcha-question')].filter(visible);
    for(let i=0;i<nodes.length;i+=1)for(let j=i+1;j<nodes.length;j+=1){
      if(nodes[i].contains(nodes[j])||nodes[j].contains(nodes[i]))continue;
      const a=nodes[i].getBoundingClientRect(),b=nodes[j].getBoundingClientRect();
      if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>2&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>2)overlaps.push({a:describe(nodes[i]),b:describe(nodes[j])});
    }
    const iconText=[...document.querySelectorAll('.login-kicker,.login-license-details summary>span,.login-privacy,.login-panel-badge,.login-assurance')].filter(visible).map((node)=>({className:node.className,gap:parseFloat(getComputedStyle(node).gap)||0}));
    const title=document.querySelector('.login-panel h2');
    return{overflow:doc.scrollWidth>width+1,overlaps,iconText,titlePx:title?parseFloat(getComputedStyle(title).fontSize):0};
  });
  expect(audit.overflow,JSON.stringify(audit,null,2)).toBe(false);
  expect(audit.overlaps,JSON.stringify(audit,null,2)).toEqual([]);
  expect(audit.iconText.length).toBeGreaterThanOrEqual(4);
  for(const item of audit.iconText)expect(item.gap,JSON.stringify(item)).toBeGreaterThanOrEqual(6);
  expect(audit.titlePx).toBeLessThanOrEqual(40);

  const card=await visibleGeometry(page,'.login-card');
  expect(card.width).toBeLessThanOrEqual(500);
  expect(card.left).toBeGreaterThanOrEqual(0);
  expect(card.right).toBeLessThanOrEqual(1440);
});

for(const viewport of LOGIN_VIEWPORTS){
  test(`mobile login ${viewport.width}px fits viewport and every visible control remains touch-safe`,async({page})=>{
    await page.setViewportSize(viewport);
    await mockCaptcha(page);
    await page.goto('/?module=login',{waitUntil:'domcontentloaded'});
    await expect(page.locator('.login-shell-v161')).toBeVisible();
    await expect(page.locator('.login-panel')).toBeHidden();
    const audit=await page.evaluate(()=>{
      const width=innerWidth;
      const visible=(node)=>{const r=node.getBoundingClientRect(),s=getComputedStyle(node);return s.display!=='none'&&s.visibility!=='hidden'&&r.width>1&&r.height>1;};
      const controls=[...document.querySelectorAll('.login-card button,.login-card summary,.login-card input:not([type="hidden"])')].filter(visible).map((node)=>{const r=node.getBoundingClientRect();return{tag:node.tagName.toLowerCase(),id:node.id||'',label:String(node.getAttribute('aria-label')||node.textContent||node.getAttribute('placeholder')||'').replace(/\s+/g,' ').trim().slice(0,80),width:r.width,height:r.height,left:r.left,right:r.right};});
      return{doc:document.documentElement.scrollWidth,body:document.body.scrollWidth,width,controls};
    });
    expect(audit.doc,JSON.stringify(audit)).toBeLessThanOrEqual(viewport.width+1);
    expect(audit.body,JSON.stringify(audit)).toBeLessThanOrEqual(viewport.width+1);
    for(const control of audit.controls){
      expect(control.height,JSON.stringify(control)).toBeGreaterThanOrEqual(43.5);
      expect(control.left,JSON.stringify(control)).toBeGreaterThanOrEqual(-1);
      expect(control.right,JSON.stringify(control)).toBeLessThanOrEqual(viewport.width+1);
      if(control.tag==='button'&&!control.label)throw new Error(`Botón móvil sin nombre accesible: ${JSON.stringify(control)}`);
    }
  });
}
