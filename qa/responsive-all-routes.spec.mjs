import { test, expect } from '@playwright/test';

const ROUTES = [
  'dashboard','cotizacion','clientes','ventas','inventario','tributos','normativa','historial','reportes',
  'contabilidad','libro-mayor','balance-sumas-saldos','hoja-trabajo','estados-financieros','cierre-contable',
  'bancos','nomina','proveedores','compras','auditoria','configuracion','ayuda','tasks','profile','mobile',
  'libro-ventas','marca','admin','backend','vistas','plan-cuentas','rrhh','analytics','qr','inventario-scan',
  'pedidos','pos-sede','tracking-pedidos','delivery-mapa','asistente-ia','soporte','demo-control',
  'modulos-madurez','reglas-negocio','licencias','importacion-data','kardex','normativa-contable','pretesting',
  'salud','veterinaria','gimnasio','rutinas','nutricion','mensajes'
];

const PHONE_VIEWPORTS = [
  { name:'phone-360', width:360, height:800 },
  { name:'phone-390', width:390, height:844 },
  { name:'phone-430', width:430, height:932 }
];

async function seedAuthenticatedUi(page) {
  await page.addInitScript(() => {
    localStorage.setItem('contagest_auth_session', JSON.stringify({
      sessionMode:'cookie',
      mode:'cookie',
      tenantId:'qa-tenant',
      tenant:{ id:'qa-tenant', name:'ContaGest QA', rif:'00000000', plan:'enterprise' },
      user:{ id:'qa-admin', name:'QA Admin', fullName:'QA Admin', email:'qa@contagest.local', role:'admin', permissions:['*'] },
      audience:'staff',
      expiresAt:Date.now() + 8 * 60 * 60 * 1000
    }));
  });
}

async function openRoute(page, route) {
  await page.goto(`/?module=${route}`, { waitUntil:'domcontentloaded' });
  await page.waitForSelector('#pages', { state:'attached', timeout:15_000 });
  await page.waitForTimeout(180);
}

async function viewportAudit(page) {
  return page.evaluate(() => {
    const width = window.innerWidth;
    const doc = document.documentElement;
    const body = document.body;
    const selectorsAllowedToScroll = [
      '.table-wrap','.pl-table-wrap','.ds-table-wrap','.cgv-table-shell','.cgx-table-wrap','.hf-quickbar',
      '.hf-command-results','.hf-user-panel','#mainMenu'
    ].join(',');
    const ignoredShell = '.hf-sidebar,#sidebarBackdrop,.hf-command-layer,.cg-loading-overlay';
    const offenders = [...document.querySelectorAll('body *')]
      .filter((node) => {
        if (!(node instanceof HTMLElement)) return false;
        if (node.closest(selectorsAllowedToScroll) || node.closest(ignoredShell)) return false;
        const style = getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
        const rect = node.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) return false;
        return rect.right > width + 2 || rect.left < -2;
      })
      .slice(0, 8)
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          tag:node.tagName.toLowerCase(),
          id:node.id || '',
          className:String(node.className || '').slice(0, 120),
          left:Math.round(rect.left),
          right:Math.round(rect.right),
          width:Math.round(rect.width)
        };
      });
    return {
      viewport:width,
      documentScrollWidth:doc.scrollWidth,
      bodyScrollWidth:body.scrollWidth,
      offenders
    };
  });
}

for (const viewport of PHONE_VIEWPORTS) {
  test.describe(`responsive ${viewport.name}`, () => {
    test.use({ viewport:{ width:viewport.width, height:viewport.height } });

    for (const route of ROUTES) {
      test(`${route} stays inside viewport`, async ({ page }) => {
        await seedAuthenticatedUi(page);
        await openRoute(page, route);
        const audit = await viewportAudit(page);
        expect(audit.documentScrollWidth, JSON.stringify(audit, null, 2)).toBeLessThanOrEqual(viewport.width + 1);
        expect(audit.bodyScrollWidth, JSON.stringify(audit, null, 2)).toBeLessThanOrEqual(viewport.width + 1);
        expect(audit.offenders, JSON.stringify(audit, null, 2)).toEqual([]);
      });
    }
  });
}

test.describe('mobile shell interaction contract', () => {
  test.use({ viewport:{ width:390, height:844 } });

  test('theme toggles Claro ↔ Oscuro in one click', async ({ page }) => {
    await seedAuthenticatedUi(page);
    await openRoute(page, 'dashboard');
    await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
    await page.locator('#btnTema').click();
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
    await page.locator('#btnTema').click();
    await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
  });

  test('account control opens menu and reaches settings', async ({ page }) => {
    await seedAuthenticatedUi(page);
    await openRoute(page, 'dashboard');
    await expect(page.locator('.hf-avatar-button')).toBeHidden();
    await page.locator('#btnUserMenuToggle').click();
    await expect(page.locator('#userMenuPanel')).toBeVisible();
    await page.locator('[data-user-action="settings"]').click();
    await expect(page).toHaveURL(/module=configuracion/);
  });

  test('quick navigation is touch-scrollable without floating arrows', async ({ page }) => {
    await seedAuthenticatedUi(page);
    await openRoute(page, 'dashboard');
    await expect(page.locator('.hf-quick-arrow').first()).toBeHidden();
    const quickbar = page.locator('#quickTabs');
    await expect(quickbar).toBeVisible();
    const overflow = await quickbar.evaluate((node) => ({ scrollWidth:node.scrollWidth, clientWidth:node.clientWidth, overflowX:getComputedStyle(node).overflowX }));
    expect(['auto','scroll']).toContain(overflow.overflowX);
  });
});
