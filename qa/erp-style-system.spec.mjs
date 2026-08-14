import { test, expect } from '@playwright/test';

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

async function openDashboard(page, width, height = 900) {
  await page.setViewportSize({ width, height });
  await seedAuthenticatedUi(page);
  await page.goto('/?module=dashboard', { waitUntil:'domcontentloaded' });
  await page.waitForSelector('.hf-app-topbar', { state:'visible' });
  await page.waitForTimeout(150);
}

const overlap = (a,b) => Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left)) > 1
  && Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)) > 1;

for (const viewport of [
  { name:'phone', width:390, height:844 },
  { name:'tablet-portrait', width:768, height:1024 },
  { name:'tablet-landscape', width:1024, height:768 },
  { name:'desktop', width:1440, height:900 }
]) {
  test(`${viewport.name}: universal ERP style system keeps viewport bounded`, async ({ page }) => {
    await openDashboard(page, viewport.width, viewport.height);
    const audit = await page.evaluate(() => ({
      innerWidth,
      doc:document.documentElement.scrollWidth,
      body:document.body.scrollWidth,
      font:getComputedStyle(document.body).fontFamily,
      weight:getComputedStyle(document.body).fontWeight,
      sidebar:getComputedStyle(document.documentElement).getPropertyValue('--cg-sidebar').trim(),
      header:getComputedStyle(document.documentElement).getPropertyValue('--cg-header').trim()
    }));
    expect(audit.doc).toBeLessThanOrEqual(viewport.width + 1);
    expect(audit.body).toBeLessThanOrEqual(viewport.width + 1);
    expect(audit.font.toLowerCase()).toContain('inter');
    expect(Number(audit.weight)).toBeLessThanOrEqual(500);
    expect(audit.sidebar).toBe('248px');
    expect(audit.header).toBe('64px');
  });
}

test('tablet drawer overlays content instead of squeezing it', async ({ page }) => {
  await openDashboard(page, 768, 1024);
  await page.locator('#btnOpenSidebar').click();
  const audit = await page.evaluate(() => {
    const sidebar=document.querySelector('.hf-app-sidebar')?.getBoundingClientRect();
    const main=document.querySelector('.hf-app-main')?.getBoundingClientRect();
    return { sidebar, main, viewport:innerWidth };
  });
  expect(audit.sidebar.width).toBeLessThanOrEqual(264.5);
  expect(audit.main.left).toBeLessThanOrEqual(1);
  expect(Math.abs(audit.main.width-audit.viewport)).toBeLessThanOrEqual(2);
  await expect(page.locator('#sidebarBackdrop')).toBeVisible();
});

test('desktop header actions remain collision free under canonical cascade', async ({ page }) => {
  await openDashboard(page, 1440, 900);
  const boxes = await page.evaluate(() => [...document.querySelectorAll('.hf-app-topbar-actions>*')]
    .filter((node)=>getComputedStyle(node).display!=='none')
    .map((node)=>({ id:node.id, className:node.className, rect:node.getBoundingClientRect().toJSON() })));
  for(let i=0;i<boxes.length;i++) for(let j=i+1;j<boxes.length;j++) {
    expect(overlap(boxes[i].rect,boxes[j].rect),`${boxes[i].id||boxes[i].className} overlaps ${boxes[j].id||boxes[j].className}`).toBe(false);
  }
});

test('reusable ERP primitives are exported from the UI barrel', async () => {
  const ui = await import('../frontend/src/components/ui/index.js');
  for (const key of ['Stack','Row','Grid','Card','PageHeader','Button','Field','Badge','EmptyState','DataTable']) {
    expect(typeof ui[key], `${key} export`).toBe('function');
  }
});
