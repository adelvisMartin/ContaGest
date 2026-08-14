import { test, expect } from '@playwright/test';

async function seed(page, { route='dashboard', mode='admin', lang='es', collapsed=false } = {}) {
  await page.addInitScript(({ route, mode, lang, collapsed }) => {
    const key='contagest_ve_enterprise_v7_state';
    localStorage.setItem(key, JSON.stringify({ route, settings:{ theme:'light', lang, businessMode:mode, sidebarCollapsed:collapsed, reportCurrency:'dual', supportWidget:'peek', appointmentReminderHours:24 }, rbac:null }));
    localStorage.setItem('contagest_auth_session', JSON.stringify({ sessionMode:'cookie',mode:'cookie',tenantId:'qa-tenant',tenant:{id:'qa-tenant',name:'ContaGest QA',rif:'J-00000000-0',plan:'enterprise'},user:{id:'qa-admin',name:'QA Admin',fullName:'QA Admin',email:'qa@contagest.local',role:'admin',permissions:['*']},audience:'staff',expiresAt:Date.now()+8*60*60*1000 }));
  }, { route, mode, lang, collapsed });
}

async function open(page, options={}) {
  await seed(page, options);
  await page.goto(`/?module=${options.route || 'dashboard'}`, { waitUntil:'domcontentloaded' });
  await page.waitForSelector('.hf-app-topbar', { state:'visible' });
}

for (const viewport of [
  { name:'compact-desktop', width:1024, height:768 },
  { name:'laptop', width:1366, height:768 },
  { name:'desktop', width:1440, height:900 }
]) {
  test(`shell fits viewport with sidebar open on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width:viewport.width, height:viewport.height });
    await open(page);
    const audit=await page.evaluate(()=>{
      const sidebar=document.querySelector('.hf-app-sidebar').getBoundingClientRect();
      const main=document.querySelector('.hf-app-main').getBoundingClientRect();
      const header=document.querySelector('.hf-app-topbar').getBoundingClientRect();
      return { viewport:innerWidth,doc:document.documentElement.scrollWidth,sidebarRight:Math.round(sidebar.right),mainLeft:Math.round(main.left),mainRight:Math.round(main.right),headerLeft:Math.round(header.left),headerRight:Math.round(header.right) };
    });
    expect(audit.doc).toBeLessThanOrEqual(audit.viewport+1);
    expect(Math.abs(audit.sidebarRight-audit.mainLeft)).toBeLessThanOrEqual(1);
    expect(audit.mainRight).toBeLessThanOrEqual(audit.viewport+1);
    expect(audit.headerRight).toBeLessThanOrEqual(audit.viewport+1);
  });
}

test('desktop collapsed sidebar gives main and header the complete viewport', async ({ page }) => {
  await page.setViewportSize({ width:1366, height:768 });
  await open(page, { collapsed:true });
  const audit=await page.evaluate(()=>{ const main=document.querySelector('.hf-app-main').getBoundingClientRect(); const header=document.querySelector('.hf-app-topbar').getBoundingClientRect(); return {mainLeft:Math.round(main.left),mainRight:Math.round(main.right),headerLeft:Math.round(header.left),headerRight:Math.round(header.right),viewport:innerWidth}; });
  expect(audit.mainLeft).toBe(0); expect(audit.headerLeft).toBe(0); expect(audit.mainRight).toBe(audit.viewport); expect(audit.headerRight).toBe(audit.viewport);
});

test('sidebar wordmark is visible and header avoids duplicate product name', async ({ page }) => {
  await page.setViewportSize({ width:1366, height:768 }); await open(page);
  await expect(page.locator('.hf-sidebar-wordmark h1')).toHaveText('ContaGest-VE');
  await expect(page.locator('.hf-topbar-left')).not.toContainText('ContaGest-VE');
  const visible=await page.evaluate(()=>{ const title=document.querySelector('.hf-sidebar-wordmark h1').getBoundingClientRect(); const sidebar=document.querySelector('.hf-app-sidebar').getBoundingClientRect(); return title.left>=sidebar.left && title.right<=sidebar.right+1; });
  expect(visible).toBeTruthy();
});

test('BCV header is compact and does not repeat daily-rate labels', async ({ page }) => {
  await open(page); await expect(page.locator('.hf-rate-compact')).toHaveCount(1); await expect(page.locator('.hf-rate-source')).toHaveCount(0);
  const text=await page.locator('.hf-app-topbar').innerText(); expect((text.match(/Tasa del día/gi)||[]).length).toBe(0);
});

test('user configuration popover stays inside viewport', async ({ page }) => {
  await page.setViewportSize({ width:1024, height:768 }); await open(page); await page.locator('#btnUserMenu').click(); await expect(page.locator('#userMenuPanel')).toBeVisible();
  const box=await page.locator('#userMenuPanel').boundingBox(); expect(box).not.toBeNull(); expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0); expect(box.x+box.width).toBeLessThanOrEqual(1025); expect(box.y+box.height).toBeLessThanOrEqual(769);
});

test('KPI strip wraps instead of clipping values', async ({ page }) => {
  await page.setViewportSize({ width:1024, height:768 }); await open(page);
  const clipped=await page.locator('.hf-kpi-strip strong').evaluateAll((nodes)=>nodes.filter((node)=>node.scrollWidth>node.clientWidth+1).length); expect(clipped).toBe(0);
});

test('phone shell and psychology workspace have no document overflow', async ({ page }) => {
  await page.setViewportSize({ width:390, height:844 }); await open(page, { route:'psicologia', mode:'psicologia' });
  await expect(page.locator('#psychPatientForm')).toBeVisible(); await expect(page.locator('#psychAppointmentForm')).toBeVisible();
  const width=await page.evaluate(()=>({doc:document.documentElement.scrollWidth,body:document.body.scrollWidth,viewport:innerWidth})); expect(width.doc).toBeLessThanOrEqual(width.viewport+1); expect(width.body).toBeLessThanOrEqual(width.viewport+1);
});

test('WhatsApp support defaults to discreet edge mode', async ({ page }) => {
  await open(page); await expect(page.locator('.cg-whatsapp-float')).toHaveClass(/cg-whatsapp-peek/);
});
