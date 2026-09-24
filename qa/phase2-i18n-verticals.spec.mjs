import { test, expect } from '@playwright/test';
import { waitForStableLayout } from './support/playwright-determinism.mjs';

async function seed(page, { lang='es', mode='admin', route='dashboard' } = {}) {
  await page.addInitScript(({ lang, mode, route }) => {
    const key='contagest_ve_enterprise_v7_state';
    const state={ route, settings:{ theme:'light', lang, businessMode:mode, sidebarCollapsed:false, reportCurrency:'dual', supportWidget:'peek' }, rbac:null };
    localStorage.setItem(key, JSON.stringify(state));
    localStorage.setItem('contagest_auth_session', JSON.stringify({ sessionMode:'cookie', mode:'cookie', tenantId:'qa-tenant', tenant:{id:'qa-tenant',name:'ContaGest QA',rif:'J-00000000-0',plan:'enterprise'}, user:{id:'qa-admin',name:'QA Admin',fullName:'QA Admin',email:'qa@contagest.local',role:'admin',permissions:['*']}, audience:'staff', expiresAt:Date.now()+8*60*60*1000 }));
  }, { lang, mode, route });
}

async function open(page, options={}) {
  await seed(page, options);
  await page.goto(`/?module=${options.route || 'dashboard'}`, { waitUntil:'domcontentloaded' });
  await page.waitForSelector('.hf-app-topbar', { state:'visible' });
}

test('global language controls expose six languages including Portuguese', async ({ page }) => {
  await open(page, { lang:'es' });
  await page.locator('#btnUserMenu').click();
  const values=await page.locator('#userMenuLang option').evaluateAll((nodes)=>nodes.map((node)=>node.value));
  expect(values).toEqual(['es','en','pt','zh','hi','ar']);
});

test('Portuguese uses pt-BR locale without document overflow', async ({ page }) => {
  await page.setViewportSize({ width:390, height:844 });
  await open(page, { lang:'pt' });
  await expect(page.locator('html')).toHaveAttribute('lang','pt-BR');
  const width=await page.evaluate(()=>({ viewport:innerWidth, doc:document.documentElement.scrollWidth, body:document.body.scrollWidth }));
  expect(width.doc).toBeLessThanOrEqual(width.viewport+1);
  expect(width.body).toBeLessThanOrEqual(width.viewport+1);
});

test('Arabic enables RTL without document overflow', async ({ page }) => {
  await page.setViewportSize({ width:390, height:844 });
  await open(page, { lang:'ar' });
  await expect(page.locator('html')).toHaveAttribute('dir','rtl');
  const width=await page.evaluate(()=>({ viewport:innerWidth, doc:document.documentElement.scrollWidth, body:document.body.scrollWidth }));
  expect(width.doc).toBeLessThanOrEqual(width.viewport+1);
  expect(width.body).toBeLessThanOrEqual(width.viewport+1);
});

test('clinic context applies medical palette tokens', async ({ page }) => {
  await open(page, { mode:'salud', route:'salud' });
  const audit=await page.evaluate(()=>({ route:document.body.dataset.route, mode:document.body.dataset.businessMode, primary:getComputedStyle(document.body).getPropertyValue('--cg-primary').trim() }));
  expect(audit.route).toBe('salud');
  expect(audit.mode).toBe('salud');
  expect(audit.primary).toBe('#0f6f8d');
});

test('psychology context applies calm domain palette', async ({ page }) => {
  await open(page, { mode:'psicologia', route:'psicologia' });
  const primary=await page.evaluate(()=>getComputedStyle(document.body).getPropertyValue('--cg-primary').trim());
  expect(primary).toBe('#6f4b8b');
});

test('veterinary and sales contexts keep Inter as their UI family', async ({ page }) => {
  await open(page, { mode:'veterinaria', route:'veterinaria' });
  await waitForStableLayout(page,'#pages');
  const vetFont=await page.evaluate(()=>getComputedStyle(document.body).fontFamily.toLowerCase());
  expect(vetFont).toContain('inter');
  await page.goto('/?module=ventas', { waitUntil:'domcontentloaded' });
  await page.waitForSelector('.cg-sales-workspace', { state:'visible' });
  const salesPrimary=await page.evaluate(()=>getComputedStyle(document.body).getPropertyValue('--cg-primary').trim());
  expect(salesPrimary).toBe('#3157c8');
});
