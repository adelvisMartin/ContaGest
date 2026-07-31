import { test, expect } from '@playwright/test';

async function installEnterpriseMocks(page) {
  await page.addInitScript(() => {
    localStorage.setItem('contagest_auth_session', JSON.stringify({
      token:'playwright-enterprise-session',
      tenantId:'tenant-enterprise-qa',
      expiresAt:Date.now() + 60 * 60 * 1000,
      mode:'qa'
    }));
    localStorage.setItem('contagest_auto_sync_enabled','false');
    localStorage.setItem('contagest_analytics_backend_enabled','false');
  });

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const method = request.method();

    if (method !== 'GET') {
      return route.fulfill({
        status:200,
        contentType:'application/json',
        body:JSON.stringify({ ok:true, data:{ id:`qa-${Date.now()}`, ...(request.postDataJSON?.() || {}) } })
      });
    }

    let data = [];
    if (path === '/banking/summary') data = { accounts:[], movements:[], pending:0, reconciliationRate:100 };
    else if (path === '/ai/status') data = { provider:'deterministic', model:'operational', indicators:{ lowStock:0, openSales:0, overdueSales:0, unpostedLedger:0 }, snapshotAt:new Date().toISOString() };
    else if (path === '/verticals/health/summary') data = { patients:{ humans:0, animals:0 }, appointmentsToday:{ total:0, upcoming:0 }, encountersThisMonth:0, vaccinesDue:0 };
    else if (path === '/verticals/gym/summary') data = { members:{ active:0, total:0 }, memberships:{ active:0, expiring:0 }, checkinsToday:0, revenueThisMonth:0 };

    return route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify({ ok:true, data }) });
  });
}

async function expectNoOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    viewport:document.documentElement.clientWidth,
    document:document.documentElement.scrollWidth,
    body:document.body.scrollWidth
  }));
  expect(dimensions.document, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.viewport + 2);
  expect(dimensions.body, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.viewport + 2);
}

const modules = [
  { route:'tasks', heading:'Tareas y seguimiento', query:'view=board', mui:true },
  { route:'bancos', heading:'Bancos y conciliación', query:'status=pending', mui:true },
  { route:'nomina', heading:'Nómina por períodos', query:'status=Borrador', mui:true },
  { route:'reportes', heading:'Reportes y análisis', query:'tab=operations', mui:false },
  { route:'salud', heading:'Gestión médica por especialidades', query:'tab=history', mui:true },
  { route:'gimnasio', heading:'Control integral de gimnasio', query:'tab=members', mui:true },
  { route:'analytics', heading:'Uso, rendimiento y errores', query:'type=runtime_error', mui:false },
  { route:'asistente-ia', heading:'Asistente operativo IA', query:'', mui:false }
];

for (const module of modules) {
  test(`${module.route} loads with compact enterprise shell and deep link`, async ({ page }) => {
    await page.setViewportSize({ width:1440, height:900 });
    await installEnterpriseMocks(page);
    await page.goto(`/?module=${module.route}${module.query ? `&${module.query}` : ''}`, { waitUntil:'domcontentloaded' });
    await expect(page.locator('body')).toHaveAttribute('data-route', module.route);
    await expect(page.getByRole('heading', { name:module.heading, exact:true }).first()).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`module=${module.route}`));
    if (module.query) await expect(page).toHaveURL(new RegExp(module.query.split('=')[0]));
    if (module.mui) await expect(page.locator('.MuiFormControl-root,.MuiTextField-root').first()).toBeVisible();
    await expectNoOverflow(page);
  });
}

test('mobile shell remains usable across strengthened modules', async ({ page }) => {
  await page.setViewportSize({ width:375, height:812 });
  await installEnterpriseMocks(page);
  for (const route of ['tasks','bancos','nomina','reportes','salud','gimnasio','analytics','asistente-ia']) {
    await page.goto(`/?module=${route}`, { waitUntil:'domcontentloaded' });
    await expect(page.locator('body')).toHaveAttribute('data-route', route);
    await expectNoOverflow(page);
  }
});
