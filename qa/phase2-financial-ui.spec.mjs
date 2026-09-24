import { test, expect } from '@playwright/test';
import { waitForStableLayout } from './support/playwright-determinism.mjs';

async function seedAuthenticatedUi(page) {
  await page.addInitScript(() => {
    localStorage.setItem('contagest_auth_session', JSON.stringify({
      sessionMode:'cookie', mode:'cookie', tenantId:'qa-tenant',
      tenant:{id:'qa-tenant',name:'ContaGest QA',rif:'J-00000000-0',plan:'enterprise'},
      user:{id:'qa-admin',name:'QA Admin',fullName:'QA Admin',email:'qa@contagest.local',role:'admin',permissions:['*']},
      audience:'staff',expiresAt:Date.now()+8*60*60*1000
    }));
  });
}

async function openRoute(page, route, width=390, height=844) {
  await page.setViewportSize({width,height});
  await seedAuthenticatedUi(page);
  await page.goto(`/?module=${route}`,{waitUntil:'domcontentloaded'});
  await page.waitForSelector('.hf-app-topbar',{state:'visible'});
  await waitForStableLayout(page,'#pages');
}

for (const route of ['compras','bancos','nomina','kardex']) {
  test(`${route}: migrated financial/operations UI stays viewport bounded`, async ({page}) => {
    await openRoute(page,route);
    const audit=await page.evaluate(()=>({viewport:innerWidth,doc:document.documentElement.scrollWidth,body:document.body.scrollWidth,font:getComputedStyle(document.body).fontFamily.toLowerCase()}));
    expect(audit.doc).toBeLessThanOrEqual(audit.viewport+1);
    expect(audit.body).toBeLessThanOrEqual(audit.viewport+1);
    expect(audit.font).toContain('inter');
  });
}

test('purchases keeps creation, synchronization and reversal hooks', async ({page}) => {
  await openRoute(page,'compras',1024,768);
  await expect(page.locator('#purchaseForm')).toBeVisible();
  await expect(page.locator('#btnSyncPurchases')).toBeVisible();
  await expect(page.locator('.cg-ui-table')).toBeVisible();
});

test('banking keeps account, movement, import and export contracts', async ({page}) => {
  await openRoute(page,'bancos',1024,768);
  await expect(page.locator('#bankAccountForm')).toBeVisible();
  await expect(page.locator('#bankForm')).toBeVisible();
  await expect(page.locator('#bankStatementFile')).toHaveCount(1);
  await expect(page.locator('#btnBankImport')).toBeVisible();
  await expect(page.locator('#btnBankExport')).toBeVisible();
});

test('payroll keeps employee, receipt, period and export contracts', async ({page}) => {
  await openRoute(page,'nomina',1024,768);
  await expect(page.locator('#employeeForm')).toBeVisible();
  await expect(page.locator('#payrollForm')).toBeVisible();
  await expect(page.locator('#btnPayrollRefresh')).toBeVisible();
  await expect(page.locator('#btnPayrollExport')).toBeVisible();
});

test('kardex uses canonical ERP table when inventory exists', async ({page}) => {
  await openRoute(page,'kardex',1024,768);
  await expect(page.locator('.cg-ui-table')).toBeVisible();
  const numericCells=page.locator('.cg-ui-table td.cg-u-text-mono');
  expect(await numericCells.count()).toBeGreaterThan(0);
});
