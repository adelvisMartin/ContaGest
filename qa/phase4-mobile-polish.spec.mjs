import { test, expect } from '@playwright/test';

async function seed(page, { route='dashboard', mode='admin', theme='dark' } = {}) {
  await page.addInitScript(({ route, mode, theme }) => {
    localStorage.setItem('contagest_ve_enterprise_v7_state', JSON.stringify({ route, settings:{ theme, lang:'es', businessMode:mode, sidebarCollapsed:false, reportCurrency:'dual', supportWidget:'peek', appointmentReminderHours:24 }, rbac:null }));
    localStorage.setItem('contagest_auth_session', JSON.stringify({ sessionMode:'cookie',mode:'cookie',tenantId:'qa-tenant',tenant:{id:'qa-tenant',name:'ContaGest QA',rif:'J-00000000-0',plan:'enterprise'},user:{id:'qa-admin',name:'QA Admin',fullName:'QA Admin',email:'qa@contagest.local',role:'admin',permissions:['*']},audience:'staff',expiresAt:Date.now()+8*60*60*1000 }));
  }, { route, mode, theme });
}

async function open(page, options={}) {
  await seed(page, options);
  await page.goto(`/?module=${options.route || 'dashboard'}`, { waitUntil:'domcontentloaded' });
  await page.waitForSelector('.hf-app-topbar', { state:'visible' });
}

test('mobile header uses icon-only ContaGest mark and centers controls', async ({ page }) => {
  await page.setViewportSize({ width:360, height:800 });
  await open(page);
  await expect(page.locator('.hf-header-brand')).toBeVisible();
  const result=await page.evaluate(()=>{
    const mark=document.querySelector('.hf-header-logo');
    const menu=document.querySelector('#btnOpenSidebar');
    const theme=document.querySelector('#btnTema');
    const rect=(node)=>node?.getBoundingClientRect();
    const style=(node)=>node?getComputedStyle(node):null;
    return {markBg:style(mark)?.backgroundImage||'',mark:rect(mark),menu:rect(menu),theme:rect(theme),menuDisplay:style(menu)?.display,themeDisplay:style(theme)?.display};
  });
  expect(result.markBg).toContain('contagest-mark');
  expect(Math.abs(result.mark.width-result.mark.height)).toBeLessThanOrEqual(1);
  expect(result.menuDisplay).toBe('grid');
  expect(result.themeDisplay).toBe('grid');
});

test('mobile drawer remains opaque and above its backdrop', async ({ page }) => {
  await page.setViewportSize({ width:360, height:800 }); await open(page);
  await page.locator('#btnOpenSidebar').click();
  await expect(page.locator('.hf-app-sidebar')).toBeVisible();
  const audit=await page.evaluate(()=>{
    const drawer=document.querySelector('.hf-app-sidebar'); const backdrop=document.querySelector('#sidebarBackdrop');
    const ds=getComputedStyle(drawer); const bs=getComputedStyle(backdrop);
    return {opacity:ds.opacity,filter:ds.filter,drawerZ:Number(ds.zIndex||0),backdropZ:Number(bs.zIndex||0),drawerBg:ds.backgroundColor};
  });
  expect(audit.opacity).toBe('1');
  expect(audit.filter).toBe('none');
  expect(audit.drawerZ).toBeGreaterThan(audit.backdropZ);
});

test('mobile account/settings popover fits viewport and exposes configuration action', async ({ page }) => {
  await page.setViewportSize({ width:360, height:800 }); await open(page);
  await page.locator('#btnUserMenu').click(); await expect(page.locator('#userMenuPanel')).toBeVisible();
  await expect(page.locator('#userMenuPanel [data-route="configuracion"]')).toBeVisible();
  const box=await page.locator('#userMenuPanel').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x+box.width).toBeLessThanOrEqual(361); expect(box.y+box.height).toBeLessThanOrEqual(801);
});

test('client form labels sit above one outline and RIF badge does not collide', async ({ page }) => {
  await page.setViewportSize({ width:360, height:800 }); await open(page,{route:'clientes'});
  const field=page.locator('#clientForm .cgx-field').first(); const label=field.locator('.cgx-label'); const input=field.locator('.cgx-field-normalized');
  await expect(field).toBeVisible();
  const geometry=await page.evaluate(({fieldSelector,labelSelector,inputSelector})=>{
    const field=document.querySelector(fieldSelector),label=document.querySelector(labelSelector),input=document.querySelector(inputSelector);
    const f=field.getBoundingClientRect(),l=label.getBoundingClientRect(),i=input.getBoundingClientRect(),fs=getComputedStyle(field);
    return {labelBottom:l.bottom,inputTop:i.top,fieldBorder:fs.borderTopWidth,doc:document.documentElement.scrollWidth,viewport:innerWidth};
  },{fieldSelector:'#clientForm .cgx-field',labelSelector:'#clientForm .cgx-field .cgx-label',inputSelector:'#clientForm .cgx-field .cgx-field-normalized'});
  expect(geometry.labelBottom).toBeLessThanOrEqual(geometry.inputTop+1);
  expect(geometry.fieldBorder).toBe('0px');
  expect(geometry.doc).toBeLessThanOrEqual(geometry.viewport+1);
  const rif=page.locator('.cg-inline-pair').first(); if(await rif.count()) { const box=await rif.boundingBox(); expect(box.width).toBeGreaterThan(70); }
});

test('psychology compact pairs stack cleanly on 330px phone', async ({ page }) => {
  await page.setViewportSize({ width:330, height:755 }); await open(page,{route:'psicologia',mode:'psicologia'});
  await expect(page.locator('#psychAppointmentForm')).toBeVisible();
  const columns=await page.locator('#psychAppointmentForm .cg-form-grid-2').first().evaluate((node)=>getComputedStyle(node).gridTemplateColumns.split(' ').filter(Boolean).length);
  expect(columns).toBe(1);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('support widget remains on-screen and interactive in peek mode', async ({ page }) => {
  await page.setViewportSize({ width:360, height:800 }); await open(page);
  const button=page.locator('.cg-whatsapp-float'); await expect(button).toBeVisible();
  const audit=await button.evaluate((node)=>{const r=node.getBoundingClientRect(),s=getComputedStyle(node);return {left:r.left,right:r.right,width:r.width,pointer:s.pointerEvents,href:node.getAttribute('href'),viewport:innerWidth};});
  expect(audit.left).toBeGreaterThanOrEqual(0); expect(audit.right).toBeLessThanOrEqual(audit.viewport+1); expect(audit.width).toBeGreaterThanOrEqual(44); expect(audit.pointer).toBe('auto'); expect(audit.href).toContain('wa.me');
});
