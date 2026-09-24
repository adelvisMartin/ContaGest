import { test, expect } from '@playwright/test';
import { waitForRouteReady, waitForStableLayout } from './support/playwright-determinism.mjs';

const ROUTES = [
  'dashboard','cotizacion','clientes','ventas','inventario','tributos','normativa','historial','reportes',
  'contabilidad','libro-mayor','balance-sumas-saldos','hoja-trabajo','estados-financieros','cierre-contable',
  'bancos','nomina','proveedores','compras','auditoria','configuracion','ayuda','tasks','profile','mobile',
  'libro-ventas','marca','admin','backend','vistas','plan-cuentas','rrhh','analytics','qr','inventario-scan',
  'pedidos','pos-sede','tracking-pedidos','delivery-mapa','asistente-ia','soporte','demo-control',
  'modulos-madurez','reglas-negocio','licencias','importacion-data','kardex','normativa-contable','pretesting',
  'salud','veterinaria','psicologia','gimnasio','rutinas','nutricion','mensajes'
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
  await waitForRouteReady(page,route);
}

async function viewportAudit(page) {
  return page.evaluate(() => {
    const width = window.innerWidth;
    const doc = document.documentElement;
    const body = document.body;
    const selectorsAllowedToScroll = [
      '.table-wrap','.pl-table-wrap','.ds-table-wrap','.cgv-table-shell','.cgx-table-wrap','.cg-ui-table-wrap',
      '.MuiTableContainer-root','.MuiTabs-scroller','.MuiMenu-list','.hf-quickbar','.hf-command-results','.hf-user-panel','#mainMenu'
    ].join(',');
    const ignoredShell = '.hf-sidebar,#sidebarBackdrop,.hf-command-layer,.cg-loading-overlay,.MuiPopover-root,.MuiModal-root';
    const visible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
      const rect = node.getBoundingClientRect();
      return rect.width >= 2 && rect.height >= 2;
    };
    const offenders = [...document.querySelectorAll('body *')]
      .filter((node) => {
        if (!visible(node)) return false;
        if (node.closest(selectorsAllowedToScroll) || node.closest(ignoredShell)) return false;
        const rect = node.getBoundingClientRect();
        return rect.right > width + 2 || rect.left < -2;
      })
      .slice(0, 8)
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return { tag:node.tagName.toLowerCase(), id:node.id || '', className:String(node.className || '').slice(0,120), left:Math.round(rect.left), right:Math.round(rect.right), width:Math.round(rect.width) };
      });

    const intersection = (a,b) => ({ x:Math.min(a.right,b.right)-Math.max(a.left,b.left), y:Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top) });
    const overlapPairs = (nodes) => {
      const items = nodes.filter(visible).map((node) => ({ node, rect:node.getBoundingClientRect() }));
      const overlaps=[];
      for (let i=0;i<items.length;i+=1) for (let j=i+1;j<items.length;j+=1) {
        const left=items[i],right=items[j];
        if (left.node.contains(right.node) || right.node.contains(left.node)) continue;
        if (left.node.closest('form') !== right.node.closest('form')) continue;
        const hit=intersection(left.rect,right.rect);
        if (hit.x > 3 && hit.y > 3) overlaps.push(`${left.node.className || left.node.tagName} <> ${right.node.className || right.node.tagName}`);
        if (overlaps.length >= 8) return overlaps;
      }
      return overlaps;
    };
    const fields=[...document.querySelectorAll('form .cgx-field')].filter((node)=>!node.parentElement?.closest('.cgx-field'));
    const actionNodes=[...document.querySelectorAll('.cgx-page-actions > *, .cgx-section-actions > *, .cg-row-actions > *')];
    return {
      viewport:width,
      documentScrollWidth:doc.scrollWidth,
      bodyScrollWidth:body.scrollWidth,
      offenders,
      fieldOverlaps:overlapPairs(fields),
      actionOverlaps:overlapPairs(actionNodes)
    };
  });
}

for (const viewport of PHONE_VIEWPORTS) {
  test.describe(`responsive ${viewport.name}`, () => {
    test.use({ viewport:{ width:viewport.width, height:viewport.height } });

    for (const route of ROUTES) {
      test(`${route} stays inside viewport without form/action overlap`, async ({ page }) => {
        await seedAuthenticatedUi(page);
        await openRoute(page, route);
        const audit = await viewportAudit(page);
        expect(audit.documentScrollWidth, JSON.stringify(audit, null, 2)).toBeLessThanOrEqual(viewport.width + 1);
        expect(audit.bodyScrollWidth, JSON.stringify(audit, null, 2)).toBeLessThanOrEqual(viewport.width + 1);
        expect(audit.offenders, JSON.stringify(audit, null, 2)).toEqual([]);
        expect(audit.fieldOverlaps, JSON.stringify(audit, null, 2)).toEqual([]);
        expect(audit.actionOverlaps, JSON.stringify(audit, null, 2)).toEqual([]);
      });
    }
  });
}

test.describe('mobile shell interaction contract v11.21', () => {
  test.use({ viewport:{ width:390, height:844 } });

  test('header keeps logo, compact search, minimal BCV and account controls aligned', async ({ page }) => {
    await seedAuthenticatedUi(page);
    await openRoute(page, 'dashboard');
    const selectors=['#btnOpenSidebar','.hf-header-brand','#btnCommandPalette','.hf-rate-compact','#btnTema','#btnUserMenu'];
    for (const selector of selectors) await expect(page.locator(selector)).toBeVisible();
    const geometry=await page.evaluate((selectors) => selectors.map((selector)=>{const node=document.querySelector(selector);const rect=node.getBoundingClientRect();return{selector,width:rect.width,height:rect.height,centerY:rect.top+rect.height/2};}), selectors);
    const centers=geometry.map((item)=>item.centerY);
    expect(Math.max(...centers)-Math.min(...centers), JSON.stringify(geometry,null,2)).toBeLessThanOrEqual(4);
    expect(geometry.find((item)=>item.selector==='.hf-rate-compact').width).toBeLessThanOrEqual(80);
    expect(geometry.find((item)=>item.selector==='.hf-header-brand').width).toBeLessThanOrEqual(30);
    expect(geometry.find((item)=>item.selector==='#btnCommandPalette').width).toBeLessThanOrEqual(36);
  });

  test('theme toggles and account menu remain reachable', async ({ page }) => {
    await seedAuthenticatedUi(page);
    await openRoute(page, 'dashboard');
    await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
    await page.locator('#btnTema').click();
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
    await page.locator('#btnUserMenu').click();
    await expect(page.locator('#userMenuPanel')).toBeVisible();
    await page.locator('[data-user-action="settings"]').click();
    await expect(page).toHaveURL(/module=configuracion/);
  });

  test('quick navigation remains touch-scrollable', async ({ page }) => {
    await seedAuthenticatedUi(page);
    await openRoute(page, 'dashboard');
    const quickbar = page.locator('#quickTabs');
    await expect(quickbar).toBeVisible();
    const overflow = await quickbar.evaluate((node) => ({ scrollWidth:node.scrollWidth, clientWidth:node.clientWidth, overflowX:getComputedStyle(node).overflowX }));
    expect(['auto','scroll']).toContain(overflow.overflowX);
  });

  test('psychology migrated fields expose one visible label per control', async ({ page }) => {
    await seedAuthenticatedUi(page);
    await openRoute(page, 'psicologia');
    await page.waitForSelector('#psychAppointmentForm [data-cgx-kit]', { timeout:10_000 });
    await waitForStableLayout(page,'#psychAppointmentForm');
    const audit=await page.locator('#psychAppointmentForm [data-cgx-kit]').evaluateAll((hosts)=>hosts.map((host)=>{
      const visible=(node)=>{if(!node)return false;const style=getComputedStyle(node);const rect=node.getBoundingClientRect();return style.display!=='none'&&style.visibility!=='hidden'&&rect.width>1&&rect.height>1;};
      const legacy=[...host.querySelectorAll(':scope > label, :scope > span')].filter(visible).length;
      const floating=[...host.querySelectorAll('.MuiInputLabel-root')].filter(visible).length;
      return { kit:host.getAttribute('data-cgx-kit'), legacy, floating };
    }));
    for (const item of audit) {
      expect(item.legacy, JSON.stringify(audit,null,2)).toBeLessThanOrEqual(1);
      expect(item.floating, JSON.stringify(audit,null,2)).toBe(0);
    }
  });
});
