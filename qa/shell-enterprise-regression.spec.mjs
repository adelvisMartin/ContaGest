import { test, expect } from '@playwright/test';
import { waitForStableLayout } from './support/playwright-determinism.mjs';

async function seedAuthenticatedUi(page) {
  await page.addInitScript(() => {
    localStorage.setItem('contagest_auth_session', JSON.stringify({
      sessionMode:'cookie', mode:'cookie', tenantId:'qa-tenant',
      tenant:{ id:'qa-tenant', name:'ContaGest QA', rif:'J-00000000-0', plan:'enterprise' },
      user:{ id:'qa-admin', name:'QA Admin', fullName:'QA Admin', email:'qa@contagest.local', role:'admin', permissions:['*'] },
      audience:'staff', expiresAt:Date.now() + 8 * 60 * 60 * 1000
    }));
  });
}

async function openDashboard(page) {
  await seedAuthenticatedUi(page);
  await page.goto('/?module=dashboard', { waitUntil:'domcontentloaded' });
  await page.waitForSelector('.hf-app-topbar', { state:'visible' });
  await waitForStableLayout(page,'.hf-app-topbar');
}

const rect = (page, selector) => page.locator(selector).evaluate((node) => {
  const r=node.getBoundingClientRect();
  return { left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width, height:r.height };
});

const overlap = (a,b) => Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left)) > 1
  && Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)) > 1;

test.describe('enterprise shell desktop geometry', () => {
  test.use({ viewport:{ width:1920, height:1080 } });

  test('open sidebar reduces main area and header still reaches its right edge', async ({ page }) => {
    await openDashboard(page);
    const sidebar=await rect(page,'.hf-app-sidebar');
    const main=await rect(page,'.hf-app-main');
    const header=await rect(page,'.hf-app-topbar');
    expect(sidebar.width).toBeGreaterThanOrEqual(246);
    expect(sidebar.width).toBeLessThanOrEqual(250);
    expect(Math.abs(main.left-sidebar.right)).toBeLessThanOrEqual(2);
    expect(Math.abs(header.left-main.left)).toBeLessThanOrEqual(2);
    expect(Math.abs(header.right-main.right)).toBeLessThanOrEqual(2);
    expect(Math.abs(header.right-1920)).toBeLessThanOrEqual(2);
  });

  test('collapsed sidebar restores main/header to 100% viewport width', async ({ page }) => {
    await openDashboard(page);
    await page.locator('#btnOpenSidebar').click();
    await expect(page.locator('body')).toHaveClass(/cg-sidebar-collapsed/);
    const main=await rect(page,'.hf-app-main');
    const header=await rect(page,'.hf-app-topbar');
    expect(main.left).toBeLessThanOrEqual(1);
    expect(Math.abs(main.width-1920)).toBeLessThanOrEqual(2);
    expect(header.left).toBeLessThanOrEqual(1);
    expect(Math.abs(header.right-1920)).toBeLessThanOrEqual(2);
  });

  test('rate stack, BCV, theme and account controls never overlap', async ({ page }) => {
    await openDashboard(page);
    const selectors=['.hf-rate-card:not(.hf-rate-source)','.hf-rate-source','#btnActualizarTasaTop','#btnTema','#btnUserMenuToggle'];
    const boxes=[];
    for(const selector of selectors){
      const node=page.locator(selector);
      if(await node.isVisible()) boxes.push([selector,await rect(page,selector)]);
    }
    for(let i=0;i<boxes.length;i++) for(let j=i+1;j<boxes.length;j++) {
      expect(overlap(boxes[i][1],boxes[j][1]),`${boxes[i][0]} overlaps ${boxes[j][0]}`).toBe(false);
    }
    const rate=await rect(page,'.hf-rate-card:not(.hf-rate-source)');
    const source=await rect(page,'.hf-rate-source');
    expect(source.top).toBeGreaterThanOrEqual(rate.bottom-1);
  });
});

for (const width of [1366,1440,1600]) {
  test(`desktop shell degrades without collisions at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height:900 });
    await openDashboard(page);
    const audit=await page.evaluate(() => ({
      viewport:innerWidth,
      scrollWidth:document.documentElement.scrollWidth,
      headerRight:document.querySelector('.hf-app-topbar')?.getBoundingClientRect().right,
      visibleActions:[...document.querySelectorAll('.hf-app-topbar-actions>*')].filter((n)=>getComputedStyle(n).display!=='none').map((n)=>({ id:n.id, cls:n.className, r:n.getBoundingClientRect().toJSON() }))
    }));
    expect(audit.scrollWidth).toBeLessThanOrEqual(width+1);
    expect(audit.headerRight).toBeLessThanOrEqual(width+1);
    const actions=audit.visibleActions;
    for(let i=0;i<actions.length;i++) for(let j=i+1;j<actions.length;j++) {
      expect(overlap(actions[i].r,actions[j].r),JSON.stringify({width,a:actions[i],b:actions[j]},null,2)).toBe(false);
    }
  });
}

test.describe('enterprise shell phone behavior', () => {
  test.use({ viewport:{ width:390, height:844 } });

  test('header is a single 56px row and page never widens', async ({ page }) => {
    await openDashboard(page);
    const header=await rect(page,'.hf-app-topbar');
    expect(header.height).toBeLessThanOrEqual(58);
    const audit=await page.evaluate(()=>({innerWidth,doc:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
    expect(audit.doc).toBeLessThanOrEqual(391);
    expect(audit.body).toBeLessThanOrEqual(391);
  });

  test('mobile side navigation is a compact overlay with only the active group expanded', async ({ page }) => {
    await openDashboard(page);
    await page.locator('#btnOpenSidebar').click();
    await expect(page.locator('body')).toHaveClass(/cg-menu-open/);
    const sidebar=await rect(page,'.hf-app-sidebar');
    const main=await rect(page,'.hf-app-main');
    expect(sidebar.width).toBeLessThanOrEqual(264.5);
    expect(sidebar.left).toBeGreaterThanOrEqual(-1);
    expect(main.left).toBeLessThanOrEqual(1);
    expect(Math.abs(main.width-390)).toBeLessThanOrEqual(2);
    await expect(page.locator('#sidebarBackdrop')).toBeVisible();
    const expanded=await page.locator('.hf-menu-section[open]').count();
    expect(expanded).toBeLessThanOrEqual(1);
  });

  test('shell uses moderate typography weights', async ({ page }) => {
    await openDashboard(page);
    await page.locator('#btnOpenSidebar').click();
    const weights=await page.evaluate(()=>({
      menu:getComputedStyle(document.querySelector('.hf-menu-item')).fontWeight,
      button:getComputedStyle(document.querySelector('.page-tab')).fontWeight,
      heading:getComputedStyle(document.querySelector('.cgx-page-header h1, .hf-page-head h2, .pl-header h2') || document.querySelector('.hf-topbar-left strong')).fontWeight
    }));
    expect(Number(weights.menu)).toBeLessThanOrEqual(600);
    expect(Number(weights.button)).toBeLessThanOrEqual(600);
    expect(Number(weights.heading)).toBeLessThanOrEqual(700);
  });

  test('account menu has no initials badge and settings remains reachable', async ({ page }) => {
    await openDashboard(page);
    await expect(page.locator('.hf-avatar-button')).toBeHidden();
    await page.locator('#btnUserMenuToggle').click();
    await expect(page.locator('#userMenuPanel')).toBeVisible();
    await expect(page.locator('#btnUserMenuToggle')).toHaveAttribute('aria-expanded','true');
    const panel=await rect(page,'#userMenuPanel');
    expect(panel.right).toBeLessThanOrEqual(390);
    expect(panel.left).toBeGreaterThanOrEqual(0);
    await page.locator('[data-user-action="settings"]').click();
    await expect(page).toHaveURL(/module=configuracion/);
  });

  test('theme switches light to dark in one click and only audited choices remain', async ({ page }) => {
    await openDashboard(page);
    await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
    await page.locator('#btnTema').click();
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
    await page.locator('#btnUserMenuToggle').click();
    const themes=await page.locator('#userMenuTheme option').evaluateAll((items)=>items.map((item)=>item.value));
    expect(themes).toEqual(['light','dark']);
  });
});